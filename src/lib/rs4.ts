// Automatisation 4 — Volet 1 : vérification de l'échantillon chargé depuis l'auto 3.
// L'échantillon = dossiers marqués rsBatchAt (encore en « Récupération du RS »),
// mis à jour au fur et à mesure des envois de l'auto 3. On trie en 2 catégories :
//   - infos complètes   = mail courtier + assureur + n° de contrat présents
//   - infos incomplètes = au moins un de ces champs manquant
// (le mail courtier est normalement toujours là, garanti par l'auto 3 ; on le
//  revérifie par sécurité). Le n° de contrat est le champ le plus souvent absent.

import { prisma } from "@/lib/prisma";
import { getSignatureHtml, tagConversation, assignConversation, resolveTeammateId } from "@/lib/front";
import { getCourtierIndex, prepareSendMails, isMateraInternal, isExInsurerAssureur } from "@/lib/courtier-audit";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { captureReplyDocs } from "@/lib/rs-docs";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const FRONT_CHANNEL_ID = process.env.FRONT_CHANNEL_ID;
const FRONT_AUTHOR_EMAIL = process.env.FRONT_AUTHOR_EMAIL || "bonjour@matera.eu";
const GUFETTO_INBOX = process.env.FRONT_GUFETTO_INBOX || "inb_601dy"; // « Assurance Pro - Gufetto »

// Étapes de relance du Volet 3 : n° de relance + délai (jours depuis l'envoi initial).
export const RELANCE_STAGES = [
  { num: 1, day: 4 },
  { num: 2, day: 8 },
  { num: 3, day: 12 },
] as const;

// 3 tons d'escalade. Placeholders : {adresse} {assureur} {numeroContrat} {jours}.
// Envoyées EN RÉPONSE au fil d'origine (même conversation).
export const RELANCE_TEMPLATES: Record<number, { subject: string; body: string }> = {
  1: {
    subject: "Relance — Relevé de sinistralité — {adresse}",
    body: `Bonjour,

Je me permets de revenir vers vous concernant notre demande de contrat MRI et de relevé de sinistralité.

Pouvez-vous nous transmettre les documents dès que possible ?

Merci d'avance.
Bien cordialement,`,
  },
  2: {
    subject: "2ᵉ relance — Relevé de sinistralité — {adresse}",
    body: `Bonjour,

Sauf erreur de notre part, notre demande de relevé de sinistralité pour la copropriété {adresse} (contrat n° {numeroContrat}) reste sans réponse à ce jour, malgré une première relance.

Ce document nous est indispensable pour poursuivre le dossier. Nous vous remercions de nous le faire parvenir sous 48 heures.

Dans l'attente de votre retour,
Bien cordialement,`,
  },
  3: {
    subject: "Relance finale — Relevé de sinistralité — {adresse}",
    body: `Bonjour,

Malgré nos relances successives, nous restons à ce jour sans réponse à notre demande de relevé de sinistralité concernant la copropriété {adresse} (contrat n° {numeroContrat}, {assureur}), formulée il y a {jours} jours.

Nous vous rappelons que la communication du relevé d'informations est un droit du souscripteur et doit intervenir dans un délai raisonnable. À défaut de réception sous 8 jours, nous nous réservons la possibilité de saisir directement la compagnie et, le cas échéant, le médiateur de l'assurance.

Nous comptons sur votre diligence pour régulariser cette situation,
Bien cordialement,`,
  },
};

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
    // Force l'inbox Gufetto + « resolved » APRÈS le tag/assignation (sinon
    // l'assignation laisse la conv « open »). Move + archive atomiques pour
    // garantir l'inbox Gufetto. Une réponse ultérieure du courtier la rouvrira.
    await fetch(`${FRONT_API_URL}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inbox_id: GUFETTO_INBOX, status: "archived" }),
    }).catch(() => {});
  }
  return { ok: true, conversationId: conversationId || null };
}

// Envoi d'une RÉPONSE dans une conversation existante (reste dans le même fil).
// Ordre important : (1) déplacer dans l'inbox Gufetto, (2) envoyer la réponse,
// (3) APRÈS un court délai (l'envoi Front est asynchrone : 202 accepted), forcer
// « resolved ». Archiver trop tôt = course avec l'envoi qui rouvre la conv.
async function frontReply(opts: { conversationId: string; toList: string[]; subject: string; html: string; authorEmail: string }): Promise<{ ok: boolean; error?: string }> {
  if (!FRONT_TOKEN) return { ok: false, error: "Front non configuré" };
  const to = opts.toList.filter((t) => !isMateraInternal(t));
  if (!to.length) return { ok: false, error: "aucun destinataire" };
  const patch = (bodyObj: object) => fetch(`${FRONT_API_URL}/conversations/${opts.conversationId}`, { method: "PATCH", headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(bodyObj) }).catch(() => {});
  // 1) Inbox Gufetto (avant l'envoi ; le move seul peut rouvrir → réglé en 3).
  await patch({ inbox_id: GUFETTO_INBOX });
  // 2) Réponse dans le fil.
  const res = await fetch(`${FRONT_API_URL}/conversations/${opts.conversationId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ author_id: `alt:email:${opts.authorEmail || FRONT_AUTHOR_EMAIL}`, to, subject: opts.subject, body: opts.html, options: { archive: false } }),
  });
  if (!res.ok && res.status !== 202) return { ok: false, error: await res.text() };
  // 3) APRÈS l'envoi (async) : resolved. Le délai évite la course qui laissait la
  // conv « open/assigned » (l'envoi tardif rouvrait la conv juste après le PATCH).
  await new Promise((r) => setTimeout(r, 1500));
  await patch({ status: "archived" });
  return { ok: true };
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

// Un dossier est « déjà envoyé » si un event draft_sent GENUINE existe (envoi
// initial de NOTRE part : relanceNum 0 + destinataire). On ignore les vestiges
// (« conv liée depuis Front », sans destinataire). Ces dossiers relèvent du
// Volet 3 (suivi des relances), JAMAIS de l'échantillon à envoyer (Volet 1) :
// sinon une RS déjà partie réapparaît indéfiniment « à vérifier / à envoyer ».
export const isGenuineRsSent = (events: { metadata: unknown }[]): boolean =>
  events.some((e) => { const m = e.metadata as { relanceNum?: number; to?: string } | null; return !!m && m.relanceNum === 0 && typeof m.to === "string" && m.to.trim().length > 0; });
const DRAFT_SENT_EV = { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } } as const;

