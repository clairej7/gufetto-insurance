// Automatisation 6 « Comparer les devis & mail au CS » — logique des 3 volets.
// V1 : liste des comparaisons prêtes (contrat + devis + prime vérifiée + repéré
//      un devis recommandé) → passage au V2.
// V2 : prévisualisation + envoi en masse du mail au Conseil Syndical (à venir).
// V3 : suivi des propositions envoyées au CS.
//
// Périmètre = étape « Comparaison des devis » (statut devis_recus), hors ODR
// (jamais concernés), hors exclus/archivés.

import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";

function gestLabel(nom: string | null, email: string | null): string | null {
  if (nom?.trim()) return nom.trim();
  if (!email) return null;
  return email.split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export type Devis6Row = {
  pipelineId: string; nom: string; adresse: string | null; gestionnaire: string | null;
  hasContrat: boolean; hasDevis: boolean; nbDevis: number; primeVerifiee: boolean; comparaisonFaite: boolean;
  pret: boolean;
};
export type Devis6Volet1 = { total: number; prets: number; rows: Devis6Row[] };

export async function getDevis6Volet1Data(): Promise<Devis6Volet1> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: "devis_recus", coproId: { notIn: excl }, copro: { archivedAt: null },
      // Dossiers déjà passés au volet 2 → sortent de la liste V1.
      events: { none: { metadata: { path: ["devis6Volet"], equals: 2 } } },
    },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, primeActuelle: true, primeAVerifier: true, gestionnaireNom: true, gestionnaireEmail: true } },
      documents: { select: { kind: true } },
      devisRecus: { select: { recommande: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  const rows: Devis6Row[] = ps.map((p) => {
    const hasContrat = p.documents.some((d) => d.kind === "contrat_mri") || !!(p.contratActuelData && p.contratActuelData.trim());
    const nbDevis = p.devisRecus.length;
    const hasDevis = nbDevis > 0;
    const primeVerifiee = p.copro.primeActuelle != null && !p.copro.primeAVerifier;
    const comparaisonFaite = p.devisRecus.some((d) => d.recommande);
    const pret = hasContrat && hasDevis && primeVerifiee && comparaisonFaite;
    return {
      pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
      gestionnaire: gestLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail),
      hasContrat, hasDevis, nbDevis, primeVerifiee, comparaisonFaite, pret,
    };
  });
  return { total: rows.length, prets: rows.filter((r) => r.pret).length, rows };
}

// Nb de dossiers prêts (tout au vert) encore en V1 = éligibles au passage V2.
export async function getDevis6PretsCount(): Promise<number> {
  return (await getDevis6Volet1Data()).prets;
}

// Passe au volet 2 tous les dossiers prêts (marqueur event devis6Volet=2).
export async function passDevis6ToVolet2(actorEmail: string): Promise<{ passed: number }> {
  const { rows } = await getDevis6Volet1Data();
  const prets = rows.filter((r) => r.pret);
  for (const r of prets) {
    await prisma.pipelineEvent.create({
      data: { pipelineId: r.pipelineId, type: "action_manuelle", description: `${r.nom} — comparaison prête, passage au volet 2 (mail CS)`, metadata: { devis6Volet: 2 }, createdBy: actorEmail },
    });
  }
  return { passed: prets.length };
}

// ─── Volet 2 : file d'attente (dossiers marqués) ─────────────────────────────
export type Devis6Volet2Row = { pipelineId: string; nom: string; adresse: string | null; passedAt: string };
export type Devis6Volet2 = { count: number; rows: Devis6Volet2Row[] };
export async function getDevis6Volet2Data(): Promise<Devis6Volet2> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["devis6Volet"], equals: 2 }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null }, statut: "devis_recus" } },
    select: { createdAt: true, pipelineId: true, pipeline: { select: { copro: { select: { nom: true, adresse: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const rows: Devis6Volet2Row[] = [];
  for (const e of ev) {
    if (seen.has(e.pipelineId)) continue;
    seen.add(e.pipelineId);
    rows.push({ pipelineId: e.pipelineId, nom: e.pipeline?.copro.nom ?? "?", adresse: e.pipeline?.copro.adresse ?? null, passedAt: e.createdAt.toISOString() });
  }
  return { count: rows.length, rows };
}

// ─── Volet 3 : suivi des propositions envoyées au CS ─────────────────────────
// Une proposition est « envoyée » quand le dossier a franchi l'étape envoye_cs
// (statut_change nouveauStatut=envoye_cs). « recus » = réponses du CS (à venir,
// détection non branchée). « sansReponse10j » = envoi au CS ≥ 10 jours.
export type Devis6SuiviRow = { pipelineId: string; nom: string; adresse: string | null; sentAt: string; jours: number; statut: string };
export type Devis6Suivi = { envoyees: number; recus: number; sansReponse10j: number; rows: Devis6SuiviRow[] };

export async function getDevis6Volet3Data(nowMs: number): Promise<Devis6Suivi> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { type: "statut_change", nouveauStatut: "envoye_cs", pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null } } },
    select: { createdAt: true, pipelineId: true, pipeline: { select: { statut: true, copro: { select: { nom: true, adresse: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const byPipe = new Map<string, { pipelineId: string; nom: string; adresse: string | null; sentAt: Date; statut: string }>();
  for (const e of ev) {
    const g = byPipe.get(e.pipelineId);
    if (!g) byPipe.set(e.pipelineId, { pipelineId: e.pipelineId, nom: e.pipeline?.copro.nom ?? "?", adresse: e.pipeline?.copro.adresse ?? null, sentAt: e.createdAt, statut: e.pipeline?.statut ?? "?" });
    else if (e.createdAt < g.sentAt) g.sentAt = e.createdAt;
  }
  const rows: Devis6SuiviRow[] = [...byPipe.values()].map((g) => ({
    pipelineId: g.pipelineId, nom: g.nom, adresse: g.adresse, sentAt: g.sentAt.toISOString(),
    jours: Math.floor((nowMs - g.sentAt.getTime()) / 86400000), statut: g.statut,
  })).sort((a, b) => b.jours - a.jours);
  // « répondu » = le dossier a avancé au-delà de envoye_cs (validation_cs et après).
  const AFTER = new Set(["validation_cs", "contrat_signe", "resiliation_envoyee", "sepa_complete", "termine"]);
  const recus = rows.filter((r) => AFTER.has(r.statut)).length;
  const enAttente = rows.filter((r) => r.statut === "envoye_cs");
  return { envoyees: rows.length, recus, sansReponse10j: enAttente.filter((r) => r.jours >= 10).length, rows };
}
