// Automatisation 6 — bouton « Envoyer » : prévient le gestionnaire des nouveaux
// devis via un message posté dans un canal Slack (Incoming Webhook / Workflow
// Builder). Étape 1 : composition + envoi du message. La validation cliquable
// (page tokenisée) est ajoutée à l'étape 2.
import { prisma } from "@/lib/prisma";
import { resolvePrimeReference } from "@/lib/devis-prime";
import { getDernierePrimePayeeFromFront } from "@/lib/front-insurance";
import { signValidationToken } from "@/lib/devis6-token";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://gufetto-insurance.up.railway.app";
const fmtE = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

type ExtractedLite = { assureur?: string; primeTTC?: number; garanties?: Record<string, boolean> };
function parse(raw: string | null): ExtractedLite {
  if (!raw) return {};
  try { return JSON.parse(raw) as ExtractedLite; } catch { return {}; }
}

// Compose le message (markdown) envoyé au gestionnaire pour un dossier.
export async function buildGestionnaireMessage(pipelineId: string): Promise<{ ok: true; text: string; blocks: unknown[] } | { ok: false; error: string }> {
  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, assureurActuel: true, primeActuelle: true, buildingId: true, gestionnaireNom: true, gestionnaireEmail: true } },
      devisRecus: { orderBy: { createdAt: "asc" }, select: { assureur: true, primeTTC: true, data: true } },
    },
  });
  if (!p) return { ok: false, error: "Dossier introuvable" };
  const devis = p.devisRecus.filter((d) => d.data && d.data.trim());
  if (!devis.length) return { ok: false, error: "Comparaison non générée pour ce dossier" };

  const contrat = parse(p.contratActuelData);
  const assureurActuel = contrat.assureur || p.copro.assureurActuel || "—";
  // Prix actuel = base Gufetto (resolvePrimeReference : le + haut entre contrat et
  // dernière prime payée, dans la bande de cohérence). MÊME règle que les cartes.
  const contratPrime = typeof contrat.primeTTC === "number" ? contrat.primeTTC : p.copro.primeActuelle;
  let dernierePrime: number | null = null;
  try {
    const r = await getDernierePrimePayeeFromFront(p.copro.buildingId ?? "", pipelineId, [p.copro.adresse, p.copro.nom]);
    if (r && typeof r.montant === "number") dernierePrime = r.montant;
  } catch { /* best-effort */ }
  const base = resolvePrimeReference(contratPrime, dernierePrime);
  const prixActuel = base.flag === "bloque" ? base.contrat : base.value;

  // Meilleur devis (le moins cher) → économie + synthèse garanties.
  const best = devis.reduce((a, b) => (b.primeTTC < a.primeTTC ? b : a));
  const bestData = parse(best.data);
  const economie = prixActuel != null ? prixActuel - best.primeTTC : null;
  const pjBest = bestData.garanties?.protectionJuridique;
  const pjContrat = contrat.garanties?.protectionJuridique;

  // Slack mrkdwn : gras = *texte* (une seule étoile), italique = _texte_.
  const devisLine = (d: { assureur: string; primeTTC: number } | undefined, n: number) =>
    d ? `• *Devis ${n}* : ${fmtE(d.primeTTC)} — _${d.assureur}_` : null;

  const synthese: string[] = [];
  if (economie != null) synthese.push(economie > 0
    ? `Meilleur devis (*${best.assureur}*, ${fmtE(best.primeTTC)}) → économie ≈ *${fmtE(Math.abs(economie))}/an* vs le prix actuel.`
    : `Meilleur devis (*${best.assureur}*, ${fmtE(best.primeTTC)}) → *+${fmtE(Math.abs(economie))}/an* vs le prix actuel.`);
  synthese.push("Garanties globalement comparables au contrat en place.");
  // Alerter sur la PJ UNIQUEMENT si le contrat actuel en a une et que le devis retenu ne l'a pas (perte réelle).
  if (pjContrat === true && pjBest === false) synthese.push("⚠️ Protection juridique présente au contrat actuel mais absente du devis retenu — à valider.");

  // @mention du gestionnaire (ping) si on résout son ID Slack via son email ;
  // sinon on garde son nom en texte simple.
  const gestioUid = p.copro.gestionnaireEmail ? await resolveSlackUserId(p.copro.gestionnaireEmail) : null;
  const gestioLine = gestioUid
    ? `Gestionnaire : <@${gestioUid}>`
    : (p.copro.gestionnaireNom ? `Gestionnaire : *${p.copro.gestionnaireNom}*` : null);

  const token = signValidationToken(p.id);
  void devisLine; void gestioLine; // remplacés par les puces Block Kit ci-dessous

  // Puces d'infos (emoji + gras), façon carte materabot.
  const gestioBullet = gestioUid
    ? `👤 *Gestionnaire* : <@${gestioUid}>`
    : (p.copro.gestionnaireNom ? `👤 *Gestionnaire* : *${p.copro.gestionnaireNom}*` : null);
  const infoLines = [
    gestioBullet,
    `🏢 *Copropriété* : ${p.copro.adresse || p.copro.nom}`,
    `🛡️ *Assureur actuel* : ${assureurActuel}`,
    `💰 *Prix actuel* : ${fmtE(prixActuel)} / an`,
    devis[0] ? `🧾 *Devis 1* : ${fmtE(devis[0].primeTTC)} — _${devis[0].assureur}_` : null,
    devis[1] ? `🧾 *Devis 2* : ${fmtE(devis[1].primeTTC)} — _${devis[1].assureur}_` : null,
  ].filter((l): l is string => l !== null);

  // Block Kit : en-tête + infos + résumé + lien + bouton « Valider ? ».
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "Gufetto Assurance Pro - nouveau devis !", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: infoLines.join("\n") } },
    { type: "section", text: { type: "mrkdwn", text: `*En résumé* : ${synthese.join(" ")}` } },
    { type: "section", text: { type: "mrkdwn", text: `🔗 <${BASE_URL}/pipeline/${p.id}|Voir le détail de la comparaison>` } },
    { type: "actions", elements: [ { type: "button", text: { type: "plain_text", text: "Valider ?", emoji: true }, url: `${BASE_URL}/valider-devis/${token}`, style: "primary" } ] },
  ];

  // Fallback texte (notifications + clients qui ne rendent pas les blocks).
  const text = [
    "Gufetto Assurance Pro - nouveau devis !",
    ...infoLines,
    `En résumé : ${synthese.join(" ")}`,
    `Répondre : ${BASE_URL}/valider-devis/${token}`,
  ].join("\n");

  return { ok: true, text, blocks };
}

