// Relance automatique des gestionnaires (auto 6) : quand un message de proposition
// de devis (event `devis6_notify_gestionnaire`) a été posté depuis ≥ 2 jours et que
// le gestionnaire n'a toujours PAS répondu (ni `devis6_gestio_response`, ni relance
// déjà envoyée), le bot poste une relance EN THREAD du message initial (+ re-ping).
// One-shot par cycle de notification : on ne relance qu'une fois par message posté.
import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { getThreadReplies, postDevisThreadReply, resolveSlackUserId } from "@/lib/devis6-slack";

export const RELANCE_APRES_HEURES = 48;

export async function sendDevis6Relances(
  now: Date = new Date(),
  by = "auto:devis6-relance",
  opts: { limit?: number; dryRun?: boolean; hours?: number } = {},
): Promise<{ relances: number; ignores: number; eligibles: number; dryRun: boolean; details: string[] }> {
  const heures = opts.hours && opts.hours > 0 ? opts.hours : RELANCE_APRES_HEURES; // override de test (admin) sinon 48 h
  const seuil = new Date(now.getTime() - heures * 60 * 60 * 1000);

  // Dernier message « nouveaux devis » par dossier (avec son ts/canal Slack).
  const notifs = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["auto"], equals: "devis6_notify_gestionnaire" } },
    orderBy: { createdAt: "desc" },
    select: { pipelineId: true, createdAt: true, metadata: true },
  });
  const lastNotif = new Map<string, { createdAt: Date; slackTs: string | null; slackChannel: string | null }>();
  for (const e of notifs) {
    if (lastNotif.has(e.pipelineId)) continue; // desc → le premier vu est le plus récent
    const m = (e.metadata ?? {}) as { slackTs?: string | null; slackChannel?: string | null };
    lastNotif.set(e.pipelineId, { createdAt: e.createdAt, slackTs: m.slackTs ?? null, slackChannel: m.slackChannel ?? null });
  }
  const ids = [...lastNotif.keys()];
  if (!ids.length) return { relances: 0, ignores: 0, eligibles: 0, dryRun: !!opts.dryRun, details: [] };

  const [responses, relancesEv, pipelines, excl] = await Promise.all([
    prisma.pipelineEvent.findMany({ where: { pipelineId: { in: ids }, metadata: { path: ["auto"], equals: "devis6_gestio_response" } }, select: { pipelineId: true, createdAt: true } }),
    prisma.pipelineEvent.findMany({ where: { pipelineId: { in: ids }, metadata: { path: ["auto"], equals: "devis6_relance" } }, select: { pipelineId: true, createdAt: true } }),
    prisma.insurancePipeline.findMany({ where: { id: { in: ids } }, select: { id: true, statut: true, coproId: true, copro: { select: { nom: true, gestionnaireEmail: true, archivedAt: true } } } }),
    getExcludedCoproIds(),
  ]);
  const exclSet = new Set(excl);
  const latest = (rows: { pipelineId: string; createdAt: Date }[]) => {
    const m = new Map<string, Date>();
    for (const r of rows) { const c = m.get(r.pipelineId); if (!c || r.createdAt > c) m.set(r.pipelineId, r.createdAt); }
    return m;
  };
  const lastResp = latest(responses);
  const lastRel = latest(relancesEv);
  const pById = new Map(pipelines.map((p) => [p.id, p]));

  let relances = 0, ignores = 0, eligibles = 0; const details: string[] = [];
  for (const id of ids) {
    const notif = lastNotif.get(id)!;
    const p = pById.get(id);
    // Garde-fous : dossier vivant, encore en attente de réponse, non exclu.
    if (!p || p.copro.archivedAt || exclSet.has(p.coproId) || p.statut !== "devis_recus") { ignores++; continue; }
    if (notif.createdAt > seuil) { ignores++; continue; }               // < 48 h
    if (!notif.slackTs || !notif.slackChannel) { ignores++; continue; } // posté via webhook (pas de thread possible)
    const resp = lastResp.get(id); if (resp && resp >= notif.createdAt) { ignores++; continue; } // réponse bouton (valider/refus)
    const rel = lastRel.get(id); if (rel && rel >= notif.createdAt) { ignores++; continue; }      // déjà relancé ce cycle

    // Vérif « aucun commentaire dans le fil » : si le gestio a déjà écrit quelque
    // chose (question/remarque), il a engagé la conversation → on ne relance pas.
    const thread = await getThreadReplies(notif.slackChannel, notif.slackTs);
    if (thread.ok && thread.messages.some((m) => m.ts && m.ts !== notif.slackTs && !m.bot_id && !m.subtype && m.user)) { ignores++; continue; }

    // Dossier ÉLIGIBLE à partir d'ici.
    eligibles++;
    if (opts.dryRun) { details.push(`${p.copro.nom} : éligible (dry-run, non envoyé)`); continue; }
    if (opts.limit != null && relances >= opts.limit) { ignores++; continue; } // quota de test atteint

    const uid = p.copro.gestionnaireEmail ? await resolveSlackUserId(p.copro.gestionnaireEmail) : null;
    const ping = uid ? `<@${uid}> ` : "";
    const text =
      `👋 ${ping}nous n'avons pas encore enregistré ta réponse pour cette proposition de devis, ` +
      `peux-tu cliquer sur le bouton ci-dessus et valider ou refuser la proposition ? 🙏\n` +
      `Si tu as une question, n'hésite pas à la poser directement ici !`;
    const sent = await postDevisThreadReply(notif.slackChannel, notif.slackTs, text);
    if (!sent.ok) { ignores++; details.push(`${p.copro.nom} : échec Slack (${sent.error ?? "?"})`); continue; }
    await prisma.pipelineEvent.create({
      data: { pipelineId: id, type: "action_manuelle", description: "Relance gestionnaire (48 h sans réponse) postée en thread Slack", metadata: { auto: "devis6_relance", slackTs: notif.slackTs, slackChannel: notif.slackChannel }, createdBy: by },
    });
    relances++; details.push(`${p.copro.nom} : relancé`);
  }
  return { relances, ignores, eligibles, dryRun: !!opts.dryRun, details };
}
