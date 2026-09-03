// Dossiers/gestionnaires EXCLUS de toute automatisation (jamais touchés, jamais
// mailés). Source de vérité : table AutomationExclusion. Deux types d'exclusion :
//   - "gestionnaire" : value = email gestionnaire (minuscule) → toutes ses copros
//   - "copro"        : value = coproId → cette copro précise
// Toutes les automatisations filtrent sur getExcludedCoproIds().

import { prisma } from "@/lib/prisma";

export type ExclusionRow = { id: string; kind: string; value: string; label: string | null; createdAt: Date };

export async function getExclusions(): Promise<ExclusionRow[]> {
  // Exclut les lignes techniques (drapeaux applicatifs "app_flag", sessions Pilote
  // "pilote_session") qui n'ont rien à voir avec les exclusions de dossiers.
  return prisma.automationExclusion.findMany({ where: { kind: { notIn: ["app_flag", "pilote_session"] } }, orderBy: [{ kind: "asc" }, { label: "asc" }], select: { id: true, kind: true, value: true, label: true, createdAt: true } });
}

// Drapeaux d'activation d'automatisations, stockés en BASE (plus fiable qu'une
// variable d'env Railway, qui doit être posée sur le bon service — cause réelle du
// blocage des relances gestio le 2026-09-03 : le cron tournait mais l'app ne voyait
// pas DEVIS6_RELANCE_ENABLED). Réutilise AutomationExclusion (kind "app_flag") pour
// éviter un changement de schéma. Présence de la ligne = activé.
export async function isAppFlagOn(name: string): Promise<boolean> {
  const row = await prisma.automationExclusion.findFirst({ where: { kind: "app_flag", value: name }, select: { id: true } });
  return !!row;
}
export async function setAppFlag(name: string, on: boolean, by?: string): Promise<void> {
  if (on) await prisma.automationExclusion.upsert({ where: { kind_value: { kind: "app_flag", value: name } }, create: { kind: "app_flag", value: name, label: `flag applicatif : ${name}`, createdBy: by ?? "system" }, update: {} });
  else await prisma.automationExclusion.deleteMany({ where: { kind: "app_flag", value: name } });
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
  // Ré-inclusion explicite (kind "copro_include") : force une copro DANS les autos,
  // même si son gestionnaire est globalement exclu. Priorité sur toute exclusion.
  for (const e of excl) if (e.kind === "copro_include") coproIds.delete(e.value);
  return [...coproIds];
}

// Dit COMMENT une copro est exclue : par une exclusion « copro » (directement
// ré-incluable depuis la fiche) ou via son « gestionnaire » (retrait = admin,
// impacte tous ses dossiers). null = pas exclue. La copro prime sur le gestio.
export async function getCoproExclusion(coproId: string, gestionnaireEmail: string | null): Promise<{ kind: "copro" | "gestionnaire"; value: string } | null> {
  const excl = await prisma.automationExclusion.findMany({ select: { kind: true, value: true } });
  if (excl.some((e) => e.kind === "copro_include" && e.value === coproId)) return null; // ré-inclus explicitement → jamais exclu
  if (excl.some((e) => e.kind === "copro" && e.value === coproId)) return { kind: "copro", value: coproId };
  const g = gestionnaireEmail?.toLowerCase().trim();
  if (g && excl.some((e) => e.kind === "gestionnaire" && e.value.toLowerCase() === g)) return { kind: "gestionnaire", value: g };
  return null;
}

export type ExcludedCopro = { id: string; nom: string; adresse: string | null; gestionnaireNom: string | null };

// Compteur + liste des copros concernées pour l'affichage admin.
export async function getExclusionState(): Promise<{ gestionnaires: number; copros: number; totalCopros: number; rows: ExclusionRow[]; coproList: ExcludedCopro[] }> {
  const rows = await getExclusions();
  const ids = await getExcludedCoproIds();
  const coproList = await prisma.copro.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true, adresse: true, gestionnaireNom: true }, orderBy: [{ gestionnaireNom: "asc" }, { nom: "asc" }] });
  return { gestionnaires: rows.filter((r) => r.kind === "gestionnaire").length, copros: rows.filter((r) => r.kind === "copro").length, totalCopros: ids.length, rows, coproList };
}