// Série quotidienne pour le graphe du dashboard : par jour, nb de demandes de RS
// envoyées (event draft_sent) et nb de RS reçus « actés » (event description ~ « RS reçu »).
// Alimenté en direct par l'activité Gufetto (aucun cache).
export type RsFlowDay = { date: string; label: string; sent: number; relances: number; recus: number };
export async function getRsFlowDaily(): Promise<RsFlowDay[]> {
  const [draftEv, recuEv] = await Promise.all([
    prisma.pipelineEvent.findMany({ where: { metadata: { path: ["rsType"], equals: "draft_sent" }, pipeline: { copro: { archivedAt: null } } }, select: { createdAt: true, metadata: true } }),
    prisma.pipelineEvent.findMany({ where: { description: { contains: "RS reçu" }, pipeline: { copro: { archivedAt: null } } }, select: { createdAt: true } }),
  ]);
  const dayKey = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d); // YYYY-MM-DD
  const sentBy = new Map<string, number>(); const relBy = new Map<string, number>(); const recuBy = new Map<string, number>();
  for (const e of draftEv) {
    const k = dayKey(e.createdAt);
    const relanceNum = Number((e.metadata as { relanceNum?: number } | null)?.relanceNum ?? 0);
    if (relanceNum > 0) relBy.set(k, (relBy.get(k) ?? 0) + 1);
    else sentBy.set(k, (sentBy.get(k) ?? 0) + 1);
  }
  for (const e of recuEv) recuBy.set(dayKey(e.createdAt), (recuBy.get(dayKey(e.createdAt)) ?? 0) + 1);
  const all = [...sentBy.keys(), ...relBy.keys(), ...recuBy.keys()].sort();
  if (!all.length) return [];
  const start = new Date(all[0] + "T12:00:00Z");
  const end = new Date(dayKey(new Date()) + "T12:00:00Z");
  const rows: RsFlowDay[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    rows.push({ date: k, label: `${k.slice(8, 10)}/${k.slice(5, 7)}`, sent: sentBy.get(k) ?? 0, relances: relBy.get(k) ?? 0, recus: recuBy.get(k) ?? 0 });
  }
  return rows;
}

export async function getRs4Sample(): Promise<Rs4Sample> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: volet1Where(excl),
    select: { id: true, rsBatchAt: true, copro: { select: { nom: true, assureurActuel: true, numeroContrat: true, courtierActuel: true, contactCourtierEmail: true } }, events: DRAFT_SENT_EV },
    orderBy: { rsBatchAt: "desc" },
  });
  const idx = await getCourtierIndex();

  const completeRows: Rs4Row[] = [];
  const incompleteRows: Rs4Row[] = [];
  for (const p of ps) {
    // RS déjà partie → relève du Volet 3, jamais de l'échantillon à envoyer.
    if (isGenuineRsSent(p.events)) continue;
    const c = p.copro;
    const assureur = c.assureurActuel?.trim() || null;
    const numeroContrat = c.numeroContrat?.trim() || null;
    // On passe le mail par les MÊMES garde-fous qu'à l'envoi (prepareSendMails) :
    // retire interne Matera / contacts devis / mail assureur / perso, ne garde que
    // le(s) mail(s) courtier réellement envoyables. `hold` = cas erroné (Wakam,
    // mails d'autres cabinets, aucun mail courtier fiable…).
    const plan = prepareSendMails(c.courtierActuel, c.contactCourtierEmail, idx, assureur);
    const cleanMail = plan.mails.join(", ") || null;
    const manque: string[] = [];
    if (plan.hold) manque.push(plan.reason);            // erroné (Wakam / mails incohérents…)
    else if (!cleanMail) manque.push("mail courtier");  // aucun mail courtier exploitable
    if (!assureur) manque.push("assureur");
    if (!numeroContrat) manque.push("n° de contrat");
    // Affiche le mail NETTOYÉ (ce qui partira), pas le champ brut pollué.
    const displayMail = cleanMail ?? (c.contactCourtierEmail?.trim() || null);
    const row: Rs4Row = { pipelineId: p.id, nom: c.nom, assureur, numeroContrat, courtier: c.courtierActuel?.trim() || null, mail: displayMail, manque };
    (manque.length === 0 ? completeRows : incompleteRows).push(row);
  }

  const total = completeRows.length + incompleteRows.length;
  return { total, complete: completeRows.length, incomplete: incompleteRows.length, completeRows, incompleteRows };
}

// Nb de dossiers encore au Volet 1 (échantillon à vérifier, pas encore passé au 2).
// On EXCLUT les dossiers dont la RS est déjà partie (ils relèvent du Volet 3).
export async function getRs4Volet1Count(): Promise<number> {
  const ps = await prisma.insurancePipeline.findMany({
    where: volet1Where(await getExcludedCoproIds()),
    select: { id: true, events: DRAFT_SENT_EV },
  });
  return ps.filter((p) => !isGenuineRsSent(p.events)).length;
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
    select: { id: true, copro: { select: { nom: true, adresse: true, assureurActuel: true, numeroContrat: true, courtierActuel: true, contactCourtierEmail: true, gestionnaireEmail: true, gestionnaireNom: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { id: true, createdAt: true } } },
    orderBy: { rs4Volet2At: "desc" },
  });
  return ps;
}

// Nom lisible du gestionnaire (nom si dispo, sinon dérivé du mail).
function gestionnaireLabel(nom: string | null, email: string | null): string | null {
  if (nom?.trim()) return nom.trim();
  if (!email) return null;
  return email.split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export type Volet2Row = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; numeroContrat: string | null; courtier: string | null; mail: string | null; sendMail: string | null; hold: boolean; holdReason: string; gestionnaire: string | null };
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
      const plan = prepareSendMails(p.copro.courtierActuel, p.copro.contactCourtierEmail, idx, p.copro.assureurActuel);
      return { pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, assureur: p.copro.assureurActuel, numeroContrat: p.copro.numeroContrat, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail, sendMail: plan.hold ? null : plan.mails.join(", "), hold: plan.hold, holdReason: plan.reason, gestionnaire: gestionnaireLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail) };
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
    const plan = prepareSendMails(c.courtierActuel, c.contactCourtierEmail, idx, c.assureurActuel);
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
    select: { id: true, rs4Volet2At: true, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true, createdAt: true } } },
  });
  let moved = 0;
  for (const p of ps) {
    // Ne bascule au suivi QUE sur un VRAI envoi de notre part (relanceNum 0 + destinataire).
    // On ignore les events « conv liée depuis Front » / vestiges (pas un envoi de nous).
    const genuine = p.events.filter((e) => { const m = e.metadata as { relanceNum?: number; to?: string } | null; return !!m && m.relanceNum === 0 && typeof m.to === "string" && m.to.trim().length > 0; });
    if (!genuine.length) continue;
    const first = genuine.reduce((a, e) => (e.createdAt < a ? e.createdAt : a), genuine[0].createdAt);
    await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4SentAt: first, rs4Volet2At: p.rs4Volet2At ?? first } });
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Demande de RS déjà envoyée à la main (${first.toLocaleDateString("fr-FR")}) → placée au suivi des relances (volet 3)`, metadata: { auto: "rs4_already_sent_to_v3", sentAt: first.toISOString() }, createdBy: actorEmail } });
    moved++;
  }
  return { moved };
}

// ─── Volet 3 : suivi + boucle de relances ────────────────────────────────────
export type Volet3Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; relances: number; replyKind: string | null; replyAt: string | null; replySnippet: string | null; replyConvUrl: string | null; commentText: string | null; commentBy: string | null; commentAt: string | null; devisMixup: boolean; relanceTried: boolean; joursOuvresDepuisDerniereRelance: number; relancePaused: boolean };
export type Volet3Data = { total: number; rows: Volet3Row[]; stages: { num: number; day: number; eligibles: number }[]; replyCounts: Record<string, number>; lastScanAt: string | null; commentedCount: number; devisMixupCount: number };

// Adresses de DEMANDE DE DEVIS (assureurs) — jamais un destinataire de relance RS.
const DEVIS_ADDRESSES = ["achille.leboeuf@axa.fr", "souscription@mila.fr"];

// Lien profond vers une conversation Front (ouvre l'app Front sur la conv).
const FRONT_CONV_URL = (cid: string | null) => (cid ? `https://app.frontapp.com/open/${cid}` : null);
const RS4_SELECT = { id: true, rs4SentAt: true, rs4ReplyKind: true, rs4ReplyAt: true, rs4ReplySnippet: true, rs4ReplyConvId: true, rs4ReplyScanAt: true, rs4CommentAt: true, rs4CommentText: true, rs4CommentBy: true, copro: { select: { nom: true, adresse: true, buildingId: true, courtierActuel: true, contactCourtierEmail: true, gestionnaireEmail: true, numeroContrat: true, assureurActuel: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true, createdAt: true } } } as const;

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

