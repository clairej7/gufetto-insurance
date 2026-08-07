// Automatisation 4 — Volet 1 : vérification de l'échantillon chargé depuis l'auto 3.
// L'échantillon = dossiers marqués rsBatchAt (encore en « Récupération du RS »),
// mis à jour au fur et à mesure des envois de l'auto 3. On trie en 2 catégories :
//   - infos complètes   = mail courtier + assureur + n° de contrat présents
//   - infos incomplètes = au moins un de ces champs manquant
// (le mail courtier est normalement toujours là, garanti par l'auto 3 ; on le
//  revérifie par sécurité). Le n° de contrat est le champ le plus souvent absent.

import { prisma } from "@/lib/prisma";
import { getSignatureHtml, tagConversation, assignConversation, resolveTeammateId } from "@/lib/front";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const FRONT_CHANNEL_ID = process.env.FRONT_CHANNEL_ID;
const FRONT_AUTHOR_EMAIL = process.env.FRONT_AUTHOR_EMAIL || "bonjour@matera.eu";

// Étapes de relance du Volet 3 : n° de relance + délai (jours depuis l'envoi initial).
export const RELANCE_STAGES = [
  { num: 1, day: 4 },
  { num: 2, day: 8 },
  { num: 3, day: 12 },
] as const;

// Substitution des placeholders {adresse} {assureur} {numeroContrat} {nom}.
function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Texte (markdown léger + sauts de ligne) → HTML, + signature Front en pied.
function renderHtml(text: string, signatureHtml: string | null, hiddenRef: string): string {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return html + (signatureHtml ? `<br>${signatureHtml}` : "") + hiddenRef;
}

