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
    label: "Identification",
    shortLabel: "Identification",
    description: "Copropriété identifiée, aucune démarche engagée",
  },
  {
    statut: "rs_en_cours",
    label: "Récupération du RS",
    shortLabel: "Récupération du RS",
    description: "Demande du relevé de sinistralité envoyée",
  },
  {
    statut: "devis_demandes",
    label: "Demande des devis",
    shortLabel: "Demande des devis",
    description: "Demandes de devis envoyées aux assureurs partenaires",
  },
  {
    statut: "devis_recus",
    label: "Comparaison des devis",
    shortLabel: "Comparaison des devis",
    description: "Devis reçus et partagés avec le Conseil Syndical",
  },
  {
    statut: "envoye_cs",
    label: "Validation du CS",
    shortLabel: "Validation du CS",
    description: "Devis validé par le Conseil Syndical",
  },
  {
    statut: "contrat_signe",
    label: "Signé",
    shortLabel: "Signé",
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
  // ODR n'est PAS dans PIPELINE_STEPS (hors cycle linéaire, accessible via le
  // toggle ODR uniquement) -> getStepIndex renvoie -1 et on retourne null.
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

// ─── Classement d'un dossier en sections (mutuellement exclusives) ───────────
// Un dossier tombe dans EXACTEMENT un bucket, déterminé par priorité.

export type DossierBucket = "perdu" | "odr" | "clos" | "urgent" | "autre";

const LOST_STATUTS: PipelineStatut[] = ["abandonne", "refuse", "non_assurable"];
// "Clos par le statut de vente" : Contract Uploaded (resiliation_envoyee) et +.
const CLOSED_BY_STATUT: PipelineStatut[] = ["resiliation_envoyee", "sepa_complete", "termine"];

// Wakam : on ne travaille plus avec eux. Même si HubSpot dit "client", il faut
// migrer → on ne clôt PAS via la règle client, on suit le sales status.
export function isWakam(supplierName: string | null | undefined): boolean {
  return !!supplierName && supplierName.toLowerCase().includes("wakam");
}

// Réellement cliente MRI Matera d'après HubSpot (source de vérité prioritaire).
export function isClientMri(clientMriStatut: string | null | undefined): boolean {
  return clientMriStatut === "Insurance client";
}

// Clôture "définitive" parce que cliente MRI HubSpot (hors Wakam à migrer).
export function isCloturePourClient(
  clientMriStatut: string | null | undefined,
  assureurActuel: string | null | undefined
): boolean {
  return isClientMri(clientMriStatut) && !isWakam(assureurActuel);
}

export function categoriseDossier(input: {
  statut: string;
  dateEcheance: Date | null;
  clientMriStatut: string | null;
  assureurActuel: string | null;
}): DossierBucket {
  // 1. Statut perdu prime sur tout (même si HubSpot dit client).
  if (LOST_STATUTS.includes(input.statut as PipelineStatut)) return "perdu";
  // 1 bis. ODR (ordre de remplacement) : sortie de cycle, catégorie dédiée (fond jaune).
  if (input.statut === "odr_en_cours") return "odr";
  // 2. Cliente MRI HubSpot (hors Wakam) → clos, aucune action.
  if (isCloturePourClient(input.clientMriStatut, input.assureurActuel)) return "clos";
  // 3. Sinon on suit le sales status (comportement historique).
  if (CLOSED_BY_STATUT.includes(input.statut as PipelineStatut)) return "clos";
  const d = getDaysUntilEcheance(input.dateEcheance);
  if (d !== null && d <= 180) return "urgent";
  return "autre";
}

export function getUrgenceBadge(days: number | null): "urgent" | "warning" | "ok" | "overdue" {
  if (days === null) return "ok";
  if (days < 0) return "overdue";
  if (days <= 60) return "urgent";
  if (days <= 120) return "warning";
  return "ok";
}
