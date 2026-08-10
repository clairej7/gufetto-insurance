// Dossiers/gestionnaires EXCLUS de toute automatisation (jamais touchés, jamais
// mailés). Source de vérité : table AutomationExclusion. Deux types d'exclusion :
//   - "gestionnaire" : value = email gestionnaire (minuscule) → toutes ses copros
//   - "copro"        : value = coproId → cette copro précise
// Toutes les automatisations filtrent sur getExcludedCoproIds().

import { prisma } from "@/lib/prisma";

export type ExclusionRow = { id: string; kind: string; value: string; label: string | null; createdAt: Date };

export async function getExclusions(): Promise<ExclusionRow[]> {
  return prisma.automationExclusion.findMany({ orderBy: [{ kind: "asc" }, { label: "asc" }], select: { id: true, kind: true, value: true, label: true, createdAt: true } });
}

// Renvoie l'ensemble des coproId exclus (gestionnaires résolus en copros + copros
// explicites). À passer en `coproId: { notIn: [...] }` dans les requêtes des autos.
export async function getExcludedCoproIds(): Promise<string[]> {
  const excl = await prisma.automationExclusion.findMany({ select: { kind: true, value: true } });
  const gestEmails = excl.filter((e) => e.kind === "gestionnaire").map((e) => e.value.toLowerCase());
  const coproIds = new Set(excl.filter((e) => e.kind === "copro").map((e) => e.value));
  if (gestEmails.length) {
    const copros = await prisma.copro.findMany({ where: { gestionnaireEmail: { in: gestEmails } }, select: { id: true } });
    for (const c of copros) coproIds.add(c.id);
  }
  return [...coproIds];
}

// Compteur par type pour l'affichage admin.
export async function getExclusionState(): Promise<{ gestionnaires: number; copros: number; totalCopros: number; rows: ExclusionRow[] }> {
  const rows = await getExclusions();
  const ids = await getExcludedCoproIds();
  return { gestionnaires: rows.filter((r) => r.kind === "gestionnaire").length, copros: rows.filter((r) => r.kind === "copro").length, totalCopros: ids.length, rows };
}
