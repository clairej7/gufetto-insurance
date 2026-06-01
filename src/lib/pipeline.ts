import { PipelineStatut } from "@/generated/prisma/client";

export const PIPELINE_STEPS: {
  statut: PipelineStatut;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    statut: "identifie",
    label: "Identifié",
    shortLabel: "Identifié",
    description: "Copropriété identifiée comme cible à 6 mois de l'échéance",
  },
  {
    statut: "rs_en_cours",
    label: "RS en cours",
    shortLabel: "RS en cours",
    description: "Demande du relevé de sinistralité en cours",
  },
  {
    statut: "rs_recu",
    label: "RS reçu",
    shortLabel: "RS reçu",
    description: "Relevé de sinistralité reçu et déposé sur Duomo",
  },
  {
    statut: "devis_demandes",
    label: "Devis demandés",
    shortLabel: "Devis",
    description: "Demandes de devis envoyées aux assureurs partenaires",
  },
  {
    statut: "devis_recus",
    label: "Devis reçus",
    shortLabel: "Devis reçus",
    description: "Devis reçus et déposés sur Duomo",
  },
  {
    statut: "envoye_cs",
    label: "Envoyé au CS",
    shortLabel: "Envoyé CS",
    description: "Comparaison envoyée au Conseil Syndical",
  },
  {
    statut: "validation_cs",
    label: "Validation CS",
    shortLabel: "Validation",
    description: "En attente de validation du CS (7 jours)",
  },
  {
    statut: "contrat_signe",
    label: "Contrat signé",
    shortLabel: "Signé",
    description: "Nouveau contrat d'assurance signé",
  },
  {
    statut: "resiliation_envoyee",
    label: "Résiliation envoyée",
    shortLabel: "Résiliation",
    description: "Courrier de résiliation envoyé à l'ancien assureur",
  },
  {
    statut: "sepa_complete",
    label: "Mandat SEPA",
    shortLabel: "SEPA",
    description: "Mandat de prélèvement automatique rempli",
  },
  {
    statut: "termine",
    label: "Terminé",
    shortLabel: "Terminé",
    description: "Processus complet — nouveau contrat actif",
  },
];

export const ACTIVE_STEPS = PIPELINE_STEPS.filter(
  (s) => s.statut !== "termine" && s.statut !== "abandonne" as PipelineStatut
);

export function getStepIndex(statut: PipelineStatut): number {
  return PIPELINE_STEPS.findIndex((s) => s.statut === statut);
}

export function getNextStatut(current: PipelineStatut): PipelineStatut | null {
  const idx = getStepIndex(current);
  if (idx === -1 || idx >= PIPELINE_STEPS.length - 1) return null;
  return PIPELINE_STEPS[idx + 1].statut;
}

export function getStepInfo(statut: PipelineStatut) {
  return PIPELINE_STEPS.find((s) => s.statut === statut);
}

export function getDaysUntilEcheance(dateEcheance: Date | null): number | null {
  if (!dateEcheance) return null;
  const now = new Date();
  const diff = dateEcheance.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getUrgenceBadge(days: number | null): "urgent" | "warning" | "ok" | "overdue" {
  if (days === null) return "ok";
  if (days < 0) return "overdue";
  if (days <= 60) return "urgent";
  if (days <= 120) return "warning";
  return "ok";
}