// Envoi d'UN mail via Front (channel messages = envoi réel). Best-effort tag +
// assignation au gestionnaire. Renvoie le conversationId ou null si échec.
async function frontSend(opts: { to: string; subject: string; html: string; pipelineId: string; gestionnaireEmail: string | null; authorEmail: string }): Promise<{ ok: boolean; conversationId: string | null; error?: string }> {
  if (!FRONT_TOKEN || !FRONT_CHANNEL_ID) return { ok: false, conversationId: null, error: "Front non configuré" };
  const form = new FormData();
  // Auteur = teammate qui déclenche l'envoi → nom d'expéditeur correct + sa
  // signature (une adresse partagée non-teammate afficherait le nom du channel).
  form.append("author_id", `alt:email:${opts.authorEmail || FRONT_AUTHOR_EMAIL}`);
  form.append("to[]", opts.to);
  form.append("subject", opts.subject);
  form.append("body", opts.html);
  form.append("type", "email");
  const res = await fetch(`${FRONT_API_URL}/channels/${FRONT_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
    body: form,
  });
  if (!res.ok) return { ok: false, conversationId: null, error: await res.text() };
  const message = await res.json();
  const convUrl: string = message._links?.related?.conversation || message.conversation?.id || "";
  const conversationId: string = convUrl.startsWith("http") ? convUrl.split("/").pop() || "" : convUrl;
  if (conversationId) {
    await tagConversation(conversationId, ["tag_23n286"]).catch(() => {});
    if (opts.gestionnaireEmail) {
      const tid = await resolveTeammateId(opts.gestionnaireEmail).catch(() => null);
      if (tid) await assignConversation(conversationId, tid).catch(() => {});
    }
  }
  return { ok: true, conversationId: conversationId || null };
}

export type Rs4Row = {
  pipelineId: string;
  nom: string;
  assureur: string | null;
  numeroContrat: string | null;
  courtier: string | null;
  mail: string | null;
  manque: string[]; // champs manquants (pour la catégorie incomplète)
};

export type Rs4Sample = {
  total: number;
  complete: number;
  incomplete: number;
  completeRows: Rs4Row[];
  incompleteRows: Rs4Row[];
};

// Périmètre du Volet 1 = échantillon chargé par l'auto 3 (rsBatchAt) pas encore
// passé au Volet 2 (rs4Volet2At null).
const VOLET1_WHERE = { statut: "rs_en_cours" as const, rsBatchAt: { not: null }, rs4Volet2At: null, copro: { archivedAt: null } };

export async function getRs4Sample(): Promise<Rs4Sample> {
  const ps = await prisma.insurancePipeline.findMany({
    where: VOLET1_WHERE,
    select: { id: true, rsBatchAt: true, copro: { select: { nom: true, assureurActuel: true, numeroContrat: true, courtierActuel: true, contactCourtierEmail: true } } },
    orderBy: { rsBatchAt: "desc" },
  });

  const completeRows: Rs4Row[] = [];
  const incompleteRows: Rs4Row[] = [];
  for (const p of ps) {
    const c = p.copro;
    const mail = c.contactCourtierEmail?.trim() || null;
    const assureur = c.assureurActuel?.trim() || null;
    const numeroContrat = c.numeroContrat?.trim() || null;
    const manque: string[] = [];
    if (!mail) manque.push("mail courtier");
    if (!assureur) manque.push("assureur");
    if (!numeroContrat) manque.push("n° de contrat");
    const row: Rs4Row = { pipelineId: p.id, nom: c.nom, assureur, numeroContrat, courtier: c.courtierActuel?.trim() || null, mail, manque };
    (manque.length === 0 ? completeRows : incompleteRows).push(row);
  }

  return { total: ps.length, complete: completeRows.length, incomplete: incompleteRows.length, completeRows, incompleteRows };
}

// Nb de dossiers encore au Volet 1 (échantillon à vérifier, pas encore passé au 2).
export async function getRs4Volet1Count(): Promise<number> {
  return prisma.insurancePipeline.count({ where: VOLET1_WHERE });
}

// Nb de dossiers passés au Volet 2 (envoi des mails).
export async function getRs4Volet2Count(): Promise<number> {
  return prisma.insurancePipeline.count({ where: { statut: "rs_en_cours", rs4Volet2At: { not: null }, copro: { archivedAt: null } } });
}

// ─── Volet 2 : envoi des demandes de RS ──────────────────────────────────────
// Candidats = passés au volet 2 (rs4Volet2At) mais RS pas encore envoyée (rs4SentAt null).
async function volet2Candidates() {
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4Volet2At: { not: null }, rs4SentAt: null, copro: { archivedAt: null } },
    select: { id: true, copro: { select: { nom: true, adresse: true, assureurActuel: true, numeroContrat: true, courtierActuel: true, contactCourtierEmail: true, gestionnaireEmail: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { id: true, createdAt: true } } },
    orderBy: { rs4Volet2At: "desc" },
  });
  return ps;
}

export type Volet2Data = { total: number; nouveaux: number; dejaEnvoyes: number };
export async function getRs4Volet2Data(): Promise<Volet2Data> {
  const ps = await volet2Candidates();
  const dejaEnvoyes = ps.filter((p) => p.events.length > 0).length;
  return { total: ps.length, nouveaux: ps.length - dejaEnvoyes, dejaEnvoyes };
}

// Envoie la demande de RS aux « nouveaux » (jamais envoyée) et fait passer au
// volet 3 (rs4SentAt). Les dossiers dont la RS était DÉJÀ partie ne sont pas
// re-mailés : on les bascule au volet 3 avec leur date d'envoi d'origine.
// `limit` : n'envoyer qu'un lot de N nouveaux (test) sans toucher au reste.
export async function sendVolet2(actorEmail: string, subjectTpl: string, bodyTpl: string, limit?: number): Promise<{ sent: number; failed: number; movedExisting: number; errors: string[] }> {
  const ps = await volet2Candidates();
  const signature = await getSignatureHtml(actorEmail);
  let sent = 0, failed = 0, movedExisting = 0;
  const errors: string[] = [];
  const now = new Date();

  const nouveaux = ps.filter((p) => p.events.length === 0);
  const deja = ps.filter((p) => p.events.length > 0);
  const toSend = typeof limit === "number" && limit > 0 ? nouveaux.slice(0, limit) : nouveaux;

  for (const p of toSend) {
    const c = p.copro;
    const to = c.contactCourtierEmail?.split(/[;,]/)[0]?.trim() || "";
    if (!to) { failed++; errors.push(`${c.nom} : pas de mail`); continue; }
    const vars = { adresse: c.adresse || c.nom, assureur: c.assureurActuel || "", numeroContrat: c.numeroContrat || "", nom: c.nom };
    const subject = fillTemplate(subjectTpl, vars);
    const html = renderHtml(fillTemplate(bodyTpl, vars), signature, `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${p.id}:rs</span>`);
    const r = await frontSend({ to, subject, html, pipelineId: p.id, gestionnaireEmail: c.gestionnaireEmail, authorEmail: actorEmail });
    if (!r.ok) { failed++; errors.push(`${c.nom} : ${r.error ?? "échec"}`); continue; }
    await prisma.$transaction([
      prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4SentAt: now } }),
      prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Demande de RS envoyée au courtier (${to})`, metadata: { rsType: "draft_sent", relanceNum: 0, to, conversationId: r.conversationId, auto: "rs4_send" }, createdBy: actorEmail } }),
    ]);
    sent++;
  }

  // Un lot limité (test) ne touche pas aux déjà-envoyés ; l'envoi complet, si.
  if (!(typeof limit === "number" && limit > 0)) {
    for (const p of deja) {
      const first = p.events.reduce((a, e) => (e.createdAt < a ? e.createdAt : a), p.events[0].createdAt);
      await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4SentAt: first } });
      movedExisting++;
    }
  }
  return { sent, failed, movedExisting, errors: errors.slice(0, 20) };
}

