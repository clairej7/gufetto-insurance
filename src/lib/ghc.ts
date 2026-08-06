// Automatisation 8 — volet 3 « correction GetHumanCall ».
// Applique les données de l'excel GHC (agents Get Human Call, qui ont appelé les
// assureurs) sur les dossiers Gufetto. GHC = source de vérité PRIORITAIRE : on écrase
// assureur / courtier / n° / prime / échéance (fill + correction), avec :
//  - plancher prime 300 € (les < 300 = frais/partiels, ignorés) ;
//  - lignes GHC « A vérifier » : écrites mais marquées à vérifier et NON routées ;
//  - aiguillage identifie → ODR (assureur partenaire) / RS (non-partenaire + réf n°) ;
//  - protection Omni : cliquets contrat/échéance + statut en action_manuelle ;
//  - provenance par champ (ghcFields) → check vert « GHC » sur la fiche ;
//  - rapport de divergences (prime > 15 %) + cas particuliers (ODR/RS incohérents).

import { prisma } from "@/lib/prisma";
import { matchPartner } from "@/lib/front-insurance";
import { isEcheancePerimee } from "@/lib/perime";
import { isCloturePourClient } from "@/lib/pipeline";
import type { PipelineStatut } from "@/generated/prisma/client";

const PRIME_FLOOR = 300;       // < 300 € = frais/partiel → ignoré
const PRIME_CEIL = 50000;      // > 50 k€ = quasi sûrement une erreur GHC → non écrit, signalé
const DIVERGENCE_PCT = 0.15;
// Comparaison souple (casse/espaces) → n'écrase pas « AXA » par « axa » (churn inutile).
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
// Statuts « voie ODR » (un conflit d'assureur partenaire = ODR potentiellement erroné).
const ODR_STATUTS = ["odr_en_cours", "odr_envoye", "odr_accepte"];
// Statuts où l'assureur actuel NE doit PAS être écrasé par GHC (ODR engagé).
const ODR_ASSUREUR_PROTECT = ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"];
// Statuts « gagné / perdu / clos » : GHC ne touche NI le statut NI l'assureur (sinon
// on sort un dossier gagné de sa catégorie, ou un Wakam se fait re-catégoriser).
const NON_ACTIF_STATUTS = ["odr_accepte", "odr_en_vigueur", "contrat_signe", "resiliation_envoyee", "sepa_complete", "termine", "abandonne", "refuse", "non_assurable"];
// Statuts « voie RS/devis » (si GHC dit partenaire → aurait dû partir en ODR).
const RS_STATUTS = ["rs_en_cours", "rs_recu", "devis_demandes", "devis_recus", "envoye_cs", "validation_cs"];

export type GhcApplyResult = {
  dossiersClean: number; assureursMaj: number; primesMaj: number; courtiersMaj: number;
  numerosMaj: number; echeancesMaj: number; versOdr: number; versRs: number;
  divergences: number; casParticuliers: number;
};

const parseFields = (s: string | null): string[] => { try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; } };

export type GhcChunkResult = GhcApplyResult & { runId: string; total: number; processed: number; done: boolean };

const GHC_DEFAULT_FILE = "[Matera x GHC] Cleaning contrats assurance.xlsx";

type GhcCopro = {
  id: string; nom: string; buildingId: string; clientMriStatut: string | null;
  assureurActuel: string | null; courtierActuel: string | null; numeroContrat: string | null;
  primeActuelle: number | null; dateEcheance: Date | null; donneePerimee: boolean; ghcFields: string | null;
  pipelines: { id: string; statut: PipelineStatut; odrPartenaire: string | null }[];
};
type GhcRow = { assureur: string | null; courtier: string | null; numeroContrat: string | null; montant: number | null; echeance: Date | null; aVerifier: boolean };
type GhcReviewInput = { buildingId: string; coproNom: string; kind: string; message: string };

const GHC_COPRO_SELECT = {
  id: true, nom: true, buildingId: true, clientMriStatut: true, assureurActuel: true, courtierActuel: true,
  numeroContrat: true, primeActuelle: true, dateEcheance: true, donneePerimee: true, ghcFields: true,
  pipelines: { select: { id: true, statut: true, odrPartenaire: true } },
} as const;

