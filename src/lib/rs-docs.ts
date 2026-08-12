// Capture des documents d'assurance depuis les réponses courtier (Front) →
// stockage Supabase + typage par CONTENU (relevé de sinistralité vs contrat MRI).
// Réutilisés en aval : RS → demandes de devis (AXA/Mila) ; contrat MRI → comparaison.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DocKind = "rs" | "contrat_mri" | "devis_axa" | "devis_mila" | "autre";
export const DOC_LABEL: Record<DocKind, string> = { rs: "RS", contrat_mri: "Contrat MRI", devis_axa: "Devis AXA", devis_mila: "Devis Mila", autre: "Document" };

type FrontAttachment = { id?: string; filename?: string; url?: string; content_type?: string; size?: number };

// Vrai document (PDF/Word/Excel), hors images inline (logo/signature).
function isRealDoc(a: FrontAttachment): boolean {
  const ct = (a.content_type || "").toLowerCase();
  const fn = (a.filename || "").toLowerCase();
  if (/^image\d+\.(png|gif|jpe?g)$/.test(fn) || /logo|signature/.test(fn)) return false;
  return ct.includes("pdf") || ct.includes("word") || ct.includes("sheet") || ct.includes("excel") || /\.(pdf|docx?|xlsx?)$/.test(fn);
}

async function frontGetMessage(msgId: string): Promise<{ attachments?: FrontAttachment[] } | null> {
  if (!FRONT_TOKEN) return null;
  const res = await fetch(`${FRONT_API_URL}/messages/${msgId}`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}

async function downloadAttachment(url: string): Promise<Buffer | null> {
  if (!FRONT_TOKEN) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// Typage par contenu : lit le PDF et décide RS / contrat MRI / autre. Nom de
// fichier utilisé en secours si Anthropic indisponible.
export async function classifyInsuranceDoc(pdf: Buffer, filename: string): Promise<DocKind> {
  const fn = filename.toLowerCase();
  const byName = (): DocKind => {
    if (/relev|sinistr|statistiq/.test(fn)) return "rs";
    if (/contrat|police|conditions|attestation/.test(fn)) return "contrat_mri";
    return "autre";
  };
  if (!process.env.ANTHROPIC_API_KEY) return byName();
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 120,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: `Classe ce document d'assurance. Réponds UNIQUEMENT un JSON sans markdown : {"kind":"rs"|"contrat_mri"|"autre"}.\n- "rs" = relevé de sinistralité / statistiques sinistres / historique des sinistres.\n- "contrat_mri" = contrat multirisque immeuble, conditions particulières/générales, police, attestation d'assurance.\n- "autre" = tout le reste.` },
        ],
      }],
    });
    const c = resp.content[0];
    if (c.type !== "text") return byName();
    const raw = c.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    const k = (JSON.parse(raw) as { kind?: string }).kind;
    return k === "rs" || k === "contrat_mri" || k === "autre" ? k : byName();
  } catch { return byName(); }
}

function docName(adresse: string, kind: DocKind, part: number | null): string {
  const base = `${adresse} - ${DOC_LABEL[kind]}`;
  return part ? `${base} partie ${part}` : base;
}

