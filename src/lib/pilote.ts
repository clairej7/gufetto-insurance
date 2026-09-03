// Mode PILOTE — orchestration en autonomie des automatisations.
// PREMIÈRE TÂCHE BRANCHÉE : Identification › « Remplissage des informations
// manquantes » = fait tourner en boucle l'Auto 1 (runAutofillChunk) par lots de 5
// toutes les 10 min (cron), sans refaire les mêmes dossiers (curseur autofillTenteLe),
// jusqu'à épuisement du lot OU clic « Stopper le mode Pilote ».
//
// Stockage SANS changement de schéma (évite un db push qui pousserait des edits de
// schéma d'autres sessions) : on réutilise AutomationExclusion.
//   - session ACTIVE  : kind "app_flag",       value "pilote_identification", label = JSON stats en cours (createdAt = début)
//   - sessions PASSÉES : kind "pilote_session", value <timestamp>,             label = JSON recap {startedAt, endedAt, stats}
// Ces deux kinds sont filtrés de la liste d'exclusions (cf. getExclusions).

import { prisma } from "@/lib/prisma";
import { runAutofillChunk } from "@/lib/autofill-batch";

const FLAG_KIND = "app_flag";
const FLAG_VALUE = "pilote_identification";
const SESSION_KIND = "pilote_session";
const CHUNK = 5; // dossiers par tick

export type PiloteStats = { runs: number; traites: number; completes: number; sansInfo: number; erreurs: number };
const ZERO: PiloteStats = { runs: 0, traites: 0, completes: 0, sansInfo: 0, erreurs: 0 };

function parseStats(label: string | null): PiloteStats {
  try { const o = JSON.parse(label ?? "{}"); return { runs: o.runs ?? 0, traites: o.traites ?? 0, completes: o.completes ?? 0, sansInfo: o.sansInfo ?? 0, erreurs: o.erreurs ?? 0 }; }
  catch { return { ...ZERO }; }
}

// Un dossier récemment traité (pour le suivi en direct).
export type RecentItem = { nom: string; champs: string[]; wroteFields: boolean; at: string };
export type PiloteStatus = {
  deployed: boolean;
  startedAt: string | null;
  stats: PiloteStats;
  recent: RecentItem[];
  history: PiloteRecap[];
};
export type PiloteRecap = { id: string; startedAt: string; endedAt: string; stats: PiloteStats };

function parseRecent(label: string | null): RecentItem[] {
  try { const o = JSON.parse(label ?? "{}"); return Array.isArray(o.recent) ? (o.recent as RecentItem[]).slice(0, 20) : []; } catch { return []; }
}

export async function getPiloteStatus(): Promise<PiloteStatus> {
  const [flag, hist] = await Promise.all([
    prisma.automationExclusion.findFirst({ where: { kind: FLAG_KIND, value: FLAG_VALUE } }),
    getPiloteHistory(),
  ]);
  return {
    deployed: !!flag,
    startedAt: flag ? flag.createdAt.toISOString() : null,
    stats: flag ? parseStats(flag.label) : { ...ZERO },
    recent: flag ? parseRecent(flag.label) : [],
    history: hist,
  };
}

export async function getPiloteHistory(limit = 30): Promise<PiloteRecap[]> {
  const rows = await prisma.automationExclusion.findMany({ where: { kind: SESSION_KIND }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => {
    let o: { startedAt?: string; endedAt?: string } = {};
    try { o = JSON.parse(r.label ?? "{}"); } catch { /* ignore */ }
    return { id: r.id, startedAt: o.startedAt ?? r.createdAt.toISOString(), endedAt: o.endedAt ?? r.createdAt.toISOString(), stats: parseStats(r.label) };
  });
}

// Déploie le Pilote Identification (idempotent : ne réinitialise pas une session
// déjà active). Le createdAt de la ligne = début de session.
export async function deployPiloteIdentification(by: string): Promise<PiloteStatus> {
  await prisma.automationExclusion.upsert({
    where: { kind_value: { kind: FLAG_KIND, value: FLAG_VALUE } },
    create: { kind: FLAG_KIND, value: FLAG_VALUE, label: JSON.stringify({ startedAt: new Date().toISOString(), ...ZERO }), createdBy: by },
    update: {},
  });
  return getPiloteStatus();
}

// Stoppe la session : fige un recap dans l'historique + retire le flag.
export async function stopPiloteIdentification(by: string): Promise<{ stopped: boolean; recap?: PiloteRecap }> {
  const flag = await prisma.automationExclusion.findFirst({ where: { kind: FLAG_KIND, value: FLAG_VALUE } });
  if (!flag) return { stopped: false };
  const stats = parseStats(flag.label);
  const startedAt = flag.createdAt.toISOString();
  const endedAt = new Date().toISOString();
  const row = await prisma.automationExclusion.create({
    data: { kind: SESSION_KIND, value: `${Date.now()}`, label: JSON.stringify({ startedAt, endedAt, ...stats }), createdBy: by },
  });
  await prisma.automationExclusion.deleteMany({ where: { kind: FLAG_KIND, value: FLAG_VALUE } });
  return { stopped: true, recap: { id: row.id, startedAt, endedAt, stats } };
}

// Un TICK cron : si déployé, traite un lot de 5 dossiers et cumule les stats dans
// la session active. Renvoie ran=false si non déployé (rien à faire).
export async function piloteIdentificationTick(by = "auto:pilote"): Promise<{ ran: boolean; count?: number; done?: boolean; stats?: PiloteStats }> {
  const flag = await prisma.automationExclusion.findFirst({ where: { kind: FLAG_KIND, value: FLAG_VALUE } });
  if (!flag) return { ran: false };
  const r = await runAutofillChunk(by, CHUNK);
  const s = parseStats(flag.label);
  const next: PiloteStats = {
    runs: s.runs + 1,
    traites: s.traites + r.stats.traites,
    completes: s.completes + r.stats.completes,
    sansInfo: s.sansInfo + r.stats.sansInfo,
    erreurs: s.erreurs + r.stats.erreurs,
  };
  // Suivi en direct : on empile les dossiers de ce lot (les plus récents en tête).
  const newItems: RecentItem[] = r.details.filter((d) => d.nom).map((d) => ({ nom: d.nom, champs: d.champs, wroteFields: d.wroteFields, at: new Date().toISOString() }));
  const recent = [...newItems, ...parseRecent(flag.label)].slice(0, 20);
  await prisma.automationExclusion.update({ where: { id: flag.id }, data: { label: JSON.stringify({ startedAt: flag.createdAt.toISOString(), ...next, recent }) } });
  // done = plus aucun dossier dans le lot (curseur épuisé) → la session tourne à vide
  // jusqu'à ce que Quentin stoppe (ou que le sync nocturne réalimente le stock).
  return { ran: true, count: r.count, done: r.count === 0, stats: next };
}