// Applique les données GHC à UNE copro (écritures + aiguillage + revues). Partagé par
// le run complet (par tranches) et l'application ciblée de test. Mute r et reviews.
async function applyGhcToCopro(c: GhcCopro, g: GhcRow, now: Date, actorEmail: string, r: GhcApplyResult, reviews: GhcReviewInput[]): Promise<void> {
  const data: Record<string, unknown> = {};
  const fields: string[] = [];

  // Dossier CLOS (client MRI) ou gagné/perdu/ODR engagé : on ne touche NI le statut
  // (pas de routage) NI l'assureur actuel — sinon on sort le dossier de sa catégorie
  // (clos → actif) ou on re-catégorise un Wakam. Les désaccords restent au rapport.
  const estClos = isCloturePourClient(c.clientMriStatut, c.assureurActuel);
  const protegeAssureur = estClos || c.pipelines.some((p) => ODR_ASSUREUR_PROTECT.includes(p.statut) || NON_ACTIF_STATUTS.includes(p.statut));

  // Assureur / courtier / n° : GHC-backed (badge) dès qu'une valeur existe ; on
  // n'ÉCRIT que si elle diffère réellement (casse/espaces ignorés → pas de churn).
  if (g.assureur && !protegeAssureur) {
    fields.push("assureur");
    if (norm(g.assureur) !== norm(c.assureurActuel)) { data.assureurActuel = g.assureur; r.assureursMaj++; }
  }
  if (g.courtier) {
    fields.push("courtier");
    if (norm(g.courtier) !== norm(c.courtierActuel)) { data.courtierActuel = g.courtier; r.courtiersMaj++; }
  }
  if (g.numeroContrat) {
    fields.push("numero");
    if (norm(g.numeroContrat) !== norm(c.numeroContrat)) { data.numeroContrat = g.numeroContrat; r.numerosMaj++; }
  }
  if (g.montant != null && g.montant >= PRIME_FLOOR) {
    const gm = Math.round(g.montant);
    if (gm > PRIME_CEIL) {
      // Montant hors bornes (> 50 k€) → quasi sûrement une erreur GHC : on N'ÉCRIT PAS, on signale.
      reviews.push({ buildingId: c.buildingId, coproNom: c.nom, kind: "prime_suspecte", message: `Prime GHC ${gm} € invraisemblable (> 50 000 €) — non écrite, à saisir manuellement` });
      r.casParticuliers++;
    } else {
      fields.push("prime");
      if (c.primeActuelle != null && Math.abs(c.primeActuelle - gm) / Math.max(c.primeActuelle, gm) > DIVERGENCE_PCT) {
        reviews.push({ buildingId: c.buildingId, coproNom: c.nom, kind: "prime_divergente", message: `Prime : Gufetto ${c.primeActuelle} € → GHC ${gm} €` });
        r.divergences++;
      }
      if (gm !== c.primeActuelle) { data.primeActuelle = gm; r.primesMaj++; }
      data.primeAVerifier = g.aVerifier; // ligne GHC douteuse → reste « à vérifier »
    }
  }
  if (g.echeance) {
    fields.push("echeance");
    if (!c.dateEcheance || g.echeance.getTime() !== c.dateEcheance.getTime()) { data.dateEcheance = g.echeance; r.echeancesMaj++; }
    data.echeanceVerrouilleLe = now;
    if (c.donneePerimee && !isEcheancePerimee(g.echeance)) data.donneePerimee = false;
  }

  if (fields.length > 0) {
    data.contratVerrouilleLe = now;
    data.ghcImportedAt = now;
    data.ghcFields = JSON.stringify([...new Set([...parseFields(c.ghcFields), ...fields])]);
    await prisma.copro.update({ where: { id: c.id }, data });
    r.dossiersClean++;
  }

  // Aiguillage + cas particuliers (par pipeline). Un dossier CLOS (client MRI) resté
  // en « identifie » ne doit JAMAIS être routé (cf. estClos ci-dessus).
  const partner = g.assureur ? matchPartner(g.assureur) : null;
  for (const p of c.pipelines) {
    if (p.statut === "identifie" && !estClos && g.assureur && !g.aVerifier) {
      let target: PipelineStatut | null = null;
      if (partner) target = "odr_en_cours";
      else if (g.numeroContrat || c.numeroContrat) target = "rs_en_cours";
      if (target) {
        // Pose le marqueur odrPartenaire (AXA/GENERALI/SADA/MILA) → le dossier compte
        // dans la carte « par assureur » du Suivi des ODR (qui s'appuie sur ce marqueur).
        const markerData = target === "odr_en_cours" && partner ? { odrPartenaire: partner.toUpperCase() } : {};
        await prisma.$transaction([
          prisma.insurancePipeline.update({ where: { id: p.id }, data: { statut: target, ...markerData } }),
          prisma.pipelineEvent.create({
            data: {
              pipelineId: p.id, type: "action_manuelle", ancienStatut: "identifie", nouveauStatut: target,
              description: target === "odr_en_cours"
                ? `GHC — aiguillé → ODR (assureur partenaire : ${g.assureur})`
                : `GHC — aiguillé → RS en cours (assureur : ${g.assureur}${g.numeroContrat ? `, n° ${g.numeroContrat}` : ""})`,
              createdBy: actorEmail,
            },
          }),
        ]);
        if (target === "odr_en_cours") r.versOdr++; else r.versRs++;
      }
    } else if (partner && ODR_STATUTS.includes(p.statut) && p.odrPartenaire && matchPartner(p.odrPartenaire) !== partner) {
      reviews.push({ buildingId: c.buildingId, coproNom: c.nom, kind: "odr_conflit", message: `ODR en cours avec « ${p.odrPartenaire} » mais GHC dit assureur « ${g.assureur} »` });
      r.casParticuliers++;
    } else if (partner && !estClos && RS_STATUTS.includes(p.statut)) {
      // !estClos : un dossier client-MRI en voie RS est en réalité GAGNÉ (clos) → ne
      // pas le flagger « devrait être ODR » (ce n'est pas une opportunité, c'est gagné).
      reviews.push({ buildingId: c.buildingId, coproNom: c.nom, kind: "rs_vers_odr", message: `En « ${p.statut} » mais GHC dit partenaire « ${g.assureur} » → ODR possible` });
      r.casParticuliers++;
    }
  }
}

