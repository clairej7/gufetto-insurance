// Automatisation 4 — Volet 1 : vérification de l'échantillon chargé depuis l'auto 3.
// L'échantillon = dossiers marqués rsBatchAt (encore en « Récupération du RS »),
// mis à jour au fur et à mesure des envois de l'auto 3. On trie en 2 catégories :
//   - infos complètes   = mail courtier + assureur + n° de contrat présents
//   - infos incomplètes = au moins un de ces champs manquant
// (le mail courtier est normalement toujours là, garanti par l'auto 3 ; on le
//  revérifie par sécurité). Le n° de contrat est le champ le plus souvent absent.

import { prisma } from "@/lib/prisma";
import { getSignatureHtml, tagConversation, assignConversation, resolveTeammateId } from "@/lib/front";
import { getCourtierIndex, prepareSendMails, isMateraInternal } from "@/lib/courtier-audit";
import { getExcludedCoproIds } from "@/lib/exclusions";

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
// Extrait tous les mails valides d'un champ (séparés par , ou ;), sans doublon.
export function parseEmails(field: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of (field ?? "").split(/[;,]/)) {
    const e = raw.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

async function frontSend(opts: { toList: string[]; subject: string; html: string; pipelineId: string; gestionnaireEmail: string | null; authorEmail: string }): Promise<{ ok: boolean; conversationId: string | null; error?: string }> {
  if (!FRONT_TOKEN || !FRONT_CHANNEL_ID) return { ok: false, conversationId: null, error: "Front non configuré" };
  // BARRIÈRE FINALE : jamais d'envoi vers une adresse interne Matera (CS/salarié),
  // quel que soit le chemin qui a construit toList.
  const toList = opts.toList.filter((t) => !isMateraInternal(t));
  if (toList.length !== opts.toList.length) {
    const blocked = opts.toList.filter(isMateraInternal).join(", ");
    if (!toList.length) return { ok: false, conversationId: null, error: `destinataire interne Matera bloqué (${blocked})` };
  }
  if (!toList.length) return { ok: false, conversationId: null, error: "aucun destinataire" };
  const form = new FormData();
  // Auteur = teammate qui déclenche l'envoi → nom d'expéditeur correct + sa
  // signature (une adresse partagée non-teammate afficherait le nom du channel).
  form.append("author_id", `alt:email:${opts.authorEmail || FRONT_AUTHOR_EMAIL}`);
  // UN seul mail, adressé à TOUS les destinataires (plusieurs to[] = plusieurs
  // destinataires du même message, pas plusieurs mails).
  for (const to of toList) form.append("to[]", to);
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
    // Force le statut « resolved » APRÈS le tag/assignation (sinon l'assignation
    // laisse la conv « open »). Une réponse ultérieure du courtier la rouvrira.
    await fetch(`${FRONT_API_URL}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    }).catch(() => {});
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
const volet1Where = (excl: string[]) => ({ statut: "rs_en_cours" as const, rsBatchAt: { not: null }, rs4Volet2At: null, coproId: { notIn: excl }, copro: { archivedAt: null } });

export async function getRs4Sample(): Promise<Rs4Sample> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: volet1Where(excl),
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
  return prisma.insurancePipeline.count({ where: volet1Where(await getExcludedCoproIds()) });
}

// Nb de dossiers passés au Volet 2 (envoi des mails).
export async function getRs4Volet2Count(): Promise<number> {
  return prisma.insurancePipeline.count({ where: { statut: "rs_en_cours", rs4Volet2At: { not: null }, copro: { archivedAt: null } } });
}

// Vérif « adresses perso » : repasse tous les mails de l'échantillon (volet 2 à
// envoyer) et remonte tout mail sur domaine PERSO ou correspondant au mail du CS.
const PERSO_DOM = /@(yahoo|gmail|hotmail|free|orange|wanadoo|sfr|laposte|outlook|live|bbox|icloud|gmx|neuf|aol|hey)\./i;
export type PersoCheck = { total: number; perso: number; csMatch: number; rows: { pipelineId: string; nom: string; courtier: string | null; mail: string | null; motif: string }[] };
export async function checkPersoAddresses(): Promise<PersoCheck> {
  const ps = await volet2Candidates();
  const rows: PersoCheck["rows"] = [];
  let perso = 0, csMatch = 0;
  // besoin du mail CS : volet2Candidates ne le sélectionne pas → requête ciblée
  const cs = new Map<string, string>();
  const coproMails = await prisma.insurancePipeline.findMany({ where: { id: { in: ps.map((p) => p.id) } }, select: { id: true, copro: { select: { contactCsEmail: true } } } });
  for (const c of coproMails) if (c.copro.contactCsEmail) cs.set(c.id, c.copro.contactCsEmail.toLowerCase().trim());
  for (const p of ps) {
    const field = (p.copro.contactCourtierEmail ?? "").trim();
    if (!field) continue;
    const mails = field.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const isPerso = mails.some((m) => PERSO_DOM.test(m));
    const csMail = cs.get(p.id);
    const isCs = !!csMail && mails.some((m) => m.toLowerCase() === csMail);
    if (!isPerso && !isCs) continue;
    if (isPerso) perso++;
    if (isCs) csMatch++;
    rows.push({ pipelineId: p.id, nom: p.copro.nom, courtier: p.copro.courtierActuel, mail: field, motif: isCs ? "= mail du CS" : "domaine perso" });
  }
  return { total: ps.length, perso, csMatch, rows };
}

// ─── Volet 2 : envoi des demandes de RS ──────────────────────────────────────
// Candidats = passés au volet 2 (rs4Volet2At) mais RS pas encore envoyée (rs4SentAt null).
async function volet2Candidates() {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4Volet2At: { not: null }, rs4SentAt: null, coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: { id: true, copro: { select: { nom: true, adresse: true, assureurActuel: true, numeroContrat: true, courtierActuel: true, contactCourtierEmail: true, gestionnaireEmail: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { id: true, createdAt: true } } },
    orderBy: { rs4Volet2At: "desc" },
  });
  return ps;
}

export type Volet2Row = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; numeroContrat: string | null; courtier: string | null; mail: string | null; sendMail: string | null; hold: boolean; holdReason: string };
export type Volet2Data = { total: number; nouveaux: number; dejaEnvoyes: number; sent: number; rows: Volet2Row[] };
export async function getRs4Volet2Data(): Promise<Volet2Data> {
  const ps = await volet2Candidates();
  const idx = await getCourtierIndex();
  const dejaEnvoyes = ps.filter((p) => p.events.length > 0).length;
  // Nb de demandes de RS déjà ENVOYÉES par l'auto 4 (pour la barre de progression).
  const sent = (await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["auto"], equals: "rs4_send" } }, select: { pipelineId: true }, distinct: ["pipelineId"] })).length;
  // rows = les « nouveaux » (ceux qui partiront), avec le DESTINATAIRE RÉEL (mail
  // nettoyé par prepareSendMails) pour que le détail reflète ce qui sera envoyé.
  const rows: Volet2Row[] = ps
    .filter((p) => p.events.length === 0)
    .map((p) => {
      const plan = prepareSendMails(p.copro.courtierActuel, p.copro.contactCourtierEmail, idx);
      return { pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, assureur: p.copro.assureurActuel, numeroContrat: p.copro.numeroContrat, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail, sendMail: plan.hold ? null : plan.mails.join(", "), hold: plan.hold, holdReason: plan.reason };
    });
  return { total: ps.length, nouveaux: ps.length - dejaEnvoyes, dejaEnvoyes, sent, rows };
}

// Envoie la demande de RS aux « nouveaux » (jamais envoyée) et fait passer au
// volet 3 (rs4SentAt). Les dossiers dont la RS était DÉJÀ partie ne sont pas
// re-mailés : on les bascule au volet 3 avec leur date d'envoi d'origine.
// `limit` : n'envoyer qu'un lot de N nouveaux (test) sans toucher au reste.
export async function sendVolet2(actorEmail: string, subjectTpl: string, bodyTpl: string, limit?: number): Promise<{ sent: number; failed: number; movedExisting: number; errors: string[] }> {
  const ps = await volet2Candidates();
  const signature = await getSignatureHtml(actorEmail);
  const idx = await getCourtierIndex();
  let sent = 0, failed = 0, movedExisting = 0;
  const errors: string[] = [];
  const now = new Date();

  const nouveaux = ps.filter((p) => p.events.length === 0);
  const deja = ps.filter((p) => p.events.length > 0);
  const toSend = typeof limit === "number" && limit > 0 ? nouveaux.slice(0, limit) : nouveaux;

  for (const p of toSend) {
    const c = p.copro;
    const plan = prepareSendMails(c.courtierActuel, c.contactCourtierEmail, idx);
    if (plan.hold) { failed++; errors.push(`${c.nom} : ${plan.reason} (${c.contactCourtierEmail}) — non envoyé`); continue; }
    const toList = plan.mails;
    const to = toList.join(", ");
    const vars = { adresse: c.adresse || c.nom, assureur: c.assureurActuel || "", numeroContrat: c.numeroContrat || "", nom: c.nom };
    const subject = fillTemplate(subjectTpl, vars);
    const html = renderHtml(fillTemplate(bodyTpl, vars), signature, `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${p.id}:rs</span>`);
    const r = await frontSend({ toList, subject, html, pipelineId: p.id, gestionnaireEmail: c.gestionnaireEmail, authorEmail: actorEmail });
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
  if (sent > 0 || failed > 0) await prisma.rs4SendLog.create({ data: { kind: "initial", count: sent, failed, actorEmail } });
  return { sent, failed, movedExisting, errors: errors.slice(0, 20) };
}

// Ré-archive les conversations RS de l'auto 4 restées « ouvertes » SANS réponse
// entrante. Nécessaire car une règle Front asynchrone rouvre parfois la conv juste
// après notre archivage à l'envoi (course). Idempotent, à lancer après un lot.
// On NE touche PAS aux conversations ayant reçu une vraie réponse (elles doivent
// rester ouvertes pour être traitées).
export async function archiveOpenNoReply(): Promise<{ scanned: number; archived: number }> {
  if (!FRONT_TOKEN) return { scanned: 0, archived: 0 };
  const ev = await prisma.pipelineEvent.findMany({ where: { OR: [{ metadata: { path: ["auto"], equals: "rs4_send" } }, { metadata: { path: ["auto"], equals: "rs4_relance" } }] }, select: { metadata: true } });
  const cids = [...new Set(ev.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean) as string[])];
  const H = (u: string) => fetch(u.startsWith("http") ? u : `${FRONT_API_URL}${u}`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
  let archived = 0;
  for (const cid of cids) {
    const cv = await (await H(`/conversations/${cid}`)).json().catch(() => null);
    if (!cv || cv.status === "archived") continue;
    const msgs = await (await H(`/conversations/${cid}/messages?limit=10`)).json().catch(() => null);
    const hasInbound = (msgs?._results ?? []).some((m: { is_inbound?: boolean }) => m.is_inbound);
    if (hasInbound) continue; // vraie réponse → on laisse ouvert
    const r = await fetch(`${FRONT_API_URL}/conversations/${cid}`, { method: "PATCH", headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
    if (r.ok) archived++;
  }
  return { scanned: cids.length, archived };
}

// Historique daté des envois auto 4 (demandes de RS + relances), plus récent d'abord.
export async function getRs4SendHistory(limit = 20): Promise<{ sentAt: string; kind: string; relanceNum: number | null; count: number; failed: number }[]> {
  const rows = await prisma.rs4SendLog.findMany({ orderBy: { sentAt: "desc" }, take: limit, select: { sentAt: true, kind: true, relanceNum: true, count: true, failed: true } });
  return rows.map((r) => ({ sentAt: r.sentAt.toISOString(), kind: r.kind, relanceNum: r.relanceNum, count: r.count, failed: r.failed }));
}

// Bascule au Volet 3 les dossiers DÉJÀ envoyés à la main (event draft_sent) mais
// pas encore dans le suivi (rs4SentAt null) — SANS envoyer de mail. rs4SentAt =
// date du 1er envoi réel → compteur « J+X » exact. Couvre aussi ceux pas encore
// montés au Volet 2. Idempotent.
export async function moveSentToVolet3(actorEmail: string): Promise<{ moved: number }> {
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4SentAt: null, coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null }, events: { some: { metadata: { path: ["rsType"], equals: "draft_sent" } } } },
    select: { id: true, rs4Volet2At: true, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { createdAt: true } } },
  });
  let moved = 0;
  for (const p of ps) {
    if (!p.events.length) continue;
    const first = p.events.reduce((a, e) => (e.createdAt < a ? e.createdAt : a), p.events[0].createdAt);
    await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4SentAt: first, rs4Volet2At: p.rs4Volet2At ?? first } });
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Demande de RS déjà envoyée à la main (${first.toLocaleDateString("fr-FR")}) → placée au suivi des relances (volet 3)`, metadata: { auto: "rs4_already_sent_to_v3", sentAt: first.toISOString() }, createdBy: actorEmail } });
    moved++;
  }
  return { moved };
}

