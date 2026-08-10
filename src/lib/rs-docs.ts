// Capture des documents d'assurance depuis les réponses courtier (Front) →
// stockage Supabase + typage par CONTENU (relevé de sinistralité vs contrat MRI).
// Réutilisés en aval : RS → demandes de devis (AXA/Mila) ; contrat MRI → comparaison.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DocKind = "rs" | "contrat_mri" | "autre";
export const DOC_LABEL: Record<DocKind, string> = { rs: "RS", contrat_mri: "Contrat MRI", autre: "Document" };

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
export async function captureReplyDocs(opts: { pipelineId: string; coproId: string; adresse: string; msgIds: string[]; createdBy?: string }): Promise<{ created: number; docs: { kind: DocKind; fileName: string }[] }> {
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
    const kind = await classifyInsuranceDoc(buf, c.att.filename || "");
    classified.push({ ...c, kind, buf });
  }
  const totalRs = rsCount + classified.filter((c) => c.kind === "rs").length;

  const created: { kind: DocKind; fileName: string }[] = [];
  for (const c of classified) {
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

export type PipelineDoc = { id: string; kind: DocKind; part: number | null; fileName: string; storagePath: string; source: string; createdAt: string };
export async function getPipelineDocuments(pipelineId: string): Promise<PipelineDoc[]> {
  const rows = await prisma.pipelineDocument.findMany({ where: { pipelineId }, orderBy: [{ kind: "asc" }, { part: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, kind: r.kind as DocKind, part: r.part, fileName: r.fileName, storagePath: r.storagePath, source: r.source, createdAt: r.createdAt.toISOString() }));
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
