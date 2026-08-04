export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { ActivityBoard } from "@/components/admin/activity-board";

export default async function ActivitePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 jours

  // Pas de limite : on veut TOUS les events des 30 derniers jours pour que les
  // compteurs par utilisateur soient exacts (la fenêtre 30 j borne déjà le volume).
  // Le rendu de la liste chronologique est plafonné côté composant (perf).
  const [loginEvents, pipelineEvents] = await Promise.all([
    prisma.userLoginEvent.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pipelineEvent.findMany({
      where: {
        createdAt: { gte: since },
        type: { in: ["statut_change", "action_manuelle", "note_ajoutee"] },
      },
      include: { pipeline: { include: { copro: { select: { nom: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={session.user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#26262C", letterSpacing: "-0.02em" }}>
            Activité
          </h1>
          <p className="text-sm mt-1" style={{ color: "#656576" }}>
            Connexions et actions des 30 derniers jours
          </p>
        </div>
        <ActivityBoard loginEvents={loginEvents} pipelineEvents={pipelineEvents} />
      </main>
    </div>
  );
}