// ─── Volet 3 : suivi + boucle de relances ────────────────────────────────────
export type Volet3Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; relances: number; replyKind: string | null; replyAt: string | null; replySnippet: string | null; replyConvUrl: string | null };
export type Volet3Data = { total: number; rows: Volet3Row[]; stages: { num: number; day: number; eligibles: number }[]; replyCounts: Record<string, number>; lastScanAt: string | null };

// Lien profond vers une conversation Front (ouvre l'app Front sur la conv).
const FRONT_CONV_URL = (cid: string | null) => (cid ? `https://app.frontapp.com/open/${cid}` : null);
const RS4_SELECT = { id: true, rs4SentAt: true, rs4ReplyKind: true, rs4ReplyAt: true, rs4ReplySnippet: true, rs4ReplyConvId: true, rs4ReplyScanAt: true, copro: { select: { nom: true, adresse: true, courtierActuel: true, contactCourtierEmail: true, gestionnaireEmail: true, numeroContrat: true, assureurActuel: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } } } as const;

// UI Volet 4 = boucle de relances : dossiers TRIÉS depuis le détecteur (rs4RelanceAt
// posé), pas encore passés en « RS en cours de récupération » (rs4EnCoursAt null).
async function volet3Pipelines() {
  const excl = await getExcludedCoproIds();
  return prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4SentAt: { not: null }, rs4RelanceAt: { not: null }, rs4EnCoursAt: null, coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: RS4_SELECT,
    orderBy: { rs4SentAt: "asc" },
  });
}

