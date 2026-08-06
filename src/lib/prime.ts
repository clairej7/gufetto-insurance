// Automatisation 8 « clean prime » — état du stock de primes + historique des runs.

import { prisma } from "@/lib/prisma";

export type PrimeCleanRow = {
  date: string; // ISO
  total: number;
  sansPrime: number;
  taux: number; // part sans prime (0–1)
  primeConnue: number; // somme des primes connues à date
  resolved: number; // dossiers résolus par ce run
  montantAdded: number; // montant de primes ajouté par ce run
};

// État courant : dossiers actifs, sans prime, somme des primes connues.
export async function computePrimeState(): Promise<{ total: number; sansPrime: number; primeConnue: number }> {
  const [total, sansPrime, agg] = await Promise.all([
    prisma.insurancePipeline.count({ where: { copro: { archivedAt: null } } }),
    prisma.insurancePipeline.count({ where: { copro: { archivedAt: null, primeActuelle: null } } }),
    prisma.copro.aggregate({ where: { archivedAt: null, primeActuelle: { not: null } }, _sum: { primeActuelle: true } }),
  ]);
  return { total, sansPrime, primeConnue: agg._sum.primeActuelle ?? 0 };
}

// Enregistre un instantané. resolved / montantAdded sont calculés en DELTA par
// rapport au dernier instantané → robuste : même si un run est interrompu (refresh),
// sa progression est captée au prochain snapshot. Baseline (1er) = deltas nuls.
export async function recordPrimeCleanSnapshot(createdBy: string | null): Promise<void> {
  const s = await computePrimeState();
  const last = await prisma.primeCleanRun.findFirst({ orderBy: { createdAt: "desc" } });
  const resolved = last ? Math.max(0, last.sansPrime - s.sansPrime) : 0;
  const montantAdded = last ? Math.max(0, s.primeConnue - last.primeConnueTotal) : 0;
  await prisma.primeCleanRun.create({
    data: { totalDossiers: s.total, sansPrime: s.sansPrime, primeConnueTotal: s.primeConnue, resolved, montantAdded, createdBy },
  });
}

// Crée la baseline du jour si l'historique est vide.
export async function ensurePrimeBaseline(): Promise<void> {
  if ((await prisma.primeCleanRun.count()) === 0) await recordPrimeCleanSnapshot(null);
}

export async function getPrimeCleanHistory(): Promise<PrimeCleanRow[]> {
  const rows = await prisma.primeCleanRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({
    date: r.createdAt.toISOString(),
    total: r.totalDossiers,
    sansPrime: r.sansPrime,
    taux: r.totalDossiers ? r.sansPrime / r.totalDossiers : 0,
    primeConnue: r.primeConnueTotal,
    resolved: r.resolved,
    montantAdded: r.montantAdded,
  }));
}
