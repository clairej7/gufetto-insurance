// Détection des QUESTIONS des gestionnaires sous une proposition de devis (auto 6).
// Quand un gestionnaire répond dans le thread du message « nouveau devis » (au lieu
// de cliquer Valider/Refuser), le bot tague Quentin dans le même thread pour qu'il
// réponde. Fonctionne par scan (cron ~5 min) via `conversations.replies` — nécessite
// le scope `channels:history` + le bot membre du canal. Marqueur `devis6_question_flagged`
// (metadata.lastReplyTs) → on ne re-tague pas la même réponse deux fois.
import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { getThreadReplies, postDevisThreadReply, resolveSlackUserId } from "@/lib/devis6-slack";

const RELAI_EMAIL = "quentin.lepoutre@matera.eu"; // qui est tagué sur une question

export async function detectDevis6Questions(
  now: Date = new Date(),
  by = "auto:devis6-question",
): Promise<{ tags: number; scanned: number; error?: string }> {
  const relaiUid = await resolveSlackUserId(RELAI_EMAIL);
  if (!relaiUid) return { tags: 0, scanned: 0, error: "UID du relai introuvable (users:read.email ?)" };

  // Dernier message « nouveaux devis » par dossier, posté dans les 45 derniers jours.
  const depuis = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const notifs = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["auto"], equals: "devis6_notify_gestionnaire" }, createdAt: { gte: depuis } },
    orderBy: { createdAt: "desc" },
    select: { pipelineId: true, createdAt: true, metadata: true },
  });
  const lastNotif = new Map<string, { slackTs: string | null; slackChannel: string | null }>();
  for (const e of notifs) {
    if (lastNotif.has(e.pipelineId)) continue;
    const m = (e.metadata ?? {}) as { slackTs?: string | null; slackChannel?: string | null };
    lastNotif.set(e.pipelineId, { slackTs: m.slackTs ?? null, slackChannel: m.slackChannel ?? null });
  }
  const ids = [...lastNotif.keys()];
  if (!ids.length) return { tags: 0, scanned: 0 };

  const [responses, flags, pipelines, excl] = await Promise.all([
    prisma.pipelineEvent.findMany({ where: { pipelineId: { in: ids }, metadata: { path: ["auto"], equals: "devis6_gestio_response" } }, select: { pipelineId: true } }),
    prisma.pipelineEvent.findMany({ where: { pipelineId: { in: ids }, metadata: { path: ["auto"], equals: "devis6_question_flagged" } }, orderBy: { createdAt: "desc" }, select: { pipelineId: true, metadata: true } }),
    prisma.insurancePipeline.findMany({ where: { id: { in: ids } }, select: { id: true, statut: true, coproId: true } }),
    getExcludedCoproIds(),
  ]);
  const responded = new Set(responses.map((r) => r.pipelineId));
  const exclSet = new Set(excl);
  const pById = new Map(pipelines.map((p) => [p.id, p]));
  const lastFlagTs = new Map<string, string>(); // dernier reply déjà signalé
  for (const f of flags) { if (lastFlagTs.has(f.pipelineId)) continue; const m = (f.metadata ?? {}) as { lastReplyTs?: string }; if (m.lastReplyTs) lastFlagTs.set(f.pipelineId, m.lastReplyTs); }

  let tags = 0, scanned = 0;
  for (const id of ids) {
    const notif = lastNotif.get(id)!;
    const p = pById.get(id);
    if (!p || p.statut !== "devis_recus" || responded.has(id) || exclSet.has(p.coproId)) continue;
    if (!notif.slackTs || !notif.slackChannel) continue;
    scanned++;
    const thread = await getThreadReplies(notif.slackChannel, notif.slackTs);
    if (!thread.ok) continue; // scope manquant / bot hors canal → on ignore (pas de blocage)
    // Réponses HUMAINES du gestionnaire (hors bot, hors messages système, hors relai lui-même).
    const humaines = thread.messages.filter((m) => m.ts && m.ts !== notif.slackTs && !m.bot_id && !m.subtype && m.user && m.user !== relaiUid);
    if (!humaines.length) continue;
    const latestTs = humaines.map((m) => m.ts!).sort().at(-1)!;
    const dejaVu = lastFlagTs.get(id);
    if (dejaVu && dejaVu >= latestTs) continue; // déjà tagué pour cette réponse

    const sent = await postDevisThreadReply(notif.slackChannel, notif.slackTs, `👀 <@${relaiUid}> `);
    if (!sent.ok) continue;
    await prisma.pipelineEvent.create({
      data: { pipelineId: id, type: "action_manuelle", description: "Question gestionnaire détectée sous la propo → relai tagué en thread", metadata: { auto: "devis6_question_flagged", lastReplyTs: latestTs }, createdBy: by },
    });
    tags++;
  }
  return { tags, scanned };
}
