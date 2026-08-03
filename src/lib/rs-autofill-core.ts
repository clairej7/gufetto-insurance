// Automatisation 1 — application du résultat d'extraction Front à un dossier :
// écrit les champs trouvés puis AIGUILLE le dossier (ODR / RS en cours / reste).
// Partagé par l'action serveur (bouton fiche) et la route batch (admin).
// N'appelle PAS getSession -> reçoit l'email de l'acteur (auth faite en amont).

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { PipelineStatut } from "@/generated/prisma/client";
import { extractInsuranceInfoFromFront, type InsuranceInfo } from "@/lib/front-insurance";

export type AutofillResult = {
  pipelineId: string;
  buildingId: string | null;
  info: InsuranceInfo | null;
  targetStatut: "identifie" | "odr_en_cours" | "rs_en_cours";
  moved: boolean;
  skippedReason?: string;
};

export async function applyAutofill(
  pipelineId: string,
  actorEmail: string,
  eventType: "action_manuelle" | "sync_auto" = "action_manuelle",
): Promise<AutofillResult> {
  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    include: { copro: true },
  });
  if (!pipeline) {
    return { pipelineId, buildingId: null, info: null, targetStatut: "identifie", moved: false, skippedReason: "pipeline introuvable" };
  }

  const copro = pipeline.copro;
  const info = await extractInsuranceInfoFromFront(copro.buildingId);

  // 1) Écrire les champs trouvés (on ne touche qu'à ce qu'on a). Cliquet posé
  //    pour protéger ces valeurs des syncs Omni ultérieures.
  const data: Record<string, unknown> = {};
  if (info.assureur) data.assureurActuel = info.assureur;
  if (info.numeroContrat) data.numeroContrat = info.numeroContrat;
  if (info.mailCourtier) data.contactCourtierEmail = info.mailCourtier;
  const wroteFields = Object.keys(data).length > 0;
  if (wroteFields) {
    data.contratVerrouilleLe = new Date();
    await prisma.copro.update({ where: { id: copro.id }, data });
  }

  // 2) Aiguillage — uniquement depuis "identifie" (on ne perturbe pas un dossier
  //    déjà engagé). Partenaire -> ODR ; fiable -> RS ; sinon on reste.
  let targetStatut: AutofillResult["targetStatut"] = "identifie";
  if (info.reliable) targetStatut = info.isPartner ? "odr_en_cours" : "rs_en_cours";

  const eventMeta = {
    source: "front_autofill",
    assureur: info.assureur,
    numeroContrat: info.numeroContrat,
    mailCourtier: info.mailCourtier,
    partnerKey: info.partnerKey,
    reliable: info.reliable,
    confidence: info.confidence,
  };

  let moved = false;
  if (pipeline.statut === "identifie" && targetStatut !== "identifie") {
    const desc =
      targetStatut === "odr_en_cours"
        ? `Aiguillé automatiquement → ODR (assureur partenaire : ${info.assureur})`
        : `Aiguillé automatiquement → RS en cours (${info.reasons.join(" · ")})`;
    await prisma.$transaction([
      prisma.insurancePipeline.update({
        where: { id: pipelineId },
        data: { statut: targetStatut as PipelineStatut },
      }),
      prisma.pipelineEvent.create({
        data: {
          pipelineId,
          type: eventType,
          ancienStatut: pipeline.statut,
          nouveauStatut: targetStatut,
          description: desc,
          metadata: eventMeta,
          createdBy: actorEmail,
        },
      }),
    ]);
    moved = true;
  } else if (wroteFields) {
    // Champs mis à jour sans aiguillage (déjà hors "identifie", ou non fiable).
    await prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: eventType,
        description: `Autofill Front — ${info.reasons.join(" · ")}${info.reliable ? "" : " (non fiable : reste en l'état)"}`,
        metadata: eventMeta,
        createdBy: actorEmail,
      },
    });
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return { pipelineId, buildingId: copro.buildingId, info, targetStatut, moved };
}
