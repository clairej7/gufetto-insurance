// Automatisation 3 — base de référence des courtiers/cabinets → mail type.
// (1) reconnaître qu'un « assureur » est en fait un courtier, (2) compléter le mail
// courtier manquant. Alimentée par la liste fournie + un scraping Front.

import { prisma } from "@/lib/prisma";

// Normalisation du nom pour le rapprochement (minuscule, sans accents ni ponctuation).
export const normNom = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type CourtierRefState = { total: number; avecEmail: number; sansEmail: number; parSource: Record<string, number> };

export async function getCourtierRefState(): Promise<CourtierRefState> {
  const [total, avecEmail, bySource] = await Promise.all([
    prisma.courtierRef.count(),
    prisma.courtierRef.count({ where: { NOT: { email: null } } }),
    prisma.courtierRef.groupBy({ by: ["source"], _count: true }),
  ]);
  const parSource: Record<string, number> = {};
  for (const r of bySource) parSource[r.source] = r._count;
  return { total, avecEmail, sansEmail: total - avecEmail, parSource };
}

export type CourtierRefRow = { id: string; nom: string; email: string | null; assureur: string | null; source: string; occurrences: number; verifie: boolean };

export async function getCourtierRefSample(limit = 40): Promise<CourtierRefRow[]> {
  return prisma.courtierRef.findMany({
    orderBy: [{ occurrences: "desc" }, { nom: "asc" }],
    take: limit,
    select: { id: true, nom: true, email: true, assureur: true, source: true, occurrences: true, verifie: true },
  });
}

// Rapproche un nom (courtier ou champ « assureur » suspect) avec la base.
// Renvoie la meilleure référence trouvée (email si dispo), sinon null.
export async function lookupCourtier(nom: string | null): Promise<CourtierRefRow | null> {
  const k = normNom(nom);
  if (!k || k.length < 3) return null;
  const rows = await prisma.courtierRef.findMany({ where: { nomNorm: k }, orderBy: [{ email: { sort: "desc", nulls: "last" } }, { occurrences: "desc" }] });
  return rows[0] ?? null;
}