// Dernier VRAI envoi initial de NOTRE part = draft_sent avec relanceNum 0 ET un
// destinataire `to` réel (créé par le flux Gufetto : envoi batch, envoi manuel
// « Mail 1 envoyé »…). On EXCLUT les events « conv liée depuis Front » / vestiges
// (relanceNum absent, `to` vide) qui pointent vers une conversation étrangère ou
// ancienne qu'on n'a pas envoyée — sinon on relancerait un mail qui n'est pas de nous.
// Renvoie le plus récent (la « boucle de mail » courante), ou null si aucun vrai envoi.
// Plancher entre deux relances : on ne re-relance pas avant N jours OUVRÉS depuis
// le dernier envoi (initial ou relance), en plus du seuil J+X depuis l'envoi initial.
export const MIN_OPEN_DAYS_BETWEEN_RELANCES = 4;

// Date du DERNIER envoi sortant (draft_sent : envoi initial OU relance), pour
// mesurer le délai « entre relances ».
function latestSendDate(events: { metadata: unknown; createdAt: Date }[]): Date | null {
  const sends = events.filter((e) => (e.metadata as { rsType?: string } | null)?.rsType === "draft_sent");
  if (!sends.length) return null;
  return sends.reduce((mx, e) => (e.createdAt.getTime() > mx.getTime() ? e.createdAt : mx), sends[0].createdAt);
}

// Nombre de jours OUVRÉS (lun-ven) écoulés depuis `from` jusqu'à maintenant.
function openDaysSince(from: Date | null, nowMs: number): number {
  if (!from) return Number.POSITIVE_INFINITY; // pas d'envoi connu → pas de blocage
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(nowMs); end.setHours(0, 0, 0, 0);
  let count = 0;
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

function latestInitialSend(events: { metadata: unknown; createdAt: Date }[]): { date: Date; cid: string | null } | null {
  const inits = events
    .filter((e) => { const m = e.metadata as { relanceNum?: number; to?: string } | null; return !!m && m.relanceNum === 0 && typeof m.to === "string" && m.to.trim().length > 0; })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (!inits.length) return null;
  const top = inits[0];
  return { date: top.createdAt, cid: (top.metadata as { conversationId?: string } | null)?.conversationId ?? null };
}

type Rs4Pipeline = Awaited<ReturnType<typeof volet3Pipelines>>[number];
function toVolet3Row(p: Rs4Pipeline, nowMs: number): Volet3Row {
  // Timing = depuis la dernière action sortante = MAX(rs4SentAt, dernier envoi
  // initial). Couvre : renvoi avec le bon mail (nouvelle boucle → nouvelle date) ET
  // « on a répondu en dernier » (rs4SentAt avancé pour patienter). Jamais la conv de base.
  const base = latestInitialSend(p.events);
  const baseMs = Math.max(base ? base.date.getTime() : 0, p.rs4SentAt ? new Date(p.rs4SentAt).getTime() : 0);
  const jours = Math.floor((nowMs - baseMs) / 86400000);
  // Jours ouvrés depuis le DERNIER envoi (initial/relance) → plancher inter-relance.
  const joursOuvresDepuisDerniereRelance = openDaysSince(latestSendDate(p.events), nowMs);
  const recips = [p.copro.contactCourtierEmail ?? "", ...p.events.map((e) => (e.metadata as { to?: string } | null)?.to ?? "")].join(" ").toLowerCase();
  const devisMixup = DEVIS_ADDRESSES.some((a) => recips.includes(a));
  // Lien Front : conv de réponse si détectée, sinon la conv du dernier envoi initial
  // → chaque dossier a toujours un lien, même « sans réponse ».
  const sentCid = base?.cid ?? p.events.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean).pop() ?? null;
  return { pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail, joursDepuisEnvoi: jours, relances: relanceCountOf(p.events), replyKind: p.rs4ReplyKind, replyAt: p.rs4ReplyAt ? p.rs4ReplyAt.toISOString() : null, replySnippet: p.rs4ReplySnippet, replyConvUrl: FRONT_CONV_URL(p.rs4ReplyConvId ?? sentCid), commentText: p.rs4CommentText, commentBy: p.rs4CommentBy, commentAt: p.rs4CommentAt ? p.rs4CommentAt.toISOString() : null, devisMixup, relanceTried: false, joursOuvresDepuisDerniereRelance, relancePaused: false };
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
  // Curseur relance : dossiers tentés SANS SUCCÈS récemment (12 h) → sortis des
  // éligibles (compteur + aperçu) pour que « envoyer N » enchaîne les suivants et
  // ne reboucle pas sur les mêmes échecs. Marqueur = event rs4_relance_tried.
  const triedCooldown = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const triedEv = await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["auto"], equals: "rs4_relance_tried" }, createdAt: { gte: triedCooldown } }, select: { pipelineId: true, metadata: true } });
  const triedMap = new Map<string, Set<number>>();
  for (const e of triedEv) { const n = Number((e.metadata as { relanceNum?: number } | null)?.relanceNum); if (!n) continue; if (!triedMap.has(e.pipelineId)) triedMap.set(e.pipelineId, new Set()); triedMap.get(e.pipelineId)!.add(n); }
  for (const r of rows) r.relanceTried = triedMap.get(r.pipelineId)?.has(r.relances + 1) ?? false;
  // Mis en pause manuellement (« exclure de la boucle ») → exclu des relances tant
  // qu'on ne « remet pas dans la boucle ». État = dernier event rs4_relance_paused.
  const pausedEv = await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["auto"], equals: "rs4_relance_paused" } }, select: { pipelineId: true, metadata: true }, orderBy: { createdAt: "asc" } });
  const pausedState = new Map<string, boolean>();
  for (const e of pausedEv) pausedState.set(e.pipelineId, !!(e.metadata as { paused?: boolean } | null)?.paused);
  for (const r of rows) r.relancePaused = pausedState.get(r.pipelineId) ?? false;
  // Éligibles à la relance N = délai atteint, EXACTEMENT N-1 relances déjà faites
  // (séquence 1→2→3), pas de réponse réelle, pas déjà tenté récemment, pas en pause.
  const noRealReply = (k: string | null) => !k || k === "sans_reponse" || k === "non_scanne";
  const stages = RELANCE_STAGES.map((s) => ({ num: s.num, day: s.day, eligibles: rows.filter((r) => !r.relanceTried && !r.relancePaused && r.joursDepuisEnvoi >= s.day && r.joursOuvresDepuisDerniereRelance >= MIN_OPEN_DAYS_BETWEEN_RELANCES && r.relances === s.num - 1 && noRealReply(r.replyKind)).length }));
  return { total: rows.length, rows, stages, replyCounts: replyCountsOf(ps), lastScanAt: lastScanOf(ps), commentedCount: rows.filter((r) => r.commentText).length, devisMixupCount: rows.filter((r) => r.devisMixup).length };
}