// ─── Volet 3 : suivi + boucle de relances ────────────────────────────────────
export type Volet3Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; relances: number };
export type Volet3Data = { total: number; rows: Volet3Row[]; stages: { num: number; day: number; eligibles: number }[] };

async function volet3Pipelines() {
  return prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4SentAt: { not: null }, copro: { archivedAt: null } },
    select: { id: true, rs4SentAt: true, copro: { select: { nom: true, adresse: true, courtierActuel: true, contactCourtierEmail: true, gestionnaireEmail: true, numeroContrat: true, assureurActuel: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } } },
    orderBy: { rs4SentAt: "asc" },
  });
}

function relanceCountOf(events: { metadata: unknown }[]): number {
  return events.filter((e) => { const m = e.metadata as { relanceNum?: number } | null; return !!m && typeof m.relanceNum === "number" && m.relanceNum > 0; }).length;
}

export async function getRs4Volet3Data(nowMs: number): Promise<Volet3Data> {
  const ps = await volet3Pipelines();
  const rows: Volet3Row[] = ps.map((p) => {
    const jours = Math.floor((nowMs - new Date(p.rs4SentAt!).getTime()) / 86400000);
    return { pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail, joursDepuisEnvoi: jours, relances: relanceCountOf(p.events) };
  });
  const stages = RELANCE_STAGES.map((s) => ({ num: s.num, day: s.day, eligibles: rows.filter((r) => r.joursDepuisEnvoi >= s.day && r.relances < s.num).length }));
  return { total: rows.length, rows, stages };
}

// Envoie la relance n° `relanceNum` aux dossiers éligibles (J+seuil atteint et
// relance pas encore envoyée). Les dossiers restent au volet 3 jusqu'au RS reçu.
export async function sendRelance(actorEmail: string, relanceNum: number, subjectTpl: string, bodyTpl: string, nowMs: number): Promise<{ sent: number; failed: number; errors: string[] }> {
  const stage = RELANCE_STAGES.find((s) => s.num === relanceNum);
  if (!stage) return { sent: 0, failed: 0, errors: ["relance inconnue"] };
  const ps = await volet3Pipelines();
  const signature = await getSignatureHtml(actorEmail);
  let sent = 0, failed = 0;
  const errors: string[] = [];
  for (const p of ps) {
    const jours = Math.floor((nowMs - new Date(p.rs4SentAt!).getTime()) / 86400000);
    if (jours < stage.day || relanceCountOf(p.events) >= relanceNum) continue;
    const c = p.copro;
    const to = c.contactCourtierEmail?.split(/[;,]/)[0]?.trim() || "";
    if (!to) { failed++; errors.push(`${c.nom} : pas de mail`); continue; }
    const vars = { adresse: c.adresse || c.nom, assureur: c.assureurActuel || "", numeroContrat: c.numeroContrat || "", nom: c.nom, jours: String(jours) };
    const subject = fillTemplate(subjectTpl, vars);
    const html = renderHtml(fillTemplate(bodyTpl, vars), signature, `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${p.id}:rs_relance</span>`);
    const r = await frontSend({ to, subject, html, pipelineId: p.id, gestionnaireEmail: c.gestionnaireEmail, authorEmail: actorEmail });
    if (!r.ok) { failed++; errors.push(`${c.nom} : ${r.error ?? "échec"}`); continue; }
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Relance ${relanceNum} de la demande de RS envoyée (${to})`, metadata: { rsType: "draft_sent", relanceNum, to, conversationId: r.conversationId, auto: "rs4_relance" }, createdBy: actorEmail } });
    sent++;
  }
  return { sent, failed, errors: errors.slice(0, 20) };
}

// (RS reçu = réutilise l'action existante marquerRSRecu → rs_en_cours → devis_demandes.)

// Passe les dossiers « infos complètes » du Volet 1 au Volet 2 (pose rs4Volet2At).
export async function moveCompleteToVolet2(actorEmail: string): Promise<{ moved: number; volet2Total: number }> {
  const sample = await getRs4Sample();
  const now = new Date();
  for (const r of sample.completeRows) {
    await prisma.insurancePipeline.update({ where: { id: r.pipelineId }, data: { rs4Volet2At: now } });
  }
  if (sample.completeRows.length) {
    await prisma.pipelineEvent.createMany({
      data: sample.completeRows.map((r) => ({ pipelineId: r.pipelineId, type: "action_manuelle" as const, description: "Auto 4 — infos complètes, passé au volet 2 (envoi du mail courtier)", metadata: { auto: "rs4_to_volet2" }, createdBy: actorEmail })),
    });
  }
  return { moved: sample.completeRows.length, volet2Total: await getRs4Volet2Count() };
}
