// Automatisation 1 — application du résultat d'extraction Front à un dossier :
// écrit les champs trouvés puis AIGUILLE le dossier (ODR / RS en cours / reste).
// Partagé par l'action serveur (bouton fiche) et la route batch (admin).
// N'appelle PAS getSession -> reçoit l'email de l'acteur (auth faite en amont).

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { PipelineStatut } from "@/generated/prisma/client";
import { extractInsuranceInfoFromFront, matchPartner, looksLikeCourtierValue, type InsuranceInfo } from "@/lib/front-insurance";

// Champs contrat lus/écrits par l'autofill (sous-ensemble de Copro).
type CoproContractFields = {
  assureurActuel: string | null;
  courtierActuel: string | null;
  numeroContrat: string | null;
  contactCourtierEmail: string | null;
};

// Calcule (sans écrire) le patch de champs contrat à appliquer + les notes
// d'audit à tracer. Règle : fill-if-empty, MAIS si le champ assureur contient en
// réalité un COURTIER (pollution Omni), on le traite comme mal rempli → on écrit
// le vrai porteur (Front) à sa place et on déplace le courtier vers son champ (si
// vide). On ne remplace JAMAIS un vrai porteur existant (protège le fix Sada/AXA).
// Partagé par applyAutofill (temps réel/batch) et le script de nettoyage rétro.
export function planContractWrite(
  copro: CoproContractFields,
  info: Pick<InsuranceInfo, "assureur" | "courtier" | "numeroContrat" | "mailCourtier">,
): { data: Record<string, unknown>; auditNotes: string[] } {
  const data: Record<string, unknown> = {};
  const auditNotes: string[] = [];

  const assureurEstCourtier = looksLikeCourtierValue(copro.assureurActuel);
  const replacingAssureur = !!info.assureur && (!copro.assureurActuel || assureurEstCourtier);
  if (replacingAssureur) {
    if (assureurEstCourtier) {
      auditNotes.push(
        `Assureur corrigé : "${copro.assureurActuel}" (courtier mal placé par la synchro) → "${info.assureur}" (porteur, source Front). À vérifier si conflit sur le porteur.`,
      );
    }
    data.assureurActuel = info.assureur;
  }

  // Champ courtier : priorité au courtier Front ; sinon on récupère le courtier
  // mal placé qu'on vient de sortir du champ assureur.
  if (!copro.courtierActuel) {
    if (info.courtier) data.courtierActuel = info.courtier;
    else if (assureurEstCourtier && replacingAssureur) data.courtierActuel = copro.assureurActuel;
  }

  if (info.numeroContrat && !copro.numeroContrat) data.numeroContrat = info.numeroContrat;
  if (info.mailCourtier && !copro.contactCourtierEmail) data.contactCourtierEmail = info.mailCourtier;

  return { data, auditNotes };
}

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

  // 1) Écrire les champs trouvés (fill-if-empty + exception "courtier mal placé
  //    dans le champ assureur" ; cf. planContractWrite). Cliquet posé pour figer
  //    face aux syncs Omni. Les corrections d'assureur sont tracées en note.
  const { data, auditNotes } = planContractWrite(copro, info);
  const wroteFields = Object.keys(data).length > 0;
  if (wroteFields) {
    data.contratVerrouilleLe = new Date();
    await prisma.copro.update({ where: { id: copro.id }, data });
    for (const note of auditNotes) {
      await prisma.pipelineEvent.create({
        data: { pipelineId, type: "note_ajoutee", description: note, createdBy: actorEmail },
      });
    }
  }

  // 1 bis) Cas particulier "on était l'assureur avant" (probable Wakam à migrer) :
  //   assureur EXISTANT = variante "Matera Assurance" (contient matera ET
  //   assurance ; le "Matera" seul = syndic, à ne pas confondre). On pose une
  //   note de vérification manuelle, une seule fois. NB : ce n'est PAS encore un
  //   garde-fou d'aiguillage — le bon signal "déjà assuré chez Matera" reste à
  //   fiabiliser ; ici on se contente de flaguer pour l'humain.
  const aa = (copro.assureurActuel ?? "").toLowerCase();
  if (aa.includes("matera") && aa.includes("assurance")) {
    const dejaNote = await prisma.pipelineEvent.count({
      where: { pipelineId, type: "note_ajoutee", description: { contains: "Probable Wakam" } },
    });
    if (!dejaNote) {
      await prisma.pipelineEvent.create({
        data: { pipelineId, type: "note_ajoutee", description: "Probable Wakam, vérifier", createdBy: actorEmail },
      });
    }
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

  // 3) Détection "possible faux ODR" : on aiguille en ODR sur un porteur PARTENAIRE
  //    (souvent trouvé par Front), alors que le champ assureur contient DÉJÀ un
  //    AUTRE porteur réel (ni courtier, ni le même partenaire) → conflit probable
  //    (Front a pu voir un vieux mail d'un ancien assureur). On pose une note à
  //    marqueur stable "Possible faux ODR" (une seule fois) : les futures
  //    automatisations ODR pourront exclure ces cas d'office pour traitement manuel.
  if (targetStatut === "odr_en_cours") {
    const champAssureur = typeof data.assureurActuel === "string" ? data.assureurActuel : copro.assureurActuel;
    const odrPartner = info.partnerKey ?? matchPartner(effAssureur);
    if (champAssureur && !looksLikeCourtierValue(champAssureur) && matchPartner(champAssureur) !== odrPartner) {
      const dejaNote = await prisma.pipelineEvent.count({
        where: { pipelineId, type: "note_ajoutee", description: { contains: "Possible faux ODR" } },
      });
      if (!dejaNote) {
        await prisma.pipelineEvent.create({
          data: {
            pipelineId,
            type: "note_ajoutee",
            description: `Possible faux ODR, vérifier assureur (champ : « ${champAssureur} » ≠ porteur ODR « ${effAssureur} »)`,
            createdBy: actorEmail,
          },
        });
      }
    }
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return {
    pipelineId, buildingId: copro.buildingId, info, targetStatut, moved,
    reliable: effReliable, assureur: effAssureur, numeroContrat: effNumero, mailCourtier: effMail, usedOmni,
  };
}
