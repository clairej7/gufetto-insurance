import { prisma } from "@/lib/prisma";
import { PipelineStatut } from "@/generated/prisma/client";
import { TERMINAL_STATUTS, isCloturePourClient } from "@/lib/pipeline";

// Seuil (en mois) avant l'échéance du contrat qui déclenche la tâche
// "Lancer process assurance" pour un deal encore non démarré (identifie).
export const ECHEANCE_THRESHOLD_MONTHS = 6;

// odr_en_cours est hors cycle (dossier clos, rien à faire) → aucune tâche générée.
type ActiveStatut = Exclude<PipelineStatut, "termine" | "abandonne" | "refuse" | "non_assurable" | "odr_en_cours">;

type StageTaskSpec = { suffix: string; dueDays: number };

// Tâche actionnable à générer pour chaque étape active du pipeline.
// `dueDays` = nombre de jours à partir d'aujourd'hui pour l'échéance de la tâche.
// Le wording reprend celui des transitions définies dans actions.ts.
const STAGE_TASK_SPEC: Record<ActiveStatut, StageTaskSpec> = {
  identifie: { suffix: "Lancer process assurance", dueDays: 0 },
  rs_en_cours: { suffix: "RS envoyé : reçu ou besoin de relancer ?", dueDays: 1 },
  rs_recu: { suffix: "Demander les devis aux assureurs", dueDays: 1 },
  devis_demandes: { suffix: "Vérifier si devis reçus et envoyer comparatif au CS", dueDays: 3 },
  devis_recus: { suffix: "J+7 : Valider le devis", dueDays: 7 },
  envoye_cs: { suffix: "Relancer / attendre réponse CS (J+7)", dueDays: 7 },
  validation_cs: { suffix: "Valider le devis et signer le contrat", dueDays: 1 },
  contrat_signe: { suffix: "Notifier assureur + résiliation + MAJ Duomo", dueDays: 1 },
  resiliation_envoyee: { suffix: "Compléter le mandat SEPA", dueDays: 1 },
  sepa_complete: { suffix: "Finaliser et clôturer le dossier", dueDays: 1 },
};

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export type TaskGenerationResult = {
  created: number;
  checked: number;
  skippedExisting: number;
  skippedNoGestionnaire: number;
  skippedNotDue: number;
  skippedClientMri: number;
  closedTasksClientMri: number;
};

/**
 * Génère une tâche actionnable pour chaque deal actif qui doit être traité.
 *
 * - `identifie` (non démarré) : tâche "Lancer process assurance" uniquement si
 *   l'échéance du contrat est dans moins de 6 mois (ou déjà dépassée).
 * - Tout autre statut actif : tâche correspondant à l'étape, quelle que soit l'échéance.
 *
 * Idempotent : aucune tâche créée si le dossier a déjà une tâche ouverte (status "todo").
 * Les dossiers sans gestionnaire sont ignorés.
 *
 * Sert à la fois de backfill (lancé une fois après l'import) et de cron quotidien (auto-heal).
 */
export async function generateTasksForActivePipelines(
  { createdBy = "cron" }: { createdBy?: string } = {}
): Promise<TaskGenerationResult> {
  const now = new Date();
  const echeanceThreshold = addMonths(now, ECHEANCE_THRESHOLD_MONTHS);

  const pipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: { notIn: TERMINAL_STATUTS as PipelineStatut[] },
      copro: { archivedAt: null }, // ignorer les copros archivées (absentes d'Omni)
    },
    include: {
      copro: true,
      tasks: { where: { status: "todo" }, take: 1 },
    },
  });

  let created = 0;
  let skippedExisting = 0;
  let skippedNoGestionnaire = 0;
  let skippedNotDue = 0;
  let skippedClientMri = 0;
  let closedTasksClientMri = 0;

  for (const pipeline of pipelines) {
    // Cliente MRI HubSpot (hors Wakam) : dossier clos, aucune tâche. On ne crée
    // rien et on ferme les tâches encore ouvertes (rien à faire).
    if (isCloturePourClient(pipeline.copro.clientMriStatut, pipeline.copro.assureurActuel)) {
      const closed = await prisma.task.updateMany({
        where: { pipelineId: pipeline.id, status: "todo" },
        data: { status: "done", completedAt: now, completedBy: "system:client-mri" },
      });
      closedTasksClientMri += closed.count;
      skippedClientMri++;
      continue;
    }

    // Idempotent : ne pas créer si une tâche est déjà ouverte
    if (pipeline.tasks.length > 0) {
      skippedExisting++;
      continue;
    }

    const assignee = pipeline.copro.gestionnaireEmail;
    if (!assignee) {
      skippedNoGestionnaire++;
      continue;
    }

    const spec = STAGE_TASK_SPEC[pipeline.statut as ActiveStatut];
    if (!spec) continue; // sécurité : les statuts terminaux sont déjà filtrés

    const echeance = pipeline.copro.dateEcheance;

    // Deal non démarré : on n'agit que si l'échéance approche (< 6 mois) ou est dépassée
    if (pipeline.statut === "identifie") {
      if (!echeance || echeance > echeanceThreshold) {
        skippedNotDue++;
        continue;
      }
    }

    const body = echeance
      ? `Échéance contrat : ${echeance.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`
      : null;

    await prisma.task.create({
      data: {
        pipelineId: pipeline.id,
        name: `${pipeline.copro.nom} — ${spec.suffix}`,
        body,
        status: "todo",
        assigneeEmail: assignee,
        dueDate: addDays(spec.dueDays),
        createdBy,
      },
    });
    created++;
  }

  return { created, checked: pipelines.length, skippedExisting, skippedNoGestionnaire, skippedNotDue, skippedClientMri, closedTasksClientMri };
}
