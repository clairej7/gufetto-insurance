export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/navbar";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { MOCK_USER } from "@/lib/mock-session";

export default async function PipelinePage() {
  const user = MOCK_USER;

  const pipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: { notIn: ["abandonne"] },
    },
    include: {
      copro: true,
      taskCompletions: { include: { task: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });

  // Get task templates counts per stage for progress indicators
  const taskTemplates = await prisma.stageTaskTemplate.findMany({
    orderBy: [{ statut: "asc" }, { order: "asc" }],
  });

  const lastSync = await prisma.copro.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} lastSyncAt={lastSync?.syncedAt} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Mon pipeline assurance</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pipelines.length} copropriété{pipelines.length !== 1 ? "s" : ""} en cours de traitement
          </p>
        </div>
        <PipelineBoard
          pipelines={pipelines as Parameters<typeof PipelineBoard>[0]["pipelines"]}
          taskTemplates={taskTemplates}
        />
      </main>
    </div>
  );
}
