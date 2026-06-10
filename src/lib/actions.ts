"use server";

import { prisma } from "@/lib/prisma";
import { getNextStatut, PIPELINE_STEPS } from "@/lib/pipeline";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getSession() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Non authentifié");
  return session;
}

async function createPipelineTask({
  pipelineId,
  name,
  body,
  assigneeEmail,
  dueDate,
  createdBy,
}: {
  pipelineId: string;
  name: string;
  body?: string;
  assigneeEmail: string;
  dueDate?: Date;
  createdBy: string;
}) {
  return prisma.task.create({
    data: { pipelineId, name, body: body ?? null, assigneeEmail, dueDate: dueDate ?? null, createdBy },
  });
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

  const coproNom = pipeline.copro.nom;
  const assignee = pipeline.copro.gestionnaireEmail || session.user.email!;

  const due = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d; };

  // Avance manuelle vers rs_en_cours : créer tâche RS si pas déjà créée
  if (nextStatut === "rs_en_cours") {
    const existing = await prisma.task.findFirst({ where: { pipelineId, name: { contains: "RS envoyé" } } });
    if (!existing) {
      await createPipelineTask({ pipelineId, name: `${coproNom} — RS envoyé : reçu ou besoin de relancer ?`, assigneeEmail: assignee, dueDate: due(1), createdBy: session.user.email! });
    }
  }

  // Avance vers rs_recu : compléter les tâches RS ouvertes
  if (nextStatut === "rs_recu") {
    await prisma.task.updateMany({
      where: { pipelineId, status: "todo" },
      data: { status: "done", completedAt: new Date(), completedBy: session.user.email! },
    });
  }

  // Avance vers devis_demandes : créer tâche comparatif si pas déjà créée
  if (nextStatut === "devis_demandes") {
    const existing = await prisma.task.findFirst({ where: { pipelineId, name: { contains: "comparatif" } } });
    if (!existing) {
      await createPipelineTask({ pipelineId, name: `${coproNom} — Vérifier si devis reçus et envoyer comparatif au CS`, assigneeEmail: assignee, dueDate: due(3), createdBy: session.user.email! });
    }
  }

  if (nextStatut === "devis_recus") {
    await createPipelineTask({ pipelineId, name: `${coproNom} — J+7 : Valider le devis`, assigneeEmail: assignee, dueDate: due(7), createdBy: session.user.email! });
  }

  if (nextStatut === "contrat_signe") {
    await Promise.all([
      createPipelineTask({ pipelineId, name: `${coproNom} — Notifier le nouvel assureur`, assigneeEmail: assignee, dueDate: due(1), createdBy: session.user.email! }),
      createPipelineTask({ pipelineId, name: `${coproNom} — Envoyer la résiliation (mail + LRAR)`, assigneeEmail: assignee, dueDate: due(1), createdBy: session.user.email! }),
      createPipelineTask({ pipelineId, name: `${coproNom} — Mettre à jour le contrat dans Duomo`, assigneeEmail: assignee, dueDate: due(1), createdBy: session.user.email! }),
    ]);
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  revalidatePath("/tasks");
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
  relanceNum: number,
  conversationId?: string
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
      metadata: { rsType: "draft_sent", to: toEmail, relanceNum, conversationId: conversationId || null },
      createdBy: session.user.email!,
    },
  });

  const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, include: { copro: true } });
  if (pipeline) {
    const assignee = pipeline.copro.gestionnaireEmail || session.user.email!;
    const taskName = relanceNum === 0
      ? `${pipeline.copro.nom} — RS envoyé : reçu ou besoin de relancer ?`
      : `${pipeline.copro.nom} — Relance ${relanceNum} RS envoyée : RS reçu ?`;
    const daysOffset = relanceNum === 0 ? 1 : relanceNum === 1 ? 5 : 3;
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + daysOffset);
    await createPipelineTask({ pipelineId, name: taskName, assigneeEmail: assignee, dueDate, createdBy: session.user.email! });
  }

  revalidatePath(`/pipeline/${pipelineId}`);
  revalidatePath("/tasks");
  return { success: true };
}

