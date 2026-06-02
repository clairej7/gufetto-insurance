"use server";

import { prisma } from "@/lib/prisma";
import { getNextStatut, PIPELINE_STEPS } from "@/lib/pipeline";
import { revalidatePath } from "next/cache";
import { MOCK_USER } from "@/lib/mock-session";

async function getSession() {
  return { user: MOCK_USER };
}

export async function advanceStatut(
  pipelineId: string,
  force = false,
  note?: string
) {
  const session = await getSession();

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    include: {
      copro: true,
      taskCompletions: true,
    },
  });

  if (!pipeline) throw new Error("Pipeline introuvable");

  const nextStatut = getNextStatut(pipeline.statut);
  if (!nextStatut) throw new Error("Dernière étape déjà atteinte");

  if (!force) {
    // Check required tasks are all completed
    const requiredTasks = await prisma.stageTaskTemplate.findMany({
      where: { statut: pipeline.statut, required: true },
    });

    const completedTaskIds = pipeline.taskCompletions.map((t) => t.taskId);
    const incomplete = requiredTasks.filter(
      (t) => !completedTaskIds.includes(t.id)
    );

    if (incomplete.length > 0) {
      return {
        success: false,
        error: `${incomplete.length} tâche(s) obligatoire(s) non complétée(s)`,
        incomplete,
      };
    }
  }

  const ancienStatut = pipeline.statut;

  await prisma.$transaction([
    prisma.insurancePipeline.update({
      where: { id: pipelineId },
      data: { statut: nextStatut },
    }),
    prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "statut_change",
        ancienStatut,
        nouveauStatut: nextStatut,
        description: note
          ? `Passage de "${ancienStatut}" à "${nextStatut}" — ${note}`
          : `Passage de "${ancienStatut}" à "${nextStatut}"`,
        createdBy: session.user.email!,
      },
    }),
  ]);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function goBackStatut(pipelineId: string, note?: string) {
  const session = await getSession();

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
  });
  if (!pipeline) throw new Error("Pipeline introuvable");

  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.statut === pipeline.statut);
  if (currentIdx <= 0) return { success: false, error: "Déjà à la première étape" };

  const prevStatut = PIPELINE_STEPS[currentIdx - 1].statut;
  const ancienStatut = pipeline.statut;

  await prisma.$transaction([
    prisma.insurancePipeline.update({
      where: { id: pipelineId },
      data: { statut: prevStatut },
    }),
    prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "statut_change",
        ancienStatut,
        nouveauStatut: prevStatut,
        description: note
          ? `Retour à "${prevStatut}" — ${note}`
          : `Retour à "${prevStatut}"`,
        createdBy: session.user.email!,
      },
    }),
  ]);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function marquerRefus(pipelineId: string, note?: string) {
  const session = await getSession();

  const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) throw new Error("Pipeline introuvable");

  await prisma.$transaction([
    prisma.insurancePipeline.update({
      where: { id: pipelineId },
      data: { statut: "refuse" },
    }),
    prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "action_manuelle",
        ancienStatut: pipeline.statut,
        nouveauStatut: "refuse",
        description: note
          ? `Deal perdu — Refus client : ${note}`
          : "Deal perdu — Refus client",
        createdBy: session.user.email!,
      },
    }),
  ]);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function marquerNonAssurable(pipelineId: string, note?: string) {
  const session = await getSession();

  const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) throw new Error("Pipeline introuvable");

  await prisma.$transaction([
    prisma.insurancePipeline.update({
      where: { id: pipelineId },
      data: { statut: "non_assurable" },
    }),
    prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "action_manuelle",
        ancienStatut: pipeline.statut,
        nouveauStatut: "non_assurable",
        description: note
          ? `Deal perdu — Copro non assurable : ${note}`
          : "Deal perdu — Copro non assurable",
        createdBy: session.user.email!,
      },
    }),
  ]);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function abandonPipeline(pipelineId: string, raison: string) {
  const session = await getSession();

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
  });
  if (!pipeline) throw new Error("Pipeline introuvable");

  await prisma.$transaction([
    prisma.insurancePipeline.update({
      where: { id: pipelineId },
      data: { statut: "abandonne" },
    }),
    prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "action_manuelle",
        ancienStatut: pipeline.statut,
        nouveauStatut: "abandonne",
        description: `Pipeline abandonné — ${raison}`,
        createdBy: session.user.email!,
      },
    }),
  ]);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function toggleTask(pipelineId: string, taskId: string, note?: string) {
  const session = await getSession();

  const existing = await prisma.taskCompletion.findUnique({
    where: { pipelineId_taskId: { pipelineId, taskId } },
  });

  const task = await prisma.stageTaskTemplate.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tâche introuvable");

  if (existing) {
    await prisma.$transaction([
      prisma.taskCompletion.delete({
        where: { pipelineId_taskId: { pipelineId, taskId } },
      }),
      prisma.pipelineEvent.create({
        data: {
          pipelineId,
          type: "tache_completee",
          description: `Tâche décochée : ${task.label}`,
          createdBy: session.user.email!,
        },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.taskCompletion.create({
        data: { pipelineId, taskId, completedBy: session.user.email!, note },
      }),
      prisma.pipelineEvent.create({
        data: {
          pipelineId,
          type: "tache_completee",
          description: `Tâche cochée : ${task.label}${note ? ` — ${note}` : ""}`,
          createdBy: session.user.email!,
        },
      }),
    ]);
  }

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function addNote(pipelineId: string, note: string) {
  const session = await getSession();

  if (!note.trim()) return { success: false, error: "Note vide" };

  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "note_ajoutee",
      description: note.trim(),
      createdBy: session.user.email!,
    },
  });

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function updatePipelineNotes(pipelineId: string, notes: string) {
  await getSession();

  await prisma.insurancePipeline.update({
    where: { id: pipelineId },
    data: { notes },
  });

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}
