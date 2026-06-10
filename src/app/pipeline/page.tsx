export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export default async function PipelinePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const pipelines = await prisma.insurancePipeline.findMany({
    where: { copro: { archivedAt: null } }, // masquer les copros archivées (absentes d'Omni)
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

  const gestionnaires = [
    ...new Set(
      pipelines.map((p) => p.copro.gestionnaireEmail).filter(Boolean) as string[]
    ),
  ].sort();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} lastSyncAt={lastSync?.syncedAt} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#26262C", letterSpacing: "-0.02em" }}>Mes dossiers</h1>
          <p className="text-sm mt-1" style={{ color: "#656576" }}>
            Suivi des dossiers MRI en cours
          </p>
        </div>
        <PipelineBoard
          pipelines={pipelines as Parameters<typeof PipelineBoard>[0]["pipelines"]}
          taskTemplates={taskTemplates}
          gestionnaires={gestionnaires}
          currentUserEmail={user.email ?? ""}
        />
      </main>
    </div>
  );
}
