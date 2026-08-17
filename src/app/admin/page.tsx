export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { AdminBoard } from "@/components/admin/admin-board";
import { getPrimeByStage } from "@/lib/prime";
import { getDocsStats, getDevisRecusStats } from "@/lib/rs-docs";
import { getOdrByInsurerBoard } from "@/lib/odr";
import { isCloturePourClient } from "@/lib/pipeline";

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

  // Dossiers perdus (exclus du dataset actif ci-dessus) : passés EN ENTIER (avec
  // échéance) pour la carte "Perdus" cliquable + le filtre échéance.
  const lostPipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: { in: ["abandonne", "refuse", "non_assurable"] },
      copro: { archivedAt: null },
    },
    include: {
      copro: true,
      taskCompletions: { include: { task: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });

  const taskTemplates = await prisma.stageTaskTemplate.findMany();
  const primeStages = await getPrimeByStage();
  // Nb de dossiers pour lesquels une demande de RS a été envoyée via Front (event rsType=draft_sent).
  const rsDemandes = (await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { pipelineId: true }, distinct: ["pipelineId"] })).length;
  // Nb de relances de RS envoyées = events draft_sent avec relanceNum > 0 (chaque relance compte).
  const rsRelances = (await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { metadata: true } }))
    .filter((e) => Number((e.metadata as { relanceNum?: number } | null)?.relanceNum ?? 0) > 0).length;
  // RS reçus = dossiers réellement passés « RS reçu → devis » (clics du bouton),
  // pas seulement ceux dont le fichier est rangé. Contrats récupérés = fichiers.
  const rsRecus = (await prisma.pipelineEvent.findMany({ where: { description: { contains: "RS reçu" } }, select: { pipelineId: true }, distinct: ["pipelineId"] })).length;
  const { contrat: contratsRecus } = await getDocsStats();
  const odrByInsurer = await getOdrByInsurerBoard();
  const devisRecus = await getDevisRecusStats();
  const { getRsFlowDaily } = await import("@/lib/rs4");
  const rsFlow = await getRsFlowDaily();
  const { getDevisFlowDaily } = await import("@/lib/devis5");
  const devisFlow = await getDevisFlowDaily();
  const { getExcludedCoproIds } = await import("@/lib/exclusions");
  const exclCoproIds = await getExcludedCoproIds();
  const excludedCount = await prisma.insurancePipeline.count({ where: { coproId: { in: exclCoproIds }, copro: { archivedAt: null } } });
  // Chiffres de la carte « Demande de devis » : PARTITION EXACTE des dossiers
  // ACTIFS de l'étape (leur somme = le total « dossiers » de la carte).
  // On aligne sur le board : les copros déjà clientes MRI (« Insurance client »
  // hors Wakam) sont bucketées « clos » et sorties de l'étape active → on les
  // exclut aussi ici, sinon en attente + à envoyer ne retombe pas sur le total.
  //  - en attente = demande DÉJÀ partie, pas encore de devis (le dossier reste
  //    dans l'étape jusqu'à réception ; les reçus sont passés en « Comparaison ») ;
  //  - à envoyer  = demande PAS ENCORE partie.
  const closClientDevisIds = pipelines
    .filter((p) => p.statut === "devis_demandes" && isCloturePourClient(p.copro.clientMriStatut, p.copro.assureurActuel))
    .map((p) => p.id);
  const SENT_EVENT = { some: { metadata: { path: ["devisType"], equals: "devis_sent" } } };
  const NO_SENT_EVENT = { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } };
  const devisMailsEnvoyes = await prisma.insurancePipeline.count({
    where: { statut: "devis_demandes", copro: { archivedAt: null }, id: { notIn: closClientDevisIds }, events: SENT_EVENT },
  });
  const devisAReclamer = await prisma.insurancePipeline.count({
    where: { statut: "devis_demandes", copro: { archivedAt: null }, id: { notIn: closClientDevisIds }, events: NO_SENT_EVENT },
  });

  const gestionnaires = [
    ...new Set(
      [...pipelines, ...lostPipelines]
        .map((p) => p.copro.gestionnaireEmail)
        .filter(Boolean) as string[]
    ),
  ].sort();

  // Events des 12 dernières semaines pour le graphe d'évolution
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
  // Toute transition de statut "faite par nous" : changements manuels, actions
  // manuelles ET aiguillages de l'automatisation 1 (loggés en sync_auto). On
  // exclut la synchro Omni nocturne (createdBy "sync") pour ne pas noyer le graphe
  // sous le pic d'import initial + le bruit quotidien.
  const events = await prisma.pipelineEvent.findMany({
    where: {
      type: { in: ["statut_change", "action_manuelle", "sync_auto"] },
      nouveauStatut: { not: null },
      createdBy: { not: "sync" },
      createdAt: { gte: twelveWeeksAgo },
    },
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
            {pipelines.length + lostPipelines.length} dossiers · {gestionnaires.length} gestionnaires
          </p>
        </div>
        <AdminBoard
          pipelines={pipelines as Parameters<typeof AdminBoard>[0]["pipelines"]}
          taskTemplates={taskTemplates}
          gestionnaires={gestionnaires}
          events={events as Parameters<typeof AdminBoard>[0]["events"]}
          lostPipelines={lostPipelines as Parameters<typeof AdminBoard>[0]["lostPipelines"]}
          primeStages={primeStages}
          rsDemandes={rsDemandes}
          rsRelances={rsRelances}
          rsRecus={rsRecus}
          contratsRecus={contratsRecus}
          devisMailsEnvoyes={devisMailsEnvoyes}
          devisAReclamer={devisAReclamer}
          odrByInsurer={odrByInsurer}
          devisRecus={devisRecus}
          rsFlow={rsFlow}
          devisFlow={devisFlow}
          excludedCount={excludedCount}
        />
      </main>
    </div>
  );
}