// Garde-fou : scanne les commentaires internes (humains) sur les conversations
// Front des dossiers en boucle de relances. Pose rs4Comment* si commentaire trouvé,
// nettoie sinon. Exclut les commentaires automatiques (règles). Par lots.
export async function scanFrontComments(offset: number, limit: number): Promise<{ total: number; scanned: number; nextOffset: number; done: boolean; flagged: number }> {
  const ps = await volet3Pipelines();
  const slice = ps.slice(offset, offset + limit);
  let flagged = 0;
  for (const p of slice) {
    const cid = p.events.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean).pop();
    if (!cid) { await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4CommentAt: null, rs4CommentText: null, rs4CommentBy: null } }); continue; }
    const cm = await frontGet(`/conversations/${cid}/comments`);
    const results = ((cm?._results as { author?: { email?: string; is_teammate?: boolean }; body?: string; posted_at?: number }[]) ?? [])
      .filter((c) => {
        const body = (c.body ?? "").trim();
        if (!(c.author?.email ?? "").includes("@")) return false;
        if (/associated to a project|marked as|custom field/i.test(body)) return false;
        // On ne garde QUE les vrais commentaires : on écarte les pings de statut
        // « En cours » et les commentaires automatiques « Nom du PCS : … ».
        if (/^en\s*cours\.?$/i.test(body)) return false;
        if (/nom du pcs/i.test(body)) return false;
        return true;
      });
    if (!results.length) { await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4CommentAt: null, rs4CommentText: null, rs4CommentBy: null } }); continue; }
    const last = results.sort((a, b) => (b.posted_at ?? 0) - (a.posted_at ?? 0))[0];
    await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4CommentAt: last.posted_at ? new Date(last.posted_at * 1000) : new Date(), rs4CommentText: (last.body ?? "").replace(/\s+/g, " ").slice(0, 240), rs4CommentBy: last.author?.email ?? null } });
    flagged++;
  }
  const nextOffset = offset + slice.length;
  return { total: ps.length, scanned: slice.length, nextOffset, done: nextOffset >= ps.length, flagged };
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
// Renvoie null en cas d'ÉCHEC de lecture (token absent, statut non-OK type 429
// rate-limit, exception réseau). Les appelants DOIVENT distinguer null (échec)
// d'une réponse valide vide — sinon un rate-limit transitoire est pris pour
// « aucune donnée » (cf. bug scan qui rétrogradait des RS reçus en sans réponse).
async function frontGet(path: string): Promise<Record<string, unknown> | null> {
  if (!FRONT_TOKEN) return null;
  try {
    const res = await fetch(`${FRONT_API_URL}${path}`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
// Rouvre une conversation (statut open) SANS toucher l'assigné → elle réapparaît
// dans l'inbox Gufetto (affichée « assigned » au gestionnaire déjà en place),
// sans déclencher de notif d'assignation. Best-effort.
async function reopenConversation(cid: string): Promise<void> {
  if (!FRONT_TOKEN) return;
  await fetch(`${FRONT_API_URL}/conversations/${cid}`, { method: "PATCH", headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "open" }) }).catch(() => {});
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
    select: {
      id: true, coproId: true, rs4SentAt: true, rs4RelanceAt: true, rs4ReplyConvId: true,
      events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } },
    },
    orderBy: { rs4SentAt: "asc" },
  });
  const slice = ps.slice(offset, offset + limit);
  const counts: Record<string, number> = {};
  const now = new Date();
  type FMsg = { id: string; is_inbound: boolean; created_at: number; error_type?: string; blurb?: string; attachments?: { contentType?: string; filename?: string }[]; author?: { email?: string }; recipients?: { role: string; handle: string }[] };
  for (const p of slice) {
    const sendCids = [...new Set(p.events.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean) as string[])];
    // Périmètre de scan = fils d'ENVOI + la conv de réponse hors-fil DÉJÀ reliée au
    // dossier (rs4ReplyConvId, posée par le récupérateur). On NE relit PAS les convs
    // des events de récupération historiques : si un faux rapatriement a été annulé
    // (rs4ReplyConvId remis à null), la conv hors sujet n'est plus jamais re-scannée.
    const scanCids = [...new Set([...sendCids, ...(p.rs4ReplyConvId ? [p.rs4ReplyConvId] : [])])];
    if (!scanCids.length) { await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: "non_scanne" } }); counts["non_scanne"] = (counts["non_scanne"] ?? 0) + 1; continue; }
    const sendSet = new Set(sendCids);
    const sentMs = new Date(p.rs4SentAt!).getTime();
    const resultsByCid: Record<string, FMsg[]> = {};
    const inboundAll: { m: FMsg; cid: string }[] = [];
    let bounce = false;
    let readFailed = false; // au moins une lecture Front a échoué (rate-limit/réseau)
    for (const cid of scanCids) {
      const list = await frontGet(`/conversations/${cid}/messages?limit=20`);
      if (list === null) { readFailed = true; resultsByCid[cid] = []; continue; }
      const results = ((list?._results as unknown[]) ?? []) as FMsg[];
      resultsByCid[cid] = results;
      const isSendConv = sendSet.has(cid);
      if (isSendConv) bounce = bounce || results.some((m) => !m.is_inbound && m.error_type);
      // Fil d'envoi : on ne compte que les entrants POSTÉRIEURS à notre envoi.
      // Conv récupérée hors-fil : déjà validée comme réponse à notre demande → on
      // ne la filtre pas sur la date (rs4SentAt a pu avancer avec les relances).
      for (const m of results.filter((m) => m.is_inbound && !isFromMatera(m) && (!isSendConv || m.created_at * 1000 > sentMs))) inboundAll.push({ m, cid });
    }
    if (!inboundAll.length && !bounce) {
      // GARDE-FOU : ne JAMAIS rétrograder en « sans réponse » si une lecture Front a
      // échoué (rate-limit/réseau) — sinon un RS reçu réel est écrasé (incident 27/08).
      // On laisse le verdict actuel intact et on ne stampe pas scanAt → re-scan plus tard.
      if (readFailed) { counts["erreur_lecture"] = (counts["erreur_lecture"] ?? 0) + 1; continue; }
      await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: "sans_reponse", rs4ReplyAt: null, rs4ReplySnippet: null, rs4ReplyMsgId: null } }); counts["sans_reponse"] = (counts["sans_reponse"] ?? 0) + 1; continue;
    }
    inboundAll.sort((a, b) => b.m.created_at - a.m.created_at); // plus récente en tête, tous fils confondus
    const last = inboundAll[0] ?? null;
    let body = "", snippet = "", hasDoc = inboundAll.some((x) => realDoc(x.m.attachments ?? []));
    if (last) {
      const full = (await frontGet(`/messages/${last.m.id}`)) as { content?: string; attachments?: { contentType?: string; filename?: string }[] } | null;
      body = stripHtml(full?.content || last.m.blurb || "").slice(0, 500);
      snippet = body.slice(0, 160);
      if (full?.attachments && realDoc(full.attachments)) hasDoc = true;
    }
    const kind = classifyReply(body, hasDoc, bounce && !inboundAll.length);
    // Conv de la réponse : pour un RS reçu, on pointe vers le fil qui porte le doc.
    const docItem = inboundAll.find((x) => realDoc(x.m.attachments ?? []));
    const replyCid = (kind === "rs_recu" && docItem ? docItem.cid : last?.cid) ?? sendCids[sendCids.length - 1] ?? scanCids[0];
    const lastConvResults = last ? (resultsByCid[last.cid] ?? []) : [];
    const lastMsg = [...lastConvResults].sort((a, b) => b.created_at - a.created_at)[0];
    // RETOUR REÇU (hors RS reçu) sur un dossier DÉJÀ relancé → on ne monte JAMAIS en
    // relance 2/3 : le compteur repart à zéro (relance repart à 1, ton amical) et le
    // délai est recalculé depuis le dernier échange. (Choix Quentin : toute réponse
    // reçue, même une transmission interne, remet en relance 1.)
    if (kind !== "rs_recu" && relanceCountOf(p.events) > 0) {
      const lastActMs = Math.max(last?.m.created_at ?? 0, lastMsg?.created_at ?? 0) * 1000;
      await prisma.pipelineEvent.deleteMany({ where: { pipelineId: p.id, metadata: { path: ["auto"], equals: "rs4_relance" } } });
      await prisma.insurancePipeline.update({ where: { id: p.id }, data: {
        rs4ReplyScanAt: now, rs4ReplyKind: "sans_reponse", rs4ReplyMsgId: last?.m.id ?? null, rs4ReplyConvId: replyCid,
        rs4ReplyAt: last ? new Date(last.m.created_at * 1000) : now,
        rs4ReplySnippet: `↩︎ retour reçu (relance remise à 1) : ${snippet || "(voir conversation)"}`.slice(0, 240),
        rs4SentAt: lastActMs ? new Date(lastActMs) : p.rs4SentAt,
        ...(p.rs4RelanceAt ? { rs4RelanceAt: null } : {}),
      } });
      await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Retour reçu (${kind}) après relance → relance remise à 1 (ton amical), délai recalculé depuis le dernier échange`, metadata: { auto: "rs4_relance_reset_to_1", kind }, createdBy: "auto:scan" } });
      counts["relance_reset"] = (counts["relance_reset"] ?? 0) + 1;
      continue;
    }
    // « On a répondu en DERNIER » : UNIQUEMENT si la dernière réponse est dans un fil
    // d'ENVOI (relance) et qu'on a répondu après → dossier relançable. Une réponse
    // arrivée hors-fil (conv récupérée) est une VRAIE réponse (jamais weRepliedLast).
    const weRepliedLast = kind !== "rs_recu" && !!last && sendSet.has(last.cid) && !!lastMsg && !lastMsg.is_inbound && !lastMsg.error_type && lastMsg.created_at > last.m.created_at;
    if (weRepliedLast) {
      await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: "sans_reponse", rs4ReplyAt: null, rs4ReplySnippet: "En attente de leur réponse (dernier message : nous)", rs4ReplyMsgId: null, rs4ReplyConvId: last!.cid, rs4SentAt: new Date(lastMsg.created_at * 1000), ...(p.rs4RelanceAt ? { rs4RelanceAt: null } : {}) } });
      counts["sans_reponse"] = (counts["sans_reponse"] ?? 0) + 1;
      continue;
    }
    // Réponse détectée sur un dossier en boucle de relances (V4) → retour auto au
    // détecteur (V3) pour re-tri : on efface rs4RelanceAt.
    const backToDetector = !!p.rs4RelanceAt;
    await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: kind, rs4ReplyAt: last ? new Date(last.m.created_at * 1000) : now, rs4ReplySnippet: snippet || (bounce ? "Échec de remise (bounce)" : null), rs4ReplyMsgId: last?.m.id ?? null, rs4ReplyConvId: replyCid, ...(backToDetector ? { rs4RelanceAt: null } : {}) } });
    // Réponse détectée → rouvrir la conv Front (sans re-assigner) pour qu'elle
    // soit visible au même endroit dans l'inbox Gufetto.
    if (last) await reopenConversation(last.cid);
    // « RS reçu » → capturer les PJ (relevé + contrat MRI) dans Gufetto (Supabase),
    // typées par contenu. Idempotent, best-effort (n'interrompt pas le scan).
    if (kind === "rs_recu" && hasDoc) {
      try {
        const cp = await prisma.copro.findUnique({ where: { id: p.coproId! }, select: { nom: true, adresse: true } });
        if (cp) await captureReplyDocs({ pipelineId: p.id, coproId: p.coproId!, adresse: cp.adresse || cp.nom, msgIds: inboundAll.map((x) => x.m.id) });
      } catch { /* capture best-effort */ }
    }
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

// « Mauvais mail, repartir à zéro » (fiche + Volet 5) : réinitialise la conv RS.
// Le dossier RESTE dans les automatisations. On archive la/les conversation(s)
// Front existante(s) (mauvais mail / redirection), on supprime les events d'envoi
// (draft_sent) — donc la fiche re-affiche le formulaire d'envoi sans l'ancienne
// date — et on remet à zéro l'état RS (envoi/relance/en-cours/verdict). Au nouvel
// envoi, logRSDraftSent repose rs4SentAt → le dossier repart au détecteur.
export async function resetRsConv(pipelineId: string, actorEmail: string): Promise<{ ok: boolean; archived: number }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { id: true } });
  if (!p) return { ok: false, archived: 0 };
  const archived = await archiveConversationsFor(pipelineId);
  await prisma.pipelineEvent.deleteMany({ where: { pipelineId, metadata: { path: ["rsType"], equals: "draft_sent" } } });
  await prisma.insurancePipeline.update({
    where: { id: pipelineId },
    data: {
      rs4SentAt: null, rs4RelanceAt: null, rs4EnCoursAt: null,
      rs4ReplyKind: null, rs4ReplyAt: null, rs4ReplySnippet: null, rs4ReplyMsgId: null, rs4ReplyConvId: null, rs4ReplyScanAt: null,
      rs4CommentAt: null, rs4CommentText: null, rs4CommentBy: null,
    },
  });
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "Conversation RS réinitialisée (mauvais mail / redirection) — à renvoyer", metadata: { auto: "rs4_reset_conv" }, createdBy: actorEmail } });
  return { ok: true, archived };
}

// Récupère les conversations RS qui ont été déplacées HORS de l'inbox Gufetto
// (règle Matera « projet Duomo » → CSM) et les re-classe dans l'inbox Gufetto.
// Par lots. Ne touche que celles qui ne sont PAS déjà dans Gufetto.
// Bouton « Récupérer les conversations des inbox hors Gufetto ». Itère les
// dossiers RS (RS envoyée, en cours) et fait DEUX choses par dossier :
//  1) NOS fils : les conversations de nos envois RS qui ont dérivé hors Gufetto
//     (règle Matera → CSM) sont ramenées dans l'inbox Gufetto ;
//  2) RÉPONSES HORS-FIL : via le building_id, on cherche dans TOUTES les inboxes
//     une conversation (≠ nos fils, non taguée gufetto) dont le SUJET est celui de
//     notre demande/relance RS (« relevé de sinistralité ») et qui contient une
//     réponse externe — AVEC OU SANS document (le courtier/assureur a répondu dans
//     un nouveau mail, éventuellement pour réclamer une pièce). On la rapatrie dans
//     Gufetto + tag, on capture le doc s'il y en a un, on relie la réponse au
//     dossier et on le sort de la boucle de relance (retour détecteur). Le tag
//     gufetto = marqueur « traité » (dédup des prochains scans). Un mail du courtier
//     sur un autre sujet (« changement de syndic »…) n'est jamais aspiré.
export async function recoverEscapedConversations(offset: number, limit: number): Promise<{ total: number; processed: number; nextOffset: number; done: boolean; moved: number; replies: number; errors: number }> {
  if (!FRONT_TOKEN) return { total: 0, processed: 0, nextOffset: offset, done: true, moved: 0, replies: 0, errors: 0 };
  const excl = await getExcludedCoproIds();
  const where = { statut: "rs_en_cours" as const, rs4SentAt: { not: null }, coproId: { notIn: excl }, copro: { archivedAt: null } };
  const total = await prisma.insurancePipeline.count({ where });
  const dossiers = await prisma.insurancePipeline.findMany({
    where, orderBy: { id: "asc" }, skip: offset, take: limit,
    select: { id: true, coproId: true, rs4SentAt: true, copro: { select: { nom: true, adresse: true, buildingId: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } } },
  });
  const inGufettoInbox = async (cid: string): Promise<boolean> => {
    const r = await frontGet(`/conversations/${cid}/inboxes`);
    const res = ((r?._results as unknown[]) ?? []) as { id: string; name: string }[];
    return res.some((x) => x.id === GUFETTO_INBOX || /gufetto/i.test(x.name));
  };
  const moveToGufetto = (cid: string) => fetch(`${FRONT_API_URL}/conversations/${cid}`, { method: "PATCH", headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ inbox_id: GUFETTO_INBOX }) });

  let moved = 0, replies = 0, errors = 0;
  const now = new Date();
  for (const p of dossiers) {
    const ourCids = new Set(p.events.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean) as string[]);
    // 1) Ramener nos fils qui ont dérivé.
    for (const cid of ourCids) {
      try { if (!(await inGufettoInbox(cid))) { const mv = await moveToGufetto(cid); if (mv.ok) moved++; else errors++; } } catch { errors++; }
    }
    // 2) Réponses à NOS demandes RS arrivées dans une AUTRE conversation (nouveau
    //    fil, ou thread ré-ouvert hors de nos cids), repérées par building_id.
    const bid = p.copro.buildingId;
    if (!bid) continue;
    // CRITÈRE : on ne rapatrie une conv QUE si c'est une RÉPONSE À NOTRE DEMANDE RS
    // — reconnue par son SUJET (celui de notre demande / relance : « relevé de
    // sinistralité »), même quand notre mail n'apparaît que cité dans le corps de
    // la réponse (le courtier a ouvert un nouveau fil, « on voit notre mail en
    // dessous »). On NE se base PLUS sur le domaine de l'expéditeur ni sur la
    // présence d'une pièce jointe :
    //   - un courtier peut répondre SANS document (« vous n'êtes pas souscripteur,
    //     envoyez-moi le PV d'AG »…) et ça reste une vraie réponse à traiter ;
    //   - un mail du courtier sur un AUTRE sujet (ex. « changement de syndic »),
    //     même avec PJ, ne doit PAS être aspiré.
    const isRsSubject = (s: string) => /sinistralit/i.test(s) || /relev[ée]s?\s+(?:de\s+|des\s+)?sinistr/i.test(s);
    const sentMs = new Date(p.rs4SentAt!).getTime();
    const sd = await frontGet(`/conversations/search/${encodeURIComponent(`custom_field:"building_id=${bid}"`)}?limit=50`);
    const convs = (((sd?._results as unknown[]) ?? []) as { id: string; subject?: string; tags?: { id: string }[] }[])
      .filter((c) => !ourCids.has(c.id) && !(c.tags ?? []).some((t) => t.id === "tag_23n286") && isRsSubject(c.subject ?? ""))
      .slice(0, 12);
    for (const c of convs) {
      const list = await frontGet(`/conversations/${c.id}/messages?limit=20`);
      const msgs = ((list?._results as unknown[]) ?? []) as { id: string; is_inbound: boolean; created_at: number; blurb?: string; attachments?: { contentType?: string; filename?: string }[]; author?: { email?: string }; recipients?: { role: string; handle: string }[] }[];
      // Entrant externe (pas Matera), postérieur à notre demande → vraie réponse à
      // traiter, AVEC OU SANS document.
      const inbound = msgs.filter((m) => m.is_inbound && m.created_at * 1000 > sentMs && !isFromMatera(m));
      if (!inbound.length) continue; // sujet RS mais aucune réponse externe → on ignore
      // Rapatriement + tag + capture (si doc) + liaison au dossier + retour détecteur.
      await moveToGufetto(c.id).catch(() => {});
      const last = inbound.sort((a, b) => b.created_at - a.created_at)[0];
      let body = "", hasDoc = inbound.some((m) => realDoc(m.attachments ?? []));
      const full = (await frontGet(`/messages/${last.id}`)) as { content?: string; attachments?: { contentType?: string; filename?: string }[] } | null;
      body = stripHtml(full?.content || last.blurb || "").slice(0, 500);
      if (full?.attachments && realDoc(full.attachments)) hasDoc = true;
      const kind = classifyReply(body, hasDoc, false);
      await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: kind, rs4ReplyAt: new Date(last.created_at * 1000), rs4ReplySnippet: body.slice(0, 160), rs4ReplyMsgId: last.id, rs4ReplyConvId: c.id, rs4RelanceAt: null } });
      if (kind === "rs_recu" && hasDoc) {
        try { await captureReplyDocs({ pipelineId: p.id, coproId: p.coproId!, adresse: p.copro.adresse || p.copro.nom, msgIds: inbound.map((m) => m.id) }); } catch { /* best-effort */ }
      }
      await tagConversation(c.id, ["tag_23n286"]).catch(() => {});
      await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Réponse RS hors-fil récupérée (${kind}) — conv rapatriée dans Gufetto + reliée au dossier`, metadata: { auto: "rs4_recovered_offthread_reply", kind, conversationId: c.id }, createdBy: "auto:recover_inbox" } });
      replies++;
      break; // une réponse hors-fil par dossier suffit
    }
  }
  const nextOffset = offset + dossiers.length;
  return { total, processed: dossiers.length, nextOffset, done: nextOffset >= total, moved, replies, errors };
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