// Capture toutes les PJ PDF des messages entrants donnés → Supabase + PipelineDocument.
// Idempotent (skip si frontAttachmentId déjà stocké). Renvoie le nombre de docs créés.
export async function captureReplyDocs(opts: { pipelineId: string; coproId: string; adresse: string; msgIds: string[]; createdBy?: string; onlyRsContrat?: boolean; forceKind?: DocKind }): Promise<{ created: number; docs: { kind: DocKind; fileName: string }[] }> {
  if (!FRONT_TOKEN) return { created: 0, docs: [] };
  const existing = await prisma.pipelineDocument.findMany({ where: { pipelineId: opts.pipelineId }, select: { frontAttachmentId: true, kind: true } });
  const seen = new Set(existing.map((d) => d.frontAttachmentId).filter(Boolean) as string[]);
  let rsCount = existing.filter((d) => d.kind === "rs").length; // pour la numérotation des parties

  // Rassemble toutes les PJ candidates (avec leur message).
  const candidates: { att: FrontAttachment; msgId: string }[] = [];
  for (const msgId of opts.msgIds) {
    const full = await frontGetMessage(msgId);
    for (const a of full?.attachments ?? []) if (isRealDoc(a) && a.id && a.url && !seen.has(a.id)) { candidates.push({ att: a, msgId }); seen.add(a.id); }
  }
  if (!candidates.length) return { created: 0, docs: [] };

  // Télécharge + classe.
  const classified: { att: FrontAttachment; msgId: string; kind: DocKind; buf: Buffer }[] = [];
  for (const c of candidates) {
    const buf = await downloadAttachment(c.att.url!);
    if (!buf) continue;
    // forceKind : type connu d'avance (ex. devis AXA/Mila) → pas d'appel IA.
    const kind = opts.forceKind ?? await classifyInsuranceDoc(buf, c.att.filename || "");
    classified.push({ ...c, kind, buf });
  }
  const totalRs = rsCount + classified.filter((c) => c.kind === "rs").length;

  const created: { kind: DocKind; fileName: string }[] = [];
  for (const c of classified) {
    if (opts.onlyRsContrat && c.kind === "autre") continue; // ignore devis/propositions/AG
    let part: number | null = null;
    if (c.kind === "rs" && totalRs > 1) part = ++rsCount;
    const fileName = docName(opts.adresse, c.kind, part);
    const storagePath = `insurance/${opts.coproId}/${c.att.id}.pdf`;
    const { error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(storagePath, c.buf, { contentType: "application/pdf", upsert: true });
    if (error) continue;
    await prisma.pipelineDocument.create({ data: { pipelineId: opts.pipelineId, coproId: opts.coproId, kind: c.kind, part, storagePath, fileName, source: "front", frontAttachmentId: c.att.id, frontMsgId: c.msgId, createdBy: opts.createdBy ?? "auto:scan_replies" } });
    created.push({ kind: c.kind, fileName });
  }
  return { created: created.length, docs: created };
}

// Capture à la demande pour UN dossier (bouton fiche) — indépendante du statut,
// donc marche aussi sur les dossiers déjà avancés (devis/comparaison). Retrouve la
// conversation d'envoi + les entrants, puis délègue à captureReplyDocs.
export async function captureDocsForPipeline(pipelineId: string, createdBy?: string): Promise<{ created: number; docs: { kind: DocKind; fileName: string }[]; noReply?: boolean }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { coproId: true, rs4SentAt: true, copro: { select: { nom: true, adresse: true } } } });
  if (!p) return { created: 0, docs: [] };
  const markChecked = () => prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { docsCheckedAt: new Date() } }).catch(() => {});
  if (!FRONT_TOKEN) { await markChecked(); return { created: 0, docs: [], noReply: true }; }
  const adresse = p.copro.adresse || p.copro.nom;
  const sentMs = p.rs4SentAt ? new Date(p.rs4SentAt).getTime() : 0;
  const convMsgs = async (cid: string) => {
    const res = await fetch(`${FRONT_API_URL}/conversations/${cid}/messages?limit=25`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
    return res.ok ? (((await res.json())._results as { id: string; is_inbound: boolean; created_at: number }[]) ?? []) : [];
  };
  const cidsFrom = (evs: { metadata: unknown }[]) => [...new Set(evs.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean) as string[])];

  const draftEv = await prisma.pipelineEvent.findMany({ where: { pipelineId, metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } });
  const devisEv = await prisma.pipelineEvent.findMany({ where: { pipelineId, metadata: { path: ["devisType"], equals: "devis_sent" } }, select: { metadata: true } });
  const draftCids = cidsFrom(draftEv), devisCids = cidsFrom(devisEv);

  let created = 0; const docs: { kind: DocKind; fileName: string }[] = [];
  // 1) Demandes de RS envoyées via Gufetto → PJ ENTRANTES (réponse courtier).
  for (const cid of draftCids) {
    const inbound = (await convMsgs(cid)).filter((m) => m.is_inbound && m.created_at * 1000 > sentMs);
    if (!inbound.length) continue;
    const r = await captureReplyDocs({ pipelineId, coproId: p.coproId, adresse, msgIds: inbound.map((m) => m.id), createdBy });
    created += r.created; docs.push(...r.docs);
  }
  // 2) Demandes de devis envoyées via Gufetto → PJ SORTANTES (RS/contrat qu'on a joints).
  for (const cid of devisCids) {
    const outbound = (await convMsgs(cid)).filter((m) => !m.is_inbound);
    if (!outbound.length) continue;
    const r = await captureReplyDocs({ pipelineId, coproId: p.coproId, adresse, msgIds: outbound.map((m) => m.id), createdBy, onlyRsContrat: true });
    created += r.created; docs.push(...r.docs);
  }
  await markChecked();
  return { created, docs, noReply: draftCids.length === 0 && devisCids.length === 0 };
}