// UI Volet 3 = Détecteur : RS envoyée mais dossier PAS encore trié (ni relance ni
// en-cours). C'est l'inbox de tri où le scan Front pose un verdict par dossier.
async function detectorPipelines() {
  const excl = await getExcludedCoproIds();
  return prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4SentAt: { not: null }, rs4RelanceAt: null, rs4EnCoursAt: null, coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: RS4_SELECT,
    orderBy: { rs4SentAt: "asc" },
  });
}

function relanceCountOf(events: { metadata: unknown }[]): number {
  return events.filter((e) => { const m = e.metadata as { relanceNum?: number } | null; return !!m && typeof m.relanceNum === "number" && m.relanceNum > 0; }).length;
}

type Rs4Pipeline = Awaited<ReturnType<typeof volet3Pipelines>>[number];
function toVolet3Row(p: Rs4Pipeline, nowMs: number): Volet3Row {
  const jours = Math.floor((nowMs - new Date(p.rs4SentAt!).getTime()) / 86400000);
  return { pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail, joursDepuisEnvoi: jours, relances: relanceCountOf(p.events), replyKind: p.rs4ReplyKind, replyAt: p.rs4ReplyAt ? p.rs4ReplyAt.toISOString() : null, replySnippet: p.rs4ReplySnippet, replyConvUrl: FRONT_CONV_URL(p.rs4ReplyConvId) };
}
function replyCountsOf(ps: Rs4Pipeline[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const p of ps) { const k = p.rs4ReplyKind ?? "non_scanne"; c[k] = (c[k] ?? 0) + 1; }
  return c;
}
function lastScanOf(ps: Rs4Pipeline[]): string | null {
  const dates = ps.map((p) => p.rs4ReplyScanAt).filter(Boolean) as Date[];
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString();
}

