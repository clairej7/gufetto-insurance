export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { SyncBoard } from "@/components/admin/sync-board";
import { AutofillBatchButton } from "@/components/admin/autofill-batch-button";

export default async function SynchroPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Onglet réservé à l'admin (monitoring interne de la synchro nocturne).
  if (!session.user.isAdmin) redirect("/pipeline");

  const since = new Date();
  since.setDate(since.getDate() - 30); // 30 jours

  const runs = await prisma.syncRun.findMany({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    take: 300,
  });

  // Automatisation 1 : nb de dossiers "Aucune action" (candidats au pré-remplissage).
  const nbIdentifie = await prisma.insurancePipeline.count({
    where: { statut: "identifie", copro: { archivedAt: null } },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={session.user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#26262C", letterSpacing: "-0.02em" }}>
            Synchro Omni
          </h1>
          <p className="text-sm mt-1" style={{ color: "#656576" }}>
            État des synchronisations nocturnes (30 derniers jours)
          </p>
        </div>
        <div className="mb-8 rounded-xl border p-5" style={{ borderColor: "#E8E8EC", backgroundColor: "#ffffff" }}>
          <h2 className="text-base font-semibold" style={{ color: "#26262C" }}>
            Automatisation 1 — pré-remplissage depuis Front
          </h2>
          <p className="text-sm mt-1 mb-4" style={{ color: "#656576" }}>
            {nbIdentifie} dossier{nbIdentifie > 1 ? "s" : ""} en « Aucune action ». Récupère les 3 infos
            (assureur, n° de contrat, mail courtier) depuis Front et aiguille : partenaire → ODR, fiable → RS
            en cours, sinon reste en « Aucune action ».
          </p>
          <AutofillBatchButton defaultTarget={Math.min(100, nbIdentifie)} stock={nbIdentifie} />
        </div>
        <SyncBoard runs={runs} />
      </main>
    </div>
  );
}