export async function marquerRSRecu(pipelineId: string) {
  const session = await getSession();
  await prisma.task.updateMany({
    where: { pipelineId, status: "todo" },
    data: { status: "done", completedAt: new Date(), completedBy: session.user.email! },
  });
  revalidatePath("/tasks");
  return advanceStatut(pipelineId, true, "RS reçu — passage aux devis");
}

export async function createAppelCourtierTask(pipelineId: string) {
  const session = await getSession();

  const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, include: { copro: true } });

  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: "Tâche créée : Appeler le courtier pour récupérer le RS (J+28 sans réponse)",
      metadata: { rsType: "appel_courtier_task" },
      createdBy: session.user.email!,
    },
  });

  if (pipeline) {
    const assignee = pipeline.copro.gestionnaireEmail || session.user.email!;
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 2);
    await createPipelineTask({
      pipelineId,
      name: `${pipeline.copro.nom} — Appeler le courtier pour récupérer le RS`,
      body: "J+28 sans réponse aux emails de relance",
      assigneeEmail: assignee,
      dueDate,
      createdBy: session.user.email!,
    });
  }

  revalidatePath(`/pipeline/${pipelineId}`);
  revalidatePath("/tasks");
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
    numeroContrat?: string | null;
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
  body?: string,
  conversationId?: string
) {
  const session = await getSession();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: `Demande de devis envoyée à ${assureur.toUpperCase()} — ${toEmail}`,
      metadata: { devisType: "devis_sent", assureur, to: toEmail, body: body ?? null, conversationId: conversationId || null },
      createdBy: session.user.email!,
    },
  });

  // Créer la tâche comparatif une seule fois (au premier devis envoyé)
  const existing = await prisma.task.findFirst({ where: { pipelineId, name: { contains: "comparatif" } } });
  if (!existing) {
    const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, include: { copro: true } });
    if (pipeline) {
      const assignee = pipeline.copro.gestionnaireEmail || session.user.email!;
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 3);
      await createPipelineTask({
        pipelineId,
        name: `${pipeline.copro.nom} — Vérifier si devis reçus et envoyer comparatif au CS`,
        assigneeEmail: assignee,
        dueDate,
        createdBy: session.user.email!,
      });
    }
  }

  revalidatePath(`/pipeline/${pipelineId}`);
  revalidatePath("/tasks");
  return { success: true };
}

