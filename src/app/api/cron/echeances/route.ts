import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CRON_SECRET = process.env.CRON_SECRET;
const TERMINAL_STATUTS = ["termine", "abandonne", "refuse", "non_assurable"];
const TASK_MARKER = "Lancer process assurance";

export async function POST(req: NextRequest) {
  // Vérification du secret pour éviter les appels non autorisés
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in4Months = new Date();
  in4Months.setMonth(in4Months.getMonth() + 4);

  // Pipelines actifs dont la copro a une échéance dans les 4 prochains mois
  const pipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: { notIn: TERMINAL_STATUTS as never[] },
      copro: {
        dateEcheance: {
          gte: now,
          lte: in4Months,
        },
      },
    },
    include: {
      copro: true,
      tasks: {
        where: { name: { contains: TASK_MARKER } },
        take: 1,
      },
    },
  });

  let created = 0;

  for (const pipeline of pipelines) {
    // Ne pas créer si la tâche existe déjà
    if (pipeline.tasks.length > 0) continue;

    const assignee = pipeline.copro.gestionnaireEmail;
    if (!assignee) continue;

    const echeance = pipeline.copro.dateEcheance!;
    const dueDate = new Date(echeance);
    dueDate.setMonth(dueDate.getMonth() - 4); // due date = aujourd'hui (on vient de passer le seuil)

    await prisma.task.create({
      data: {
        pipelineId: pipeline.id,
        name: `${pipeline.copro.nom} — Lancer process assurance`,
        body: `Échéance contrat : ${echeance.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`,
        status: "todo",
        assigneeEmail: assignee,
        dueDate: new Date(), // due maintenant — J0
        createdBy: "cron",
      },
    });

    created++;
  }

  return NextResponse.json({ success: true, created, checked: pipelines.length });
}
