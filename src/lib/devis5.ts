// Automatisation 5 « Demande de devis » — Volet 1 : centralise les dossiers
// concernés dans une base défilable.
//
// Périmètre : dossiers à l'étape « Demande de devis » (devis_demandes) ou
// « Comparaison des devis » (devis_recus), MAIS on EXCLUT ceux dont la
// comparaison/demande est déjà lancée = un devis a déjà été envoyé
// (event devisType=devis_sent). Objectif : ne lister que ce qu'il reste à traiter.

import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { captureDocsForPipeline } from "@/lib/rs-docs";

export type Devis5Row = {
  pipelineId: string;
  nom: string;
  adresse: string | null;
  assureur: string | null;
  numeroContrat: string | null;
  prime: number | null;
  courtier: string | null;
  gestionnaire: string | null;
  hasRs: boolean;
  hasContrat: boolean;
};

// prets = RS + contrat présents ; docsManquants = au moins un des deux absent.
export type Devis5Data = { total: number; prets: number; docsManquants: number; rows: Devis5Row[] };

function gestLabel(nom: string | null, email: string | null): string | null {
  if (nom?.trim()) return nom.trim();
  if (!email) return null;
  return email.split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export async function getDevis5Volet1Data(): Promise<Devis5Data> {
  // Périmètre = étape « Demande de devis » (devis_demandes) uniquement, hors devis
  // déjà envoyé, hors exclus/archivés. La comparaison (devis_recus) est une étape à part.
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: "devis_demandes", coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null },
      events: { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } },
    },
    select: {
      id: true,
      copro: { select: { nom: true, adresse: true, assureurActuel: true, numeroContrat: true, primeActuelle: true, courtierActuel: true, gestionnaireNom: true, gestionnaireEmail: true } },
      documents: { select: { kind: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  const rows: Devis5Row[] = ps.map((p) => ({
    pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
    assureur: p.copro.assureurActuel, numeroContrat: p.copro.numeroContrat, prime: p.copro.primeActuelle,
    courtier: p.copro.courtierActuel, gestionnaire: gestLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail),
    hasRs: p.documents.some((d) => d.kind === "rs"), hasContrat: p.documents.some((d) => d.kind === "contrat_mri"),
  }));
  return {
    total: rows.length,
    prets: rows.filter((r) => r.hasRs && r.hasContrat).length,
    docsManquants: rows.filter((r) => !r.hasRs || !r.hasContrat).length,
    rows,
  };
}

// Ids des dossiers du Volet 1 ENCORE SANS documents (à charger), ordonnés. Ainsi
// « charger 5 » avance sur les restants au lieu de retraiter les mêmes.
async function getDevis5Volet1Ids(): Promise<string[]> {
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: { in: ["devis_demandes", "devis_recus"] }, coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null },
      // On garde les « devis déjà envoyé » : leurs PJ (RS/contrat) sont récupérables
      // depuis le mail sortant → captureDocsForPipeline sait les rapatrier.
      documents: { none: {} },
      docsCheckedAt: null, // déjà tenté sans résultat → hors file (évite la boucle)
    },
    select: { id: true },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  return ps.map((p) => p.id);
}

// Nb de dossiers du Volet 1 restant à charger (sans docs, jamais tentés).
export async function getDevis5DocsToLoad(): Promise<number> {
  return (await getDevis5Volet1Ids()).length;
}

// Dossiers du Volet 1 tentés mais SANS document trouvé (à traiter à la main).
export async function getDevis5NoDocs(): Promise<{ pipelineId: string; nom: string; adresse: string | null; checkedAt: string }[]> {
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: { in: ["devis_demandes", "devis_recus"] }, coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null },
      documents: { none: {} },
      docsCheckedAt: { not: null },
    },
    select: { id: true, docsCheckedAt: true, copro: { select: { nom: true, adresse: true } } },
    orderBy: { docsCheckedAt: "desc" },
  });
  return ps.map((p) => ({ pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, checkedAt: p.docsCheckedAt!.toISOString() }));
}

// Chargement en masse des documents (RS / contrat MRI) depuis Front → Gufetto,
// par lots. Idempotent (les docs déjà stockés sont ignorés).
export async function loadDevis5Docs(offset: number, limit: number): Promise<{ total: number; processed: number; nextOffset: number; done: boolean; created: number; withDocs: number }> {
  const ids = await getDevis5Volet1Ids();
  const slice = ids.slice(offset, offset + limit);
  let created = 0, withDocs = 0;
  for (const id of slice) {
    const r = await captureDocsForPipeline(id, "auto:devis5_load");
    created += r.created;
    if (r.created > 0) withDocs++;
  }
  const nextOffset = offset + slice.length;
  return { total: ids.length, processed: slice.length, nextOffset, done: nextOffset >= ids.length, created, withDocs };
}

export async function logDevis5DocLoad(actorEmail: string, dossiers: number, created: number): Promise<void> {
  if (dossiers > 0) await prisma.docLoadLog.create({ data: { dossiers, created, actorEmail } });
}

export async function getDocLoadHistory(limit = 15): Promise<{ loadedAt: string; dossiers: number; created: number }[]> {
  const rows = await prisma.docLoadLog.findMany({ orderBy: { loadedAt: "desc" }, take: limit });
  return rows.map((r) => ({ loadedAt: r.loadedAt.toISOString(), dossiers: r.dossiers, created: r.created }));
}