// Cas « redirection » : le contact nous renvoie vers un autre mail. On CLÔTURE
// la conversation Front actuelle (archive) et on renvoie le dossier au Volet 1,
// mail effacé, pour un nouvel envoi au bon contact. La nouvelle demande RS créera
// une nouvelle conversation qui sera automatiquement rattachée au dossier
// (le détecteur lit toujours le DERNIER draft_sent → dernière conversationId).
export async function closeRedirectConversation(actorEmail: string, pipelineId: string): Promise<{ ok: boolean; archived: number }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { rsBatchAt: true, coproId: true, copro: { select: { contactCourtierEmail: true } } } });
  if (!p) return { ok: false, archived: 0 };
  const archived = await archiveConversationsFor(pipelineId);
  await prisma.copro.update({ where: { id: p.coproId }, data: { contactCourtierEmail: null } });
  await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { rsBatchAt: p.rsBatchAt ?? new Date(), rs4Volet2At: null, rs4SentAt: null, rs4RelanceAt: null, rs4EnCoursAt: null, rs4ReplyKind: null, rs4ReplyAt: null, rs4ReplySnippet: null, rs4ReplyMsgId: null, rs4ReplyConvId: null, rs4ReplyScanAt: null } });
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Conversation clôturée (redirection vers un autre contact) — renvoyé au Volet 1 pour nouvel envoi${p.copro.contactCourtierEmail ? ` (ancien contact effacé : ${p.copro.contactCourtierEmail})` : ""}`, metadata: { auto: "rs4_close_redirect", before: p.copro.contactCourtierEmail, archived }, createdBy: actorEmail } });
  return { ok: true, archived };
}

// Toggle « exclure de la boucle » / « remettre dans la boucle » : met en pause un
// dossier des relances SANS changer son étape ni son compteur (mise de côté
// temporaire). État = dernier event rs4_relance_paused.
export async function setRelancePause(pipelineId: string, paused: boolean, actorEmail: string): Promise<{ ok: boolean }> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { id: true } });
  if (!p) return { ok: false };
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: paused ? "Exclu de la boucle de relances (mise de côté temporaire)" : "Remis dans la boucle de relances", metadata: { auto: "rs4_relance_paused", paused }, createdBy: actorEmail } });
  return { ok: true };
}

// Envoie la relance n° `relanceNum` aux dossiers éligibles (J+seuil atteint et
// relance pas encore envoyée). Les dossiers restent au volet 3 jusqu'au RS reçu.
export async function sendRelance(actorEmail: string, relanceNum: number, nowMs: number, limit?: number): Promise<{ sent: number; failed: number; skippedReplied: number; errors: string[] }> {
  const stage = RELANCE_STAGES.find((s) => s.num === relanceNum);
  const tpl = RELANCE_TEMPLATES[relanceNum];
  if (!stage || !tpl) return { sent: 0, failed: 0, skippedReplied: 0, errors: ["relance inconnue"] };
  const ps = await volet3Pipelines();
  const signature = await getSignatureHtml(actorEmail);
  const idx = await getCourtierIndex();
  const now = new Date();
  // Curseur : dossiers déjà TENTÉS sans succès (hold/pas de mail/erreur) récemment
  // → exclus du lot pour que « envoyer N » enchaîne les SUIVANTS et ne reboucle pas
  // sur les mêmes échecs. Cooldown 12 h : ils redeviennent tentables après (ou une
  // fois le mail/courtier corrigé). Marqueur = event rs4_relance_tried.
  const triedCooldown = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const triedEv = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["auto"], equals: "rs4_relance_tried" }, createdAt: { gte: triedCooldown } },
    select: { pipelineId: true, metadata: true },
  });
  const triedSet = new Set(triedEv.filter((e) => Number((e.metadata as { relanceNum?: number } | null)?.relanceNum) === relanceNum).map((e) => e.pipelineId));
  // Dossiers mis en pause manuellement (« exclure de la boucle ») → jamais relancés.
  const pausedEv2 = await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["auto"], equals: "rs4_relance_paused" } }, select: { pipelineId: true, metadata: true }, orderBy: { createdAt: "asc" } });
  const pausedSet = new Map<string, boolean>();
  for (const e of pausedEv2) pausedSet.set(e.pipelineId, !!(e.metadata as { paused?: boolean } | null)?.paused);
  const markTried = (pipelineId: string, reason: string) =>
    prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Relance ${relanceNum} non envoyée (${reason}) — passée, on tente les suivantes`, metadata: { auto: "rs4_relance_tried", relanceNum, reason }, createdBy: actorEmail } });
  // Éligibles : délai atteint, EXACTEMENT relanceNum-1 relances déjà faites
  // (séquence 1→2→3) et aucune réponse réelle connue.
  const isRealReply = (k: string | null) => !!k && k !== "sans_reponse" && k !== "non_scanne";
  const eligible = ps.filter((p) => {
    if (triedSet.has(p.id)) return false; // déjà tenté récemment → on passe aux suivants
    if (pausedSet.get(p.id)) return false; // mis en pause manuellement → jamais relancé
    // GARDE-FOU : on ne relance QUE si un VRAI envoi de notre part existe (draft_sent
    // relanceNum 0 + destinataire). Un dossier « lié » à une conv étrangère/ancienne
    // (pas d'envoi de nous) n'est jamais relancé.
    const base = latestInitialSend(p.events);
    if (!base) return false;
    // Timing = MAX(dernier envoi initial, rs4SentAt) → relançable à J+seuil du renvoi
    // (nouvelle boucle de mail) ou de notre dernière réponse, jamais de la conv de base.
    const baseMs = Math.max(base.date.getTime(), new Date(p.rs4SentAt!).getTime());
    const jours = Math.floor((nowMs - baseMs) / 86400000);
    // Plancher : au moins 4 jours OUVRÉS depuis le dernier envoi (initial/relance).
    if (openDaysSince(latestSendDate(p.events), nowMs) < MIN_OPEN_DAYS_BETWEEN_RELANCES) return false;
    return jours >= stage.day && relanceCountOf(p.events) === relanceNum - 1 && !isRealReply(p.rs4ReplyKind);
  });
  const slice = typeof limit === "number" ? eligible.slice(0, limit) : eligible;

  let sent = 0, failed = 0, skippedReplied = 0;
  const errors: string[] = [];
  for (const p of slice) {
    const c = p.copro;
    // Base = dernier envoi initial (nouvelle boucle de mail) → on RELANCE dans CE fil
    // (le bon mail), pas la conv de base. Compteur de jours = MAX(rs4SentAt, ce renvoi).
    const base = latestInitialSend(p.events);
    const baseMs = Math.max(base ? base.date.getTime() : 0, new Date(p.rs4SentAt!).getTime());
    const jours = Math.floor((nowMs - baseMs) / 86400000);
    const cid = base?.cid
      ?? p.events.map((e) => (e.metadata as { conversationId?: string } | null)?.conversationId).filter(Boolean).pop() ?? null;
    if (!cid) { failed++; errors.push(`${c.nom} : pas de conversation d'origine — non relancé`); await markTried(p.id, "pas de conversation d'origine"); continue; }

    // GARDE-FOU FINAL (live) : si une réponse externe existe depuis notre demande,
    // on NE RELANCE PAS. On regarde le fil d'origine ET tous les autres fils
    // « gufetto » du MÊME IMMEUBLE (building_id) — car un courtier répond parfois
    // dans un mail séparé (le RS déjà envoyé ailleurs). → marque + retour détecteur.
    // FENÊTRE = depuis la DEMANDE INITIALE (1er draft_sent), PAS depuis baseMs :
    // rs4SentAt a pu avancer quand on a répondu APRÈS une réponse du courtier
    // (weRepliedLast / relance remise à 1), ce qui « consommait » sa réponse et le
    // rendait relançable. Règle Quentin : toute conv où le courtier a répondu — même
    // si on a renvoyé après, peu importe le contenu — ne doit JAMAIS être relancée.
    // p.events ne contient que des draft_sent → leur min = notre 1er envoi.
    const firstSendMs = p.events.length ? Math.min(...p.events.map((e) => e.createdAt.getTime())) : baseMs;
    const sentMs = Math.min(baseMs, firstSendMs);
    type FMsg = { id: string; is_inbound: boolean; created_at: number; blurb?: string; attachments?: { contentType?: string; filename?: string }[]; author?: { email?: string }; recipients?: { role: string; handle: string }[] };
    const convToCheck = new Set<string>([cid]);
    if (p.copro.buildingId) {
      const q = encodeURIComponent(`custom_field:"building_id=${p.copro.buildingId}"`);
      const sd = await frontGet(`/conversations/search/${q}?limit=50`);
      const gufettoConvs = (((sd?._results as unknown[]) ?? []) as { id: string; tags?: { id: string }[] }[])
        .filter((cc) => (cc.tags ?? []).some((t) => t.id === "tag_23n286"));
      for (const cc of gufettoConvs.slice(0, 15)) convToCheck.add(cc.id);
    }
    let repliedConv: string | null = null; let repliedMsgs: FMsg[] = [];
    for (const ccid of convToCheck) {
      const list = await frontGet(`/conversations/${ccid}/messages?limit=20`);
      const results = ((list?._results as unknown[]) ?? []) as FMsg[];
      const inbound = results.filter((m) => m.is_inbound && m.created_at * 1000 > sentMs && !isFromMatera(m));
      if (inbound.length) { repliedConv = ccid; repliedMsgs = inbound; break; }
    }
    if (repliedConv) {
      const last = repliedMsgs.sort((a, b) => b.created_at - a.created_at)[0];
      const body = stripHtml(last.blurb || "").slice(0, 300);
      const kind = classifyReply(body, repliedMsgs.some((m) => realDoc(m.attachments ?? [])), false);
      const autreFil = repliedConv !== cid;
      const flagSnippet = `⚠️ À traiter à la main — le courtier a répondu (${kind}${autreFil ? ", autre fil" : ""}) : ${body || "(voir conversation)"}`.slice(0, 240);
      await prisma.insurancePipeline.update({ where: { id: p.id }, data: { rs4ReplyScanAt: now, rs4ReplyKind: kind, rs4ReplyAt: new Date(last.created_at * 1000), rs4ReplySnippet: flagSnippet, rs4ReplyMsgId: last.id, rs4ReplyConvId: repliedConv, rs4RelanceAt: null } });
      await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Relance ${relanceNum} ANNULÉE — réponse détectée depuis la demande initiale (${kind}${autreFil ? ", autre fil du même immeuble" : ""}), dossier sorti de la boucle → à traiter à la main`, metadata: { auto: "rs4_relance_skipped_replied", kind, autreFil }, createdBy: actorEmail } });
      skippedReplied++;
      continue;
    }

    // Destinataire propre (mêmes garde-fous qu'à l'envoi initial).
    const plan = prepareSendMails(c.courtierActuel, c.contactCourtierEmail, idx, c.assureurActuel);
    if (plan.hold) { failed++; errors.push(`${c.nom} : ${plan.reason} — non relancé`); await markTried(p.id, plan.reason); continue; }
    const toList = plan.mails;
    if (DEVIS_ADDRESSES.some((a) => toList.join(", ").toLowerCase().includes(a))) { failed++; errors.push(`${c.nom} : destinataire = adresse de devis (AXA/Mila) — non relancé`); await markTried(p.id, "adresse de devis"); continue; }

    const vars = { adresse: c.adresse || c.nom, assureur: c.assureurActuel || "", numeroContrat: c.numeroContrat || "", nom: c.nom, jours: String(jours) };
    const subject = fillTemplate(tpl.subject, vars);
    const html = renderHtml(fillTemplate(tpl.body, vars), signature, `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${p.id}:rs_relance</span>`);
    // Envoi EN RÉPONSE dans le fil d'origine (pas de nouvelle conversation).
    const r = await frontReply({ conversationId: cid, toList, subject, html, authorEmail: actorEmail });
    if (!r.ok) { failed++; errors.push(`${c.nom} : ${r.error ?? "échec"}`); await markTried(p.id, "échec d'envoi Front"); continue; }
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Relance ${relanceNum} de la demande de RS envoyée (${toList.join(", ")})`, metadata: { rsType: "draft_sent", relanceNum, to: toList.join(", "), conversationId: cid, auto: "rs4_relance" }, createdBy: actorEmail } });
    sent++;
  }
  if (sent > 0 || failed > 0 || skippedReplied > 0) await prisma.rs4SendLog.create({ data: { kind: "relance", relanceNum, count: sent, failed, actorEmail } });
  return { sent, failed, skippedReplied, errors: errors.slice(0, 20) };
}