export async function getRs4Volet3Data(nowMs: number): Promise<Volet3Data> {
  const ps = await volet3Pipelines();
  const rows = ps.map((p) => toVolet3Row(p, nowMs));
  const stages = RELANCE_STAGES.map((s) => ({ num: s.num, day: s.day, eligibles: rows.filter((r) => r.joursDepuisEnvoi >= s.day && r.relances < s.num).length }));
  return { total: rows.length, rows, stages, replyCounts: replyCountsOf(ps), lastScanAt: lastScanOf(ps) };
}

// ─── Volet 3 : Détecteur de réponses ─────────────────────────────────────────
export type DetectorData = { total: number; scanned: number; nonScanne: number; sansReponse: number; replyCounts: Record<string, number>; lastScanAt: string | null; rows: Volet3Row[] };
export async function getRs4DetectorData(nowMs: number): Promise<DetectorData> {
  const ps = await detectorPipelines();
  const rows = ps.map((p) => toVolet3Row(p, nowMs));
  const counts = replyCountsOf(ps);
  const scanned = ps.filter((p) => p.rs4ReplyScanAt).length;
  return { total: ps.length, scanned, nonScanne: ps.length - scanned, sansReponse: counts["sans_reponse"] ?? 0, replyCounts: counts, lastScanAt: lastScanOf(ps), rows };
}

