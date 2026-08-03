import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { applyAutofill } from "@/lib/rs-autofill-core";

// Batch de l'automatisation 1 : passe les dossiers "Aucune action" (identifie)
// dans l'autofill Front → aiguille chacun (ODR / RS en cours / reste).
// Réservé aux admins (session isAdmin) ou à un appel cron (header x-cron-secret).
//
// NB : traitement SÉQUENTIEL et borné (limit) pour ménager les API Front/Anthropic
// et rester sous le timeout d'une requête. Pour tout le stock, appeler plusieurs
// fois (pagination naturelle : les dossiers aiguillés sortent de "identifie") ou
// brancher un vrai job de fond. Throttle/kill-switch = tour de contrôle (à venir).

export async function POST(req: NextRequest) {
  const session = await auth();
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (!isCron && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  }
  const actor = session?.user?.email || "cron@gufetto";

  const body = await req.json().catch(() => ({} as { limit?: number; skip?: number }));
  const limit = Math.min(Number(body.limit) || 25, 100); // borne de sécurité
  // Curseur : les dossiers NON fiables restent en "identifie". Pour enchaîner des
  // lots sans les retraiter en boucle, l'appelant fait avancer `skip` du nombre de
  // dossiers restés en place au lot précédent (ordre stable par id).
  const skip = Math.max(0, Number(body.skip) || 0);

  const pipelines = await prisma.insurancePipeline.findMany({
    where: { statut: "identifie", copro: { archivedAt: null } },
    select: { id: true },
    orderBy: { id: "asc" },
    skip,
    take: limit,
  });

  const stats = { traites: 0, versRs: 0, versOdr: 0, nonFiables: 0, erreurs: 0 };
  const details: Array<Record<string, unknown>> = [];

  for (const p of pipelines) {
    try {
      const r = await applyAutofill(p.id, actor, "sync_auto");
      stats.traites++;
      if (r.moved && r.targetStatut === "rs_en_cours") stats.versRs++;
      else if (r.moved && r.targetStatut === "odr_en_cours") stats.versOdr++;
      else stats.nonFiables++;
      details.push({
        pipelineId: p.id,
        assureur: r.info?.assureur ?? null,
        numero: r.info?.numeroContrat ?? null,
        mail: r.info?.mailCourtier ?? null,
        target: r.targetStatut,
        moved: r.moved,
      });
    } catch (e) {
      stats.erreurs++;
      console.error("[api/autofill]", p.id, e);
    }
  }

  // `count` = dossiers réellement pris dans ce lot ; `restes` = ceux restés en
  // "identifie" (non fiables + erreurs) → l'appelant s'en sert pour avancer skip.
  const moved = stats.versRs + stats.versOdr;
  const restes = pipelines.length - moved;
  return NextResponse.json({
    success: true,
    count: pipelines.length,
    restes,
    restants_potentiels: pipelines.length === limit,
    stats,
    details,
  });
}
