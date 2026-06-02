import { PipelineStatut } from "@/generated/prisma/client";

export const PIPELINE_STEPS: {
  statut: PipelineStatut;
  label: string;
  shortLabel: string;
  description: string;
  isWon?: boolean;
}[] = [
  {
    statut: "identifie",
    label: "Aucune action",
    shortLabel: "Aucune action",
    description: "Copropriété identifiée, aucune démarche engagée",
  },
  {
    statut: "rs_en_cours",
    label: "En attente du relevé de sinistralité",
    shortLabel: "RS en cours",
    description: "Demande du relevé de sinistralité envoyée",
  },
  {
    statut: "devis_demandes",
    label: "Devis demandés",
    shortLabel: "Devis demandés",
    description: "Demandes de devis envoyées aux assureurs partenaires",
  },
  {
    statut: "devis_recus",
    label: "Devis partagés",
    shortLabel: "Devis partagés",
    description: "Devis reçus et partagés avec le Conseil Syndical",
  },
  {
    statut: "envoye_cs",
    label: "Devis validé",
    shortLabel: "Devis validé",
    description: "Devis validé par le Conseil Syndical",
  },
  {
    statut: "contrat_signe",
    label: "Contrat signé",
    shortLabel: "Contrat signé",
    description: "Nouveau contrat d'assurance signé — deal gagné !",
    isWon: true,
  },
  {
    statut: "termine",
    label: "Contrat mis à jour dans Duomo",
    shortLabel: "Duomo OK",
    description: "Contrat mis à jour dans Duomo — dossier clôturé",
  },
];

export const TERMINAL_STATUTS: PipelineStatut[] = ["termine", "refuse", "non_assurable", "abandonne"];

export const ACTIVE_STEPS = PIPELINE_STEPS.filter(
  (s) => !TERMINAL_STATUTS.includes(s.statut)
);

export function isTerminalStatut(statut: string): boolean {
  return TERMINAL_STATUTS.includes(statut as PipelineStatut);
}

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
