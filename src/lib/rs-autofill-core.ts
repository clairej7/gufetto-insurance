// Automatisation 1 — application du résultat d'extraction Front à un dossier :
// écrit les champs trouvés puis AIGUILLE le dossier (ODR / RS en cours / reste).
// Partagé par l'action serveur (bouton fiche) et la route batch (admin).
// N'appelle PAS getSession -> reçoit l'email de l'acteur (auth faite en amont).

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { PipelineStatut } from "@/generated/prisma/client";
import { extractInsuranceInfoFromFront, matchPartner, type InsuranceInfo } from "@/lib/front-insurance";

export type AutofillResult = {
  pipelineId: string;
  buildingId: string | null;
  info: InsuranceInfo | null;
  targetStatut: "identifie" | "odr_en_cours" | "rs_en_cours";
  moved: boolean;
  // Décision EFFECTIVE (extraction Front + fallback champs Omni existants).
  reliable: boolean;
  assureur: string | null;
  numeroContrat: string | null;
  mailCourtier: string | null;
  usedOmni: boolean;
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
    return { pipelineId, buildingId: null, info: null, targetStatut: "identifie", moved: false, reliable: false, assureur: null, numeroContrat: null, mailCourtier: null, usedOmni: false, skippedReason: "pipeline introuvable" };
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

  // 2) Aiguillage — depuis "identifie" seulement. On COMBINE l'extraction Front
  //    avec les champs DÉJÀ présents sur la copro (synchronisés depuis Omni) :
  //    si Front ne trouve rien mais qu'Omni a déjà assureur/mail/n°, on peut
  //    quand même aiguiller → couverture accrue au-delà du Front seul.
  const usableMail = (m: string | null | undefined): string | null =>
    m && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) &&
    !/^(?:no-?reply|noreply|donotreply)@|(?:^|[._-])(?:infocnil|cnil|reclamations?)@/i.test(m)
      ? m : null;

  const effAssureur = info.assureur ?? copro.assureurActuel ?? null;
  const effMail = usableMail(info.mailCourtier) ?? usableMail(copro.contactCourtierEmail);
  const effNumero = info.numeroContrat ?? copro.numeroContrat ?? null;
  const effReliable = !!effAssureur && (!!effMail || !!effNumero);
  const effPartner = info.isPartner || !!matchPartner(effAssureur);
  const usedOmni = effReliable && !info.reliable; // aiguillé grâce aux champs Omni existants

  let targetStatut: AutofillResult["targetStatut"] = "identifie";
  if (effReliable) targetStatut = effPartner ? "odr_en_cours" : "rs_en_cours";

  const eventMeta = {
    source: usedOmni ? "front+omni_autofill" : "front_autofill",
    assureur: effAssureur,
    numeroContrat: effNumero,
    mailCourtier: effMail,
    partnerKey: info.partnerKey ?? matchPartner(effAssureur),
    reliable: effReliable,
    confidence: info.confidence,
  };

  let moved = false;
  if (pipeline.statut === "identifie" && targetStatut !== "identifie") {
    const src = usedOmni ? " [via données existantes]" : "";
    const desc =
      targetStatut === "odr_en_cours"
        ? `Aiguillé automatiquement → ODR (assureur partenaire : ${effAssureur})${src}`
        : `Aiguillé automatiquement → RS en cours (assureur : ${effAssureur}${effNumero ? `, n° ${effNumero}` : effMail ? ", mail ok" : ""})${src}`;
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
  return {
    pipelineId, buildingId: copro.buildingId, info, targetStatut, moved,
    reliable: effReliable, assureur: effAssureur, numeroContrat: effNumero, mailCourtier: effMail, usedOmni,
  };
}
