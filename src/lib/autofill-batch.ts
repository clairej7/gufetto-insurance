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

export type AutofillStats = { traites: number; versRs: number; versOdr: number; nonFiables: number; erreurs: number };
export type AutofillChunkResult = {
  count: number; // dossiers pris dans ce lot
  restants_potentiels: boolean; // le lot était plein → il reste probablement du stock
  stats: AutofillStats;
  details: Array<Record<string, unknown>>;
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
    select: { id: true },
    orderBy: { id: "asc" },
    take: limit,
  });

  if (pipelines.length > 0) {
    await prisma.insurancePipeline.updateMany({
      where: { id: { in: pipelines.map((p) => p.id) } },
      data: { autofillTenteLe: new Date() },
    });
  }

  const stats: AutofillStats = { traites: 0, versRs: 0, versOdr: 0, nonFiables: 0, erreurs: 0 };
  const details: Array<Record<string, unknown>> = [];

  for (const p of pipelines) {
    try {
      // "action_manuelle" (et non "sync_auto") : l'aiguillage du batch est une
      // décision délibérée qui doit TENIR. Un event non-sync_auto par un acteur
      // marque le pipeline "touché" → la synchro Omni nocturne ne réécrase plus
      // son statut (sinon elle le renvoyait en "Identification" chaque nuit).
      const r = await applyAutofill(p.id, actor, "action_manuelle");
      stats.traites++;
      if (r.moved && r.targetStatut === "rs_en_cours") stats.versRs++;
      else if (r.moved && r.targetStatut === "odr_en_cours") stats.versOdr++;
      else stats.nonFiables++;
      details.push({
        pipelineId: p.id,
        assureur: r.info?.assureur ?? null,
        numero: r.info?.numeroContrat ?? null,
        mail: r.info?.mailCourtier ?? null,
        target: r.targetStatut,
        moved: r.moved,
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

// Combine plusieurs AutofillStats (pour la boucle du scan nocturne).
export function mergeStats(a: AutofillStats, b: AutofillStats): AutofillStats {
  return {
    traites: a.traites + b.traites,
    versRs: a.versRs + b.versRs,
    versOdr: a.versOdr + b.versOdr,
    nonFiables: a.nonFiables + b.nonFiables,
    erreurs: a.erreurs + b.erreurs,
  };
}