// Verdict possibles du détecteur. « sans_reponse » = scanné mais aucun entrant.
export const REPLY_KINDS = ["rs_recu", "redirect", "attente", "info", "pj", "bounce", "autre", "sans_reponse"] as const;
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
function realDoc(atts: { contentType?: string; content_type?: string; filename?: string }[]): boolean {
  return (atts ?? []).some((a) => {
    const ct = (a.contentType || a.content_type || "").toLowerCase();
    const fn = (a.filename || "").toLowerCase();
    const inline = /^image\d+\.(png|gif|jpe?g)$/.test(fn) || /logo|signature/.test(fn);
    return !inline && (ct.includes("pdf") || ct.includes("word") || ct.includes("sheet") || ct.includes("excel") || /\.(pdf|docx?|xlsx?)$/.test(fn));
  });
}
const RRE = {
  pj: /protection juridique|ne ressort que|cité en objet.*juridique/i,
  redirect: /adressez-?vous (au|à votre|directement)|interlocuteur (exclusif|unique)|pas de contact direct|nous ne (sommes|gérons)|n'?[eê]tes plus/i,
  attente: /interroger le march|reviendrons vers vous|en attente|dans l'attente|pv d'?ag|proc[èe]s.?verbal|nomination|mandat|nous reviendrons/i,
  info: /quel(le)? (est|sont).*(contrat|police)|num[ée]ro de contrat|merci de.*(communiquer|fournir|préciser|transmettre)|pouvez-?vous.*(communiquer|préciser|indiquer)/i,
  rsText: /relev[ée].{0,3}(de sinistralit|des sinistres|d'?informations?)|ci-?joint|pièce.?jointe|document (demandé|transmis|ci)|statistiques? sinistr|aucun sinistre|sans sinistre|n[ée]ant/i,
};
function classifyReply(body: string, hasDoc: boolean, bounce: boolean): string {
  const s = body.toLowerCase();
  if (bounce) return "bounce";
  if (RRE.pj.test(s)) return "pj";
  if (RRE.redirect.test(s)) return "redirect";
  if (hasDoc) return "rs_recu";
  if (RRE.rsText.test(s)) return "rs_recu";
  if (RRE.attente.test(s)) return "attente";
  if (RRE.info.test(s)) return "info";
  return "autre";
}
async function frontGet(path: string): Promise<Record<string, unknown> | null> {
  if (!FRONT_TOKEN) return null;
  const res = await fetch(`${FRONT_API_URL}${path}`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
  if (!res.ok) return null;
  return res.json();
}
const isFromMatera = (m: { author?: { email?: string }; recipients?: { role: string; handle: string }[] }) => {
  const from = (m.recipients ?? []).find((r) => r.role === "from")?.handle || m.author?.email || "";
  return /@(?:[a-z0-9-]+\.)?matera\.eu$/i.test(from);
};

// Scanne un lot du périmètre « envoyé, en attente » (détecteur + relances) et pose
// un verdict par dossier. LECTURE Front uniquement : aucun dossier n'est déplacé.
export async function scanReplies(offset: number, limit: number): Promise<{ total: number; scanned: number; nextOffset: number; done: boolean; counts: Record<string, number> }> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4SentAt: { not: null }, rs4EnCoursAt: null, coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: { id: true, rs4SentAt: true, rs4RelanceAt: true, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } } },
    orderBy: { rs4SentAt: "asc" },
  });
  const slice = ps.slice(offset, offset + limit);
  const counts: Record<string, number> = {};
  const now = new Date();
  for (const p of slice) {
    const cid = p.events.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean).pop();
    if (!cid) { await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: "non_scanne" } }); counts["non_scanne"] = (counts["non_scanne"] ?? 0) + 1; continue; }
    const sentMs = new Date(p.rs4SentAt!).getTime();
    const list = await frontGet(`/conversations/${cid}/messages?limit=20`);
    const results = ((list?._results as unknown[]) ?? []) as { id: string; is_inbound: boolean; created_at: number; error_type?: string; blurb?: string; attachments?: { contentType?: string; filename?: string }[]; author?: { email?: string }; recipients?: { role: string; handle: string }[] }[];
    const bounce = results.some((m) => !m.is_inbound && m.error_type);
    const inbound = results.filter((m) => m.is_inbound && m.created_at * 1000 > sentMs && !isFromMatera(m));
    if (!inbound.length && !bounce) { await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: "sans_reponse", rs4ReplyAt: null, rs4ReplySnippet: null, rs4ReplyMsgId: null } }); counts["sans_reponse"] = (counts["sans_reponse"] ?? 0) + 1; continue; }
    const last = inbound.sort((a, b) => b.created_at - a.created_at)[0];
    let body = "", snippet = "", hasDoc = inbound.some((m) => realDoc(m.attachments ?? []));
    if (last) {
      const full = (await frontGet(`/messages/${last.id}`)) as { content?: string; attachments?: { contentType?: string; filename?: string }[] } | null;
      body = stripHtml(full?.content || last.blurb || "").slice(0, 500);
      snippet = body.slice(0, 160);
      if (full?.attachments && realDoc(full.attachments)) hasDoc = true;
    }
    const kind = classifyReply(body, hasDoc, bounce && !inbound.length);
    // Réponse détectée sur un dossier en boucle de relances (V4) → retour auto au
    // détecteur (V3) pour re-tri : on efface rs4RelanceAt.
    const backToDetector = !!p.rs4RelanceAt;
    await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: kind, rs4ReplyAt: last ? new Date(last.created_at * 1000) : now, rs4ReplySnippet: snippet || (bounce ? "Échec de remise (bounce)" : null), rs4ReplyMsgId: last?.id ?? null, rs4ReplyConvId: cid, ...(backToDetector ? { rs4RelanceAt: null } : {}) } });
    if (backToDetector) await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Réponse détectée (${kind}) — dossier renvoyé de la boucle de relances (V4) au détecteur (V3)`, metadata: { auto: "rs4_reply_back_to_detector", kind }, createdBy: "auto:scan_replies" } });
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const nextOffset = offset + slice.length;
  return { total: ps.length, scanned: slice.length, nextOffset, done: nextOffset >= ps.length, counts };
}

// Résout (archive) sur Front toutes les conversations d'envoi d'un dossier.
// Best-effort : une conv déjà archivée ou introuvable est ignorée.
async function archiveConversationsFor(pipelineId: string): Promise<number> {
  if (!FRONT_TOKEN) return 0;
  const ev = await prisma.pipelineEvent.findMany({ where: { pipelineId, metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } });
  const cids = [...new Set(ev.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean) as string[])];
  let n = 0;
  for (const cid of cids) {
    const r = await fetch(`${FRONT_API_URL}/conversations/${cid}`, { method: "PATCH", headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
    if (r.ok) n++;
  }
  return n;
}

// Aiguillage depuis le détecteur — chaque action = un clic utilisateur.
// → boucle de relances (Volet 4). Pas de réponse à traiter → on RÉSOUT la conv Front.
export async function moveToRelance(actorEmail: string, pipelineId: string): Promise<{ ok: boolean; archived: number }> {
  await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { rs4RelanceAt: new Date() } });
  const archived = await archiveConversationsFor(pipelineId);
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Dossier envoyé en boucle de relances (Volet 4) depuis le détecteur${archived ? " · conv Front résolue" : ""}`, metadata: { auto: "rs4_to_relance", archived }, createdBy: actorEmail } });
  return { ok: true, archived };
}
// Bulk : tous les « sans réponse » du détecteur → boucle de relances.
export async function moveAllNoReplyToRelance(actorEmail: string): Promise<{ moved: number }> {
  const ps = (await detectorPipelines()).filter((p) => p.rs4ReplyKind === "sans_reponse");
  for (const p of ps) await moveToRelance(actorEmail, p.id);
  return { moved: ps.length };
}
// → renvoi auto 3 (corriger le mail) : sort du suivi RS, revient au Volet 1 de l'auto 4.
export async function renvoiAuto3(actorEmail: string, pipelineId: string, clearMail: boolean): Promise<{ ok: boolean }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { rsBatchAt: true, coproId: true, copro: { select: { contactCourtierEmail: true } } } });
  if (!p) return { ok: false };
  if (clearMail) await prisma.copro.update({ where: { id: p.coproId }, data: { contactCourtierEmail: null } });
  await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { rsBatchAt: p.rsBatchAt ?? new Date(), rs4Volet2At: null, rs4SentAt: null, rs4RelanceAt: null, rs4EnCoursAt: null, rs4ReplyKind: null, rs4ReplyAt: null, rs4ReplySnippet: null, rs4ReplyMsgId: null, rs4ReplyScanAt: null } });
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: clearMail ? "Mail en erreur — dossier renvoyé au Volet 1 (mail effacé) pour correction" : "Dossier renvoyé au Volet 1 pour vérification (n° de contrat / PJ)", metadata: { auto: "rs4_renvoi_auto3", clearMail, before: p.copro.contactCourtierEmail }, createdBy: actorEmail } });
  return { ok: true };
}

