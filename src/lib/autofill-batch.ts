// Automatisation 1 « Pré-remplissage depuis Front » — logique d'un LOT, partagée
// entre le batch manuel (/api/autofill, un lot par appel) et le scan nocturne
// (/api/cron/autofill, boucle jusqu'à épuisement). Centralise le filtre de
// sélection + le curseur persistant pour éviter toute dérive entre les deux.

import { prisma } from "@/lib/prisma";
import { applyAutofill } from "@/lib/rs-autofill-core";
import { getExcludedCoproIds } from "@/lib/exclusions";

// Délai avant de re-tenter un dossier déjà passé par l'autofill (jours). Permet
// de repasser plus tard sur les non-fiables (Front rétabli / données nettoyées).
export const RETRY_APRES_JOURS = 7;

// Volet 1 = REMPLISSAGE SEUL : on complète les champs manquants depuis Front, on
// n'aiguille PAS (le routage ODR/RS est le rôle du Volet 2, avec validation).
export type AutofillStats = { traites: number; completes: number; sansInfo: number; erreurs: number };
export type AutofillDetail = {
  pipelineId: string;
  nom: string;
  adresse: string | null;
  assureur: string | null;
  numero: string | null;
  mail: string | null;
  wroteFields: boolean;
  champs: string[]; // champs effectivement complétés
};
export type AutofillChunkResult = {
  count: number; // dossiers pris dans ce lot
  restants_potentiels: boolean; // le lot était plein → il reste probablement du stock
  stats: AutofillStats;
  details: AutofillDetail[];
};

// Traite UN lot borné : sélectionne `limit` dossiers éligibles (« identifié »
// réellement actif, non exclu, hors clients MRI existants hors Wakam, pas déjà
// tenté dans le cooldown via le curseur autofillTenteLe), les marque « tentés
// maintenant » AVANT traitement (garantit qu'un non-fiable / une erreur ne
// repasse pas au lot suivant → le curseur avance), puis aiguille chacun.
export async function runAutofillChunk(actor: string, limit: number): Promise<AutofillChunkResult> {
  const cooldown = new Date(Date.now() - RETRY_APRES_JOURS * 24 * 60 * 60 * 1000);
  const excludedIds = await getExcludedCoproIds();
  const pipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: "identifie",
      coproId: { notIn: excludedIds }, // dossiers exclus de toute automatisation
      copro: {
        archivedAt: null,
        // On ne prospecte QUE des "identifié" réellement actifs : on exclut les
        // dossiers déjà classés "clos/gagné". Pour un identifié, clos = client MRI
        // HubSpot ("Insurance client") hors Wakam. Sinon le batch aiguillerait en
        // ODR des clients existants (mal rangés à l'étape "identifié" par l'import).
        NOT: {
          clientMriStatut: "Insurance client",
          NOT: { assureurActuel: { contains: "wakam", mode: "insensitive" } },
        },
      },
      OR: [{ autofillTenteLe: null }, { autofillTenteLe: { lt: cooldown } }],
    },
    select: { id: true, copro: { select: { nom: true, adresse: true } } },
    orderBy: { id: "asc" },
    take: limit,
  });

  if (pipelines.length > 0) {
    await prisma.insurancePipeline.updateMany({
      where: { id: { in: pipelines.map((p) => p.id) } },
      data: { autofillTenteLe: new Date() },
    });
  }

  const stats: AutofillStats = { traites: 0, completes: 0, sansInfo: 0, erreurs: 0 };
  const details: AutofillDetail[] = [];

  for (const p of pipelines) {
    try {
      // route=false : Volet 1 COMPLÈTE seulement (pas d'aiguillage — Volet 2).
      // "action_manuelle" → event non-sync_auto = pipeline "touché" → la synchro
      // Omni nocturne ne réécrase pas les champs figés (cliquet contratVerrouilleLe).
      const r = await applyAutofill(p.id, actor, "action_manuelle", false);
      stats.traites++;
      if (r.wroteFields) stats.completes++;
      else stats.sansInfo++;
      details.push({
        pipelineId: p.id,
        nom: p.copro.nom,
        adresse: p.copro.adresse,
        assureur: r.assureur ?? null,
        numero: r.numeroContrat ?? null,
        mail: r.mailCourtier ?? null,
        wroteFields: r.wroteFields,
        champs: r.writtenFields,
      });
    } catch (e) {
      stats.erreurs++;
      console.error("[autofill-batch]", p.id, e);
    }
  }

  return {
    count: pipelines.length,
    restants_potentiels: pipelines.length === limit,
    stats,
    details,
  };
}