export async function logInsureurEmailSent(
  pipelineId: string,
  toEmail: string,
  subject: string,
  body: string,
  conversationId?: string
) {
  const session = await getSession();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: `Email envoyé au nouvel assureur — ${toEmail}`,
      metadata: { insureurType: "insureur_sent", to: toEmail, subject, body, conversationId: conversationId || null },
      createdBy: session.user.email!,
    },
  });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function logResiliationEmailSent(
  pipelineId: string,
  toEmail: string,
  subject: string,
  body: string,
  conversationId?: string
) {
  const session = await getSession();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: `Email de résiliation envoyé à l'ancien assureur — ${toEmail}`,
      metadata: { resiliationType: "resiliation_sent", to: toEmail, subject, body, conversationId: conversationId || null },
      createdBy: session.user.email!,
    },
  });
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function toggleTermineTask(pipelineId: string, taskKey: string, done: boolean) {
  const session = await getSession();
  if (done) {
    await prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "action_manuelle",
        description: `Tâche finale cochée — ${taskKey}`,
        metadata: { termineTask: taskKey },
        createdBy: session.user.email!,
      },
    });
  } else {
    await prisma.pipelineEvent.deleteMany({
      where: {
        pipelineId,
        type: "action_manuelle",
        metadata: { path: ["termineTask"], equals: taskKey },
      },
    });
  }
  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function logRecoSent(
  pipelineId: string,
  toEmail: string,
  subject: string,
  body: string,
  conversationId?: string
) {
  const session = await getSession();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: `Email de recommandation envoyé au CS — ${toEmail}`,
      metadata: { recoType: "reco_sent", to: toEmail, subject, body, conversationId: conversationId || null },
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

export async function saveSignedPdfUrl(pipelineId: string, signedPdfUrl: string) {
  await getSession();

  await prisma.insurancePipeline.update({
    where: { id: pipelineId },
    data: { signedPdfUrl },
  });

  // Extraction automatique des données du contrat signé
  try {
    const { data: pdfData, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(signedPdfUrl);

    if (!error && pdfData) {
      const buf = await pdfData.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: `Extrait ces 3 informations du contrat d'assurance MRI. Retourne UNIQUEMENT un JSON valide sans markdown.

Indices selon l'assureur :
- Numéro de contrat : champ "Votre contrat", "N° de contrat", ou référence commençant par PO-, MRI-, etc.
- Date d'effet : champ "Date d'effet", "Date de prise d'effet", ou "Date d'effet" dans un bloc références
- Prime TTC : montant annuel toutes taxes comprises — peut apparaître en gros (ex: "1489,20 € TTC"), dans un paragraphe ("soit 3 978,75 € frais et taxes inclus"), ou dans un tableau de cotisation

{
  "numeroContrat": "numéro de contrat exact tel qu'il apparaît (string ou null)",
  "dateEffet": "date d'effet au format YYYY-MM-DD (string ou null)",
  "primeTTC": "prime annuelle TTC en euros, nombre seul sans symbole (number ou null)"
}` },
          ],
        }],
      });

      const raw = (response.content[0] as { type: string; text: string }).text
        .trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
      const extracted = JSON.parse(raw) as { numeroContrat?: string | null; dateEffet?: string | null; primeTTC?: number | null };

      const updateData: Record<string, unknown> = {};
      if (extracted.numeroContrat) updateData.nouveauNumeroContrat = extracted.numeroContrat;
      if (extracted.primeTTC) updateData.nouveauPrimeTTC = extracted.primeTTC;
      if (extracted.dateEffet) updateData.nouveauDateEffet = new Date(extracted.dateEffet);

      if (Object.keys(updateData).length > 0) {
        await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: updateData });

        // Synchronise aussi le numéro de contrat sur la copro pour le mail de résiliation
        if (extracted.numeroContrat) {
          const pipeline = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId } });
          if (pipeline) await prisma.copro.update({ where: { id: pipeline.coproId }, data: { numeroContrat: extracted.numeroContrat } });
        }
      }
    }
  } catch {
    // L'extraction est best-effort — on ne bloque pas si Claude échoue
  }

  revalidatePath(`/pipeline/${pipelineId}`);
  return { success: true };
}

export async function completeTask(taskId: string) {
  const session = await getSession();
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "done", completedAt: new Date(), completedBy: session.user.email! },
  });
  revalidatePath("/tasks");
  return { success: true };
}

export async function reopenTask(taskId: string) {
  await getSession();
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "todo", completedAt: null, completedBy: null },
  });
  revalidatePath("/tasks");
  return { success: true };
}

export async function getTasks(filterEmail?: string) {
  await getSession();

  const tasks = await prisma.task.findMany({
    where: filterEmail ? { assigneeEmail: filterEmail } : {},
    include: {
      pipeline: {
        include: { copro: true },
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });

  return { tasks };
}

export async function getAllAssignees() {
  await getSession();
  const copros = await prisma.copro.findMany({
    select: { gestionnaireEmail: true },
    where: { gestionnaireEmail: { not: null } },
    distinct: ["gestionnaireEmail"],
  });
  return copros.map((c) => c.gestionnaireEmail).filter(Boolean) as string[];
}

export async function updateTaskDueDate(taskId: string, dueDate: Date | null) {
  await getSession();
  await prisma.task.update({
    where: { id: taskId },
    data: { dueDate },
  });
  revalidatePath("/tasks");
  revalidatePath("/pipeline");
}