// Envoie la relance n° `relanceNum` aux dossiers éligibles (J+seuil atteint et
// relance pas encore envoyée). Les dossiers restent au volet 3 jusqu'au RS reçu.
export async function sendRelance(actorEmail: string, relanceNum: number, subjectTpl: string, bodyTpl: string, nowMs: number): Promise<{ sent: number; failed: number; errors: string[] }> {
  const stage = RELANCE_STAGES.find((s) => s.num === relanceNum);
  if (!stage) return { sent: 0, failed: 0, errors: ["relance inconnue"] };
  const ps = await volet3Pipelines();
  const signature = await getSignatureHtml(actorEmail);
  const idx = await getCourtierIndex();
  let sent = 0, failed = 0;
  const errors: string[] = [];
  for (const p of ps) {
    const jours = Math.floor((nowMs - new Date(p.rs4SentAt!).getTime()) / 86400000);
    if (jours < stage.day || relanceCountOf(p.events) >= relanceNum) continue;
    const c = p.copro;
    const plan = prepareSendMails(c.courtierActuel, c.contactCourtierEmail, idx);
    if (plan.hold) { failed++; errors.push(`${c.nom} : ${plan.reason} — non relancé`); continue; }
    const toList = plan.mails;
    const to = toList.join(", ");
    const vars = { adresse: c.adresse || c.nom, assureur: c.assureurActuel || "", numeroContrat: c.numeroContrat || "", nom: c.nom, jours: String(jours) };
    const subject = fillTemplate(subjectTpl, vars);
    const html = renderHtml(fillTemplate(bodyTpl, vars), signature, `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${p.id}:rs_relance</span>`);
    const r = await frontSend({ toList, subject, html, pipelineId: p.id, gestionnaireEmail: c.gestionnaireEmail, authorEmail: actorEmail });
    if (!r.ok) { failed++; errors.push(`${c.nom} : ${r.error ?? "échec"}`); continue; }
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Relance ${relanceNum} de la demande de RS envoyée (${to})`, metadata: { rsType: "draft_sent", relanceNum, to, conversationId: r.conversationId, auto: "rs4_relance" }, createdBy: actorEmail } });
    sent++;
  }
  if (sent > 0 || failed > 0) await prisma.rs4SendLog.create({ data: { kind: "relance", relanceNum, count: sent, failed, actorEmail } });
  return { sent, failed, errors: errors.slice(0, 20) };
}

// (RS reçu = réutilise l'action existante marquerRSRecu → rs_en_cours → devis_demandes.)

// ─── Volet 4 : « RS en cours de récupération » (courtier a répondu, RS pas reçu) ──
export type Volet4Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; replyKind: string | null; replySnippet: string | null; replyConvUrl: string | null };
export type Volet4Data = { total: number; rows: Volet4Row[] };

export async function getRs4Volet4Data(nowMs: number): Promise<Volet4Data> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4EnCoursAt: { not: null }, coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: { id: true, rs4SentAt: true, rs4EnCoursAt: true, rs4ReplyKind: true, rs4ReplySnippet: true, rs4ReplyConvId: true, copro: { select: { nom: true, adresse: true, courtierActuel: true, contactCourtierEmail: true } } },
    orderBy: { rs4EnCoursAt: "desc" },
  });
  const rows: Volet4Row[] = ps.map((p) => ({
    pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail,
    joursDepuisEnvoi: p.rs4SentAt ? Math.floor((nowMs - new Date(p.rs4SentAt).getTime()) / 86400000) : 0,
    replyKind: p.rs4ReplyKind, replySnippet: p.rs4ReplySnippet, replyConvUrl: FRONT_CONV_URL(p.rs4ReplyConvId),
  }));
  return { total: rows.length, rows };
}

export async function getRs4Volet4Count(): Promise<number> {
  return prisma.insurancePipeline.count({ where: { statut: "rs_en_cours", rs4EnCoursAt: { not: null }, coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null } } });
}

// Volet 3 → Volet 4 : le courtier a répondu (info manquante…) mais pas le RS →
// sortir de la boucle de relance. Réversible (on peut le remettre en relance).
export async function moveToEnCours(actorEmail: string, pipelineId: string): Promise<{ ok: boolean }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { statut: true } });
  if (!p || p.statut !== "rs_en_cours") return { ok: false };
  await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { rs4EnCoursAt: new Date() } });
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "RS en cours de récupération (courtier a répondu, RS pas encore reçu) — sorti de la boucle de relance", metadata: { auto: "rs4_en_cours" }, createdBy: actorEmail } });
  return { ok: true };
}

// Volet 4 / Volet 5 → Volet 3 (Détecteur) : renvoie le dossier au détecteur pour
// re-tri (efface rs4EnCoursAt + rs4RelanceAt). rs4SentAt conservé.
export async function moveToDetector(actorEmail: string, pipelineId: string): Promise<{ ok: boolean }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { statut: true } });
  if (!p || p.statut !== "rs_en_cours") return { ok: false };
  await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { rs4EnCoursAt: null, rs4RelanceAt: null } });
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "Dossier renvoyé au détecteur de réponses (Volet 3) pour re-tri", metadata: { auto: "rs4_to_detector" }, createdBy: actorEmail } });
  return { ok: true };
}

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