// Poste le message dans le canal via le webhook Slack (`text` + `blocks` optionnels).
export async function postToDevisChannel(text: string, blocks?: unknown[]): Promise<{ ok: boolean; error?: string }> {
  const raw = process.env.SLACK_DEVIS_WEBHOOK_URL;
  if (!raw) return { ok: false, error: "SLACK_DEVIS_WEBHOOK_URL non configuré côté serveur" };
  // Tolérant : si on a collé toute la commande curl d'exemple de Slack au lieu de
  // la seule URL, on récupère l'URL du webhook dedans.
  const url = (raw.match(/https?:\/\/hooks\.slack\.com\/[^\s'"]+/) ?? [raw.trim()])[0];
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(blocks ? { text, blocks } : { text }) });
    if (!res.ok) return { ok: false, error: `Slack a répondu ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Slack" };
  }
}

// ── Slack Web API (bot token) — activé UNIQUEMENT si SLACK_BOT_TOKEN présent ──
// Permet de : poster le message initial en récupérant son `ts`, répondre en
// THREAD de ce message, et poser une réaction dessus. Sans token, on retombe sur
// l'Incoming Webhook et les réponses restent des messages simples (historique).
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_DEVIS_CHANNEL_ID = process.env.SLACK_DEVIS_CHANNEL_ID;

async function slackApi(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; ts?: string; error?: string }> {
  if (!SLACK_BOT_TOKEN) return { ok: false, error: "SLACK_BOT_TOKEN absent" };
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; ts?: string; error?: string };
    if (!j.ok) return { ok: false, error: j.error ?? `HTTP ${res.status}` };
    return { ok: true, ts: j.ts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Slack" };
  }
}

// Poste le message initial. Bot token → chat.postMessage (renvoie ts + channel,
// nécessaire pour le threading) ; sinon → webhook (pas de ts → réponses simples).
export async function postDevisMessage(text: string, blocks?: unknown[]): Promise<{ ok: boolean; ts?: string | null; channel?: string | null; error?: string }> {
  if (SLACK_BOT_TOKEN && SLACK_DEVIS_CHANNEL_ID) {
    const r = await slackApi("chat.postMessage", { channel: SLACK_DEVIS_CHANNEL_ID, text, ...(blocks ? { blocks } : {}), unfurl_links: false });
    if (r.ok) return { ok: true, ts: r.ts ?? null, channel: SLACK_DEVIS_CHANNEL_ID };
    // L'API a échoué (ex : missing_scope, bot absent du canal) → on NE bloque PAS
    // l'envoi : repli sur le webhook. Le threading se réactive dès que le token/scope est correct.
    const w = await postToDevisChannel(text, blocks);
    return { ok: w.ok, ts: null, channel: null, error: w.ok ? undefined : (r.error || w.error) };
  }
  const w = await postToDevisChannel(text, blocks);
  return { ok: w.ok, ts: null, channel: null, error: w.error };
}

// Répond DANS LE THREAD du message initial (bot token requis).
export async function postDevisThreadReply(channel: string, threadTs: string, text: string): Promise<{ ok: boolean; error?: string }> {
  return slackApi("chat.postMessage", { channel, thread_ts: threadTs, text, unfurl_links: false });
}

// Pose une réaction sur le message initial (bot token requis). `emoji` sans « : ».
export async function addDevisReaction(channel: string, ts: string, emoji: string): Promise<{ ok: boolean; error?: string }> {
  return slackApi("reactions.add", { channel, timestamp: ts, name: emoji });
}

// Poste un message (texte + blocks optionnels) dans un canal quelconque via le
// bot (chat:write). Utilisé par le recap hebdo → #team_insurance_fr.
export async function postToChannelViaBot(channel: string, text: string, blocks?: unknown[]): Promise<{ ok: boolean; ts?: string; error?: string }> {
  if (!SLACK_BOT_TOKEN) return { ok: false, error: "SLACK_BOT_TOKEN absent" };
  if (!channel) return { ok: false, error: "channel manquant" };
  return slackApi("chat.postMessage", { channel, text, ...(blocks ? { blocks } : {}), unfurl_links: false });
}

// Résout l'ID Slack d'un utilisateur à partir de son email (scope
// `users:read.email` requis). Best-effort → null si absent/non trouvé/pas de
// token. Sert à @mentionner (pinger) le gestionnaire dans le message.
export async function resolveSlackUserId(email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN || !email) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; user?: { id?: string } };
    return j.ok && j.user?.id ? j.user.id : null;
  } catch { return null; }
}

// ID Slack du bot lui-même (via auth.test) — sert à EXCLURE les réactions posées
// par le bot (✅/❌ après validation) du garde-fou « le gestio a réagi ». Mémoïsé.
let _botUserId: string | null | undefined;
export async function getBotUserId(): Promise<string | null> {
  if (_botUserId !== undefined) return _botUserId;
  if (!SLACK_BOT_TOKEN) return (_botUserId = null);
  try {
    const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; user_id?: string };
    return (_botUserId = j.ok && j.user_id ? j.user_id : null);
  } catch { return (_botUserId = null); }
}

// Lit les réactions emoji posées sur un message (scope `reactions:read` requis +
// bot membre du canal). Sert de garde-fou relance : un gestionnaire qui a réagi
// (👀/✅/👍…) a vu la proposition → on ne le relance pas. `users` = IDs des
// personnes ayant posé chaque emoji (permet d'exclure le bot lui-même).
export type SlackReaction = { name?: string; users?: string[]; count?: number };
export async function getMessageReactions(channel: string, ts: string): Promise<{ ok: boolean; reactions: SlackReaction[]; error?: string }> {
  if (!SLACK_BOT_TOKEN) return { ok: false, reactions: [], error: "SLACK_BOT_TOKEN absent" };
  try {
    const res = await fetch(`https://slack.com/api/reactions.get?channel=${encodeURIComponent(channel)}&timestamp=${encodeURIComponent(ts)}&full=true`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: { reactions?: SlackReaction[] }; error?: string };
    return { ok: !!j.ok, reactions: j.message?.reactions ?? [], error: j.error };
  } catch (e) { return { ok: false, reactions: [], error: e instanceof Error ? e.message : "fetch error" }; }
}

// Lit les réponses d'un thread (scope `channels:history` requis + bot membre du
// canal). Sert à détecter une question posée par un gestionnaire sous une propo.
export type SlackReply = { ts?: string; user?: string; text?: string; bot_id?: string; subtype?: string };
export async function getThreadReplies(channel: string, threadTs: string): Promise<{ ok: boolean; messages: SlackReply[]; error?: string }> {
  if (!SLACK_BOT_TOKEN) return { ok: false, messages: [], error: "SLACK_BOT_TOKEN absent" };
  try {
    const res = await fetch(`https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(threadTs)}&limit=100`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; messages?: SlackReply[]; error?: string };
    return { ok: !!j.ok, messages: j.messages ?? [], error: j.error };
  } catch (e) { return { ok: false, messages: [], error: e instanceof Error ? e.message : "fetch error" }; }
}