// (RS reçu = réutilise l'action existante marquerRSRecu → rs_en_cours → devis_demandes.)

// ─── Volet 4 : « RS en cours de récupération » (courtier a répondu, RS pas reçu) ──
export type Volet4Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; replyKind: string | null; replySnippet: string | null; replyConvUrl: string | null };
export type Volet4Data = { total: number; rows: Volet4Row[] };

export async function getRs4Volet4Data(nowMs: number): Promise<Volet4Data> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rs4EnCoursAt: { not: null }, coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: { id: true, rs4SentAt: true, rs4EnCoursAt: true, rs4ReplyKind: true, rs4ReplySnippet: true, rs4ReplyConvId: true, copro: { select: { nom: true, adresse: true, courtierActuel: true, contactCourtierEmail: true } }, events: { where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true, createdAt: true } } },
    orderBy: { rs4EnCoursAt: "desc" },
  });
  const rows: Volet4Row[] = ps.map((p) => ({
    pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail,
    joursDepuisEnvoi: p.rs4SentAt ? Math.floor((nowMs - new Date(p.rs4SentAt).getTime()) / 86400000) : 0,
    // Lien Front : conv de réponse si détectée, sinon fallback sur la conv du dernier
    // envoi initial → chaque dossier a toujours un lien cliquable.
    replyKind: p.rs4ReplyKind, replySnippet: p.rs4ReplySnippet, replyConvUrl: FRONT_CONV_URL(p.rs4ReplyConvId ?? latestInitialSend(p.events)?.cid ?? null),
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
