export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Navbar } from "@/components/navbar";
import { CoproDetail } from "@/components/copro/copro-detail";
import { MOCK_USER } from "@/lib/mock-session";

export default async function CoproDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = MOCK_USER;

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id },
    include: {
      copro: true,
      taskCompletions: {
        include: { task: true },
        orderBy: { completedAt: "asc" },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      devisRecus: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!pipeline) notFound();

  const taskTemplates = await prisma.stageTaskTemplate.findMany({
    orderBy: [{ statut: "asc" }, { order: "asc" }],
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <CoproDetail
          pipeline={pipeline as Parameters<typeof CoproDetail>[0]["pipeline"]}
          taskTemplates={taskTemplates}
          userEmail={user.email}
        />
      </main>
    </div>
  );
}
