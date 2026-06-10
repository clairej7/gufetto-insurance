export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { AdminBoard } from "@/components/admin/admin-board";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const pipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: { notIn: ["abandonne", "refuse", "non_assurable"] },
      copro: { archivedAt: null }, // masquer les copros archivées (absentes d'Omni)
    },
    include: {
      copro: true,
      taskCompletions: { include: { task: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });

  const taskTemplates = await prisma.stageTaskTemplate.findMany();

  const gestionnaires = [
    ...new Set(
      pipelines.map((p) => p.copro.gestionnaireEmail).filter(Boolean) as string[]
    ),
  ].sort();

  // Events des 12 dernières semaines pour le graphe d'évolution
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  const events = await prisma.pipelineEvent.findMany({
    where: { type: "statut_change", nouveauStatut: { not: null }, createdAt: { gte: twelveWeeksAgo } },
    include: { pipeline: { select: { copro: { select: { gestionnaireEmail: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#26262C", letterSpacing: "-0.02em" }}>Tracking</h1>
          <p className="text-sm mt-1" style={{ color: "#656576" }}>
            {pipelines.length} dossiers · {gestionnaires.length} gestionnaires
          </p>
        </div>
        <AdminBoard
          pipelines={pipelines as Parameters<typeof AdminBoard>[0]["pipelines"]}
          taskTemplates={taskTemplates}
          gestionnaires={gestionnaires}
          events={events as Parameters<typeof AdminBoard>[0]["events"]}
        />
      </main>
    </div>
  );
}
