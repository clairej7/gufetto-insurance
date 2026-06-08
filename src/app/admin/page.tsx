export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/navbar";
import { AdminBoard } from "@/components/admin/admin-board";
import { MOCK_USER } from "@/lib/mock-session";

export default async function AdminPage() {
  const user = MOCK_USER;

  const pipelines = await prisma.insurancePipeline.findMany({
    where: { statut: { notIn: ["abandonne", "refuse", "non_assurable"] } },
    include: {
      copro: true,
      taskCompletions: { include: { task: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });

  const taskTemplates = await prisma.stageTaskTemplate.findMany();

  // Get all unique gestionnaires
  const gestionnaires = [
    ...new Set(
      pipelines
        .map((p) => p.copro.gestionnaireEmail)
        .filter(Boolean) as string[]
    ),
  ].sort();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#26262C", letterSpacing: "-0.02em" }}>Vue d&apos;ensemble</h1>
          <p className="text-sm mt-1" style={{ color: "#656576" }}>
            {pipelines.length} dossiers · {gestionnaires.length} gestionnaires
          </p>
        </div>
        <AdminBoard
          pipelines={pipelines as Parameters<typeof AdminBoard>[0]["pipelines"]}
          taskTemplates={taskTemplates}
          gestionnaires={gestionnaires}
        />
      </main>
    </div>
  );
}