// Compteur global : nb de dossiers ayant au moins un RS / un contrat MRI récupéré.
// EXCLUT les dossiers en ODR (parcours distinct).
export async function getDocsStats(): Promise<{ rs: number; contrat: number }> {
  const distinctPipes = async (kind: DocKind) =>
    (await prisma.pipelineDocument.findMany({ where: { kind, pipeline: { statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] } } }, select: { pipelineId: true }, distinct: ["pipelineId"] })).length;
  return { rs: await distinctPipes("rs"), contrat: await distinctPipes("contrat_mri") };
}

// Ajout MANUEL d'un document (upload depuis le Drive). Typé automatiquement par
// contenu (corrigeable ensuite via le menu type). source = "manuel".
export async function addManualDoc(opts: { pipelineId: string; coproId: string; adresse: string; buffer: Buffer; filename: string; createdBy?: string }): Promise<{ ok: boolean; kind?: DocKind; fileName?: string; error?: string }> {
  const kind = await classifyInsuranceDoc(opts.buffer, opts.filename);
  const rsCount = await prisma.pipelineDocument.count({ where: { pipelineId: opts.pipelineId, kind: "rs" } });
  const part = kind === "rs" && rsCount >= 1 ? rsCount + 1 : null;
  const fileName = docName(opts.adresse, kind, part);
  const storagePath = `insurance/${opts.coproId}/manual-${crypto.randomUUID()}.pdf`;
  const { error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(storagePath, opts.buffer, { contentType: "application/pdf", upsert: true });
  if (error) return { ok: false, error: error.message };
  await prisma.pipelineDocument.create({ data: { pipelineId: opts.pipelineId, coproId: opts.coproId, kind, part, storagePath, fileName, source: "manuel", createdBy: opts.createdBy ?? "manuel" } });
  return { ok: true, kind, fileName };
}

export type PipelineDoc = { id: string; kind: DocKind; part: number | null; fileName: string; storagePath: string; source: string; createdAt: string };
export async function getPipelineDocuments(pipelineId: string): Promise<PipelineDoc[]> {
  const rows = await prisma.pipelineDocument.findMany({ where: { pipelineId }, orderBy: [{ kind: "asc" }, { part: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, kind: r.kind as DocKind, part: r.part, fileName: r.fileName, storagePath: r.storagePath, source: r.source, createdAt: r.createdAt.toISOString() }));
}

// Suppression d'un document (fichier Supabase + ligne). Le fil Front n'est pas
// touché : « ↻ Récupérer » pourra le réimporter si besoin (unique convId+attach).
export async function deleteDocument(id: string): Promise<{ ok: boolean }> {
  const doc = await prisma.pipelineDocument.findUnique({ where: { id }, select: { storagePath: true } }).catch(() => null);
  if (!doc) return { ok: false };
  await getSupabaseAdmin().storage.from(STORAGE_BUCKET).remove([doc.storagePath]).catch(() => {});
  await prisma.pipelineDocument.delete({ where: { id } });
  return { ok: true };
}

// Correction manuelle du type (recalcule le nom). Réservé aux cas mal classés.
export async function retypeDocument(id: string, kind: DocKind): Promise<{ ok: boolean }> {
  const doc = await prisma.pipelineDocument.findUnique({ where: { id }, select: { coproId: true, part: true } }).catch(() => null);
  if (!doc) return { ok: false };
  const copro = await prisma.copro.findUnique({ where: { id: doc.coproId }, select: { nom: true, adresse: true } });
  const adresse = copro?.adresse || copro?.nom || "";
  await prisma.pipelineDocument.update({ where: { id }, data: { kind, fileName: docName(adresse, kind, kind === "rs" ? doc.part : null), part: kind === "rs" ? doc.part : null } });
  return { ok: true };
}