const emptyResult = (): GhcApplyResult => ({ dossiersClean: 0, assureursMaj: 0, primesMaj: 0, courtiersMaj: 0, numerosMaj: 0, echeancesMaj: 0, versOdr: 0, versRs: 0, divergences: 0, casParticuliers: 0 });

// Application CIBLÉE sur une liste de building_id (test avant run complet). Crée un
// run étiqueté + le rapport, exactement comme le run complet (même logique par copro).
export async function applyGhcToBuildingIds(actorEmail: string, buildingIds: string[], label: string): Promise<GhcApplyResult & { runId: string; matched: number }> {
  const now = new Date();
  await prisma.ghcReview.deleteMany({});
  const run = await prisma.ghcImportRun.create({ data: { label, fileName: GHC_DEFAULT_FILE, createdBy: actorEmail } });
  const copros = await prisma.copro.findMany({ where: { archivedAt: null, buildingId: { in: buildingIds } }, select: GHC_COPRO_SELECT });
  const ghc = await prisma.ghcContract.findMany({ where: { buildingId: { in: copros.map((c) => c.buildingId) } } });
  const map = new Map(ghc.map((g) => [g.buildingId, g]));
  const r = emptyResult();
  const reviews: GhcReviewInput[] = [];
  for (const c of copros) { const g = map.get(c.buildingId); if (!g) continue; await applyGhcToCopro(c, g, now, actorEmail, r, reviews); }
  await prisma.ghcImportRun.update({
    where: { id: run.id },
    data: {
      dossiersClean: { increment: r.dossiersClean }, assureursMaj: { increment: r.assureursMaj }, primesMaj: { increment: r.primesMaj },
      courtiersMaj: { increment: r.courtiersMaj }, numerosMaj: { increment: r.numerosMaj }, echeancesMaj: { increment: r.echeancesMaj },
      versOdr: { increment: r.versOdr }, versRs: { increment: r.versRs }, divergences: { increment: r.divergences }, casParticuliers: { increment: r.casParticuliers },
    },
  });
  if (reviews.length) await prisma.ghcReview.createMany({ data: reviews.map((rv) => ({ ...rv, importRunId: run.id })) });
  return { ...r, runId: run.id, matched: copros.length };
}

