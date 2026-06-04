"use server";

import { prisma } from "@/lib/prisma";
import { getNextStatut, PIPELINE_STEPS } from "@/lib/pipeline";
import { revalidatePath } from "next/cache";
import { MOCK_USER } from "@/lib/mock-session";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

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

export async function goToStatut(pipelineId: string, targetStatut: string) {
  const session = await getSession();
  const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) throw new Error("Pipeline introuvable");

  const ancienStatut = pipeline.statut;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.$transaction([
    prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { statut: targetStatut as any } }),
    prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "statut_change",
        ancienStatut,
        nouveauStatut: targetStatut,
        description: `Retour manuel à l'étape "${targetStatut}"`,
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
    include: { events: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!pipeline) throw new Error("Pipeline introuvable");

  const lostStatuts = ["refuse", "non_assurable", "abandonne"];
  const ancienStatut = pipeline.statut;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prevStatut: any;
  if (lostStatuts.includes(pipeline.statut)) {
    // Retrouver l'étape avant la perte via l'historique
    const lastChange = pipeline.events.find(
      (e) => e.type === "statut_change" && e.ancienStatut && !lostStatuts.includes(e.ancienStatut)
    );
    prevStatut = (lastChange?.ancienStatut ?? "identifie") as never;
  } else {
    const currentIdx = PIPELINE_STEPS.findIndex((s) => s.statut === pipeline.statut);
    if (currentIdx <= 0) return { success: false, error: "Déjà à la première étape" };
    prevStatut = PIPELINE_STEPS[currentIdx - 1].statut;
  }

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

export async function logRSDraftSent(
  pipelineId: string,
  toEmail: string,
  relanceNum: number
) {
  const session = await getSession();
  const description =
    relanceNum === 0
      ? `Brouillon demande RS créé dans Front — ${toEmail}`
      : `Relance ${relanceNum} RS créée dans Front — ${toEmail}`;

  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description,
      metadata: { rsType: "draft_sent", to: toEmail, relanceNum },
      createdBy: session.user.email!,
    },
  });

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function marquerRSRecu(pipelineId: string) {
  return advanceStatut(pipelineId, true, "RS reçu — passage aux devis");
}

export async function createAppelCourtierTask(pipelineId: string) {
  const session = await getSession();

  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description:
        "Tâche créée : Appeler le courtier pour récupérer le RS (J+28 sans réponse)",
      metadata: { rsType: "appel_courtier_task" },
      createdBy: session.user.email!,
    },
  });

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

export async function updateCoproCaracteristiques(
  coproId: string,
  pipelineId: string,
  data: {
    assureurActuel?: string | null;
    courtierActuel?: string | null;
    primeActuelle?: number | null;
    dateDebutContrat?: Date | null;
    contactCourtierEmail?: string | null;
    contactCourtierTel?: string | null;
    surfaceDeveloppee?: number | null;
    periodeConstruction?: string | null;
    natureOccupation?: string | null;
    activitesAggravantes?: string | null;
    caracteristiquesParticulieres?: string | null;
    proportionInoccupee?: string | null;
    protectionJuridique?: string | null;
    assureursDevis?: string | null;
    representantLegal?: string | null;
  }
) {
  await getSession();
  const sanitized = {
    ...data,
    surfaceDeveloppee: typeof data.surfaceDeveloppee === "number" && isNaN(data.surfaceDeveloppee) ? null : data.surfaceDeveloppee,
    primeActuelle: typeof data.primeActuelle === "number" && isNaN(data.primeActuelle) ? null : data.primeActuelle,
  };
  await prisma.copro.update({ where: { id: coproId }, data: sanitized });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function logDevisSent(
  pipelineId: string,
  assureur: string,
  toEmail: string,
  body?: string
) {
  const session = await getSession();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: `Demande de devis envoyée à ${assureur.toUpperCase()} — ${toEmail}`,
      metadata: { devisType: "devis_sent", assureur, to: toEmail, body: body ?? null },
      createdBy: session.user.email!,
    },
  });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function logRecoSent(
  pipelineId: string,
  toEmail: string,
  subject: string,
  body: string
) {
  const session = await getSession();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: `Email de recommandation envoyé au CS — ${toEmail}`,
      metadata: { recoType: "reco_sent", to: toEmail, subject, body },
      createdBy: session.user.email!,
    },
  });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function deleteNote(pipelineId: string, eventId: string) {
  await getSession();
  await prisma.pipelineEvent.delete({ where: { id: eventId } });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function editNote(pipelineId: string, eventId: string, newText: string) {
  await getSession();
  if (!newText.trim()) return { success: false, error: "Note vide" };
  await prisma.pipelineEvent.update({
    where: { id: eventId },
    data: { description: newText.trim() },
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

export async function addDevisRecu(
  pipelineId: string,
  data: {
    assureur: string;
    numeroContrat?: string | null;
    primeTTC: number;
    data?: string | null;
    notes?: string | null;
    pdfName?: string | null;
    pdfUrl?: string | null;
  }
) {
  await getSession();

  await prisma.devisRecu.create({
    data: {
      pipelineId,
      assureur: data.assureur,
      numeroContrat: data.numeroContrat ?? null,
      primeTTC: data.primeTTC,
      data: data.data ?? null,
      notes: data.notes ?? null,
      pdfName: data.pdfName ?? null,
      pdfUrl: data.pdfUrl ?? null,
    },
  });

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function updateDevisRecu(
  id: string,
  pipelineId: string,
  data: {
    assureur?: string;
    numeroContrat?: string | null;
    primeTTC?: number;
    data?: string | null;
    notes?: string | null;
    recommande?: boolean;
  }
) {
  await getSession();

  await prisma.devisRecu.update({
    where: { id },
    data,
  });

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function deleteDevisRecu(id: string, pipelineId: string) {
  await getSession();

  await prisma.devisRecu.delete({ where: { id } });

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function saveContratActuelData(pipelineId: string, data: string) {
  await getSession();
  await prisma.insurancePipeline.update({
    where: { id: pipelineId },
    data: { contratActuelData: data },
  });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function setRecommandeDevis(id: string, pipelineId: string) {
  await getSession();

  // Set all devis for this pipeline to recommande=false, then set the selected one to true
  await prisma.$transaction([
    prisma.devisRecu.updateMany({
      where: { pipelineId },
      data: { recommande: false },
    }),
    prisma.devisRecu.update({
      where: { id },
      data: { recommande: true },
    }),
  ]);

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function getPdfSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60); // 1 heure
  if (error || !data) return null;
  return data.signedUrl;
}
