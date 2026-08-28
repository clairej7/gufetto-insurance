// Série hebdomadaire du taux de pénétration (vue « Progression » de la carte).
import { prisma } from "@/lib/prisma";

export type PenetrationPoint = { weekStart: string; taux: number; source: string; won?: number };

// Lundi (UTC) de la semaine d'une date → 1 point par semaine.
function weekStartOf(d: Date): Date {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // lundi = 0
  x.setUTCDate(x.getUTCDate() - day);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function getPenetrationSeries(): Promise<PenetrationPoint[]> {
  const rows = await prisma.penetrationSnapshot.findMany({ orderBy: { weekStart: "asc" } });
  return rows.map((r) => ({ weekStart: r.weekStart.toISOString(), taux: r.taux, source: r.source, won: r.won }));
}

// Upsert du point de la semaine courante avec les valeurs EXACTES de la carte
// (won/total calculés côté board) → le point actuel colle toujours à l'affichage.
export async function recordPenetrationSnapshot(won: number, total: number): Promise<void> {
  if (!(total > 0)) return;
  const taux = Math.round((won / total) * 100);
  const weekStart = weekStartOf(new Date());
  await prisma.penetrationSnapshot.upsert({
    where: { weekStart },
    update: { taux, won, total, source: "auto" },
    create: { weekStart, taux, won, total, source: "auto" },
  });
}