// Applique UNE tranche de copros [offset, offset+limit). Au 1er appel (runId null),
// crée le run (label auto vN) et remet à zéro le rapport de revues. Chaque tranche
// incrémente les compteurs du run → l'UI affiche une barre de progression.
export async function applyGhcChunk(actorEmail: string, offset: number, limit: number, runId: string | null): Promise<GhcChunkResult> {
  const now = new Date();
  const total = await prisma.copro.count({ where: { archivedAt: null } });

  let rid = runId;
  if (!rid) {
    await prisma.ghcReview.deleteMany({});
    const n = await prisma.ghcImportRun.count();
    const run = await prisma.ghcImportRun.create({ data: { label: `v${n + 1}`, fileName: GHC_DEFAULT_FILE, createdBy: actorEmail } });
    rid = run.id;
  }

  const copros = await prisma.copro.findMany({
    where: { archivedAt: null },
    orderBy: { id: "asc" },
    skip: offset,
    take: limit,
    select: GHC_COPRO_SELECT,
  });
  const ghc = await prisma.ghcContract.findMany({ where: { buildingId: { in: copros.map((c) => c.buildingId) } } });
  const map = new Map(ghc.map((g) => [g.buildingId, g]));

  const r = emptyResult();
  const reviews: GhcReviewInput[] = [];

  for (const c of copros) {
    const g = map.get(c.buildingId);
    if (!g) continue;
    await applyGhcToCopro(c, g, now, actorEmail, r, reviews);
  }

  // Incrémente les compteurs du run + ajoute les revues de cette tranche.
  await prisma.ghcImportRun.update({
    where: { id: rid },
    data: {
      dossiersClean: { increment: r.dossiersClean }, assureursMaj: { increment: r.assureursMaj },
      primesMaj: { increment: r.primesMaj }, courtiersMaj: { increment: r.courtiersMaj },
      numerosMaj: { increment: r.numerosMaj }, echeancesMaj: { increment: r.echeancesMaj },
      versOdr: { increment: r.versOdr }, versRs: { increment: r.versRs },
      divergences: { increment: r.divergences }, casParticuliers: { increment: r.casParticuliers },
    },
  });
  if (reviews.length) await prisma.ghcReview.createMany({ data: reviews.map((rv) => ({ ...rv, importRunId: rid })) });

  const processed = copros.length;
  return { ...r, runId: rid, total, processed, done: offset + processed >= total };
}

export type GhcImportRow = GhcApplyResult & { id: string; date: string; label: string; fileName: string | null };

export async function getGhcImportHistory(): Promise<GhcImportRow[]> {
  const runs = await prisma.ghcImportRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return runs.map((x) => ({
    id: x.id, date: x.createdAt.toISOString(), label: x.label, fileName: x.fileName,
    dossiersClean: x.dossiersClean, assureursMaj: x.assureursMaj, primesMaj: x.primesMaj, courtiersMaj: x.courtiersMaj,
    numerosMaj: x.numerosMaj, echeancesMaj: x.echeancesMaj, versOdr: x.versOdr, versRs: x.versRs,
    divergences: x.divergences, casParticuliers: x.casParticuliers,
  }));
}

export type GhcReviewRow = { id: string; buildingId: string; coproNom: string; kind: string; message: string };
export async function getGhcReviews(): Promise<GhcReviewRow[]> {
  const rows = await prisma.ghcReview.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "desc" }], take: 500 });
  return rows.map((x) => ({ id: x.id, buildingId: x.buildingId, coproNom: x.coproNom, kind: x.kind, message: x.message }));
}

// État live : combien de dossiers portent une donnée GHC + taille de la source.
export async function computeGhcState(): Promise<{ sourceRows: number; dossiersAvecGhc: number }> {
  const [sourceRows, dossiersAvecGhc] = await Promise.all([
    prisma.ghcContract.count(),
    prisma.copro.count({ where: { archivedAt: null, ghcFields: { not: null } } }),
  ]);
  return { sourceRows, dossiersAvecGhc };
}
