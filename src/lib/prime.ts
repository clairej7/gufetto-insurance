// Automatisation 8 « clean prime » — état du stock de primes + historique des runs.

import { prisma } from "@/lib/prisma";
import { categoriseDossier } from "@/lib/pipeline";

// Étapes du Tracking (mêmes labels/regroupements que « Répartition par étape »).
// Même ordre EXACT que « Revenus — montants en jeu » du Tracking (G_FUNNEL, G_ODR,
// G_GAGNE, G_PERDU) : les ODR viennent après la voie RS/devis, pas au début.
const PRIME_STAGES: { key: string; label: string }[] = [
  { key: "identifie", label: "Identification" },
  { key: "rs_en_cours", label: "Récupération du RS" },
  { key: "devis_demandes", label: "Demande des devis" },
  { key: "devis_recus", label: "Comparaison des devis" },
  { key: "envoye_cs", label: "Validation du CS" },
  { key: "odr_en_cours", label: "ODR en cours" },
  { key: "odr_envoye", label: "ODR envoyées" },
  { key: "odr_accepte", label: "ODR acceptés" },
  { key: "contrat_signe", label: "Signé" },
  { key: "_clos", label: "Clos" },
  { key: "_perdu", label: "Perdus" },
];

export type PrimeStageRow = { label: string; total: number; sansPrime: number; montant: number; tauxInconnu: number };

// Complétude des primes par étape (miroir du Tracking « montants en jeu ») : montant
// connu + taux de dossiers SANS prime, par étape. Regroupement identique au dashboard
// (categoriseDossier + mêmes règles ODR/clos/signé).
export async function getPrimeByStage(): Promise<PrimeStageRow[]> {
  const rows = await prisma.insurancePipeline.findMany({
    where: { copro: { archivedAt: null } },
    select: { statut: true, copro: { select: { dateEcheance: true, clientMriStatut: true, assureurActuel: true, primeActuelle: true } } },
  });
  const withBucket = rows.map((p) => ({
    p,
    b: categoriseDossier({ statut: p.statut, dateEcheance: p.copro.dateEcheance, clientMriStatut: p.copro.clientMriStatut, assureurActuel: p.copro.assureurActuel }),
  }));
  type WB = (typeof withBucket)[number];
  const isActif = (x: WB) => (x.b === "urgent" || x.b === "autre" || x.b === "odr" || x.b === "odr_envoye") && x.p.statut !== "contrat_signe";
  const rowsForCol = (key: string): WB[] => {
    if (key === "_perdu") return withBucket.filter((x) => x.b === "perdu");
    if (key === "_clos") return withBucket.filter((x) => x.b === "clos");
    if (key === "odr_en_cours") return withBucket.filter((x) => x.b === "odr");
    if (key === "odr_envoye") return withBucket.filter((x) => x.b === "odr_envoye");
    if (key === "odr_accepte") return withBucket.filter((x) => x.b === "odr_accepte");
    if (key === "contrat_signe") return withBucket.filter((x) => x.p.statut === "contrat_signe" && x.b !== "clos");
    return withBucket.filter((x) => x.p.statut === key && isActif(x));
  };
  return PRIME_STAGES.map((s) => {
    const rr = rowsForCol(s.key);
    const total = rr.length;
    const sansPrime = rr.filter((x) => !x.p.copro.primeActuelle).length;
    const montant = rr.reduce((sum, x) => sum + (x.p.copro.primeActuelle ?? 0), 0);
    return { label: s.label, total, sansPrime, montant, tauxInconnu: total ? sansPrime / total : 0 };
  });
}

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
