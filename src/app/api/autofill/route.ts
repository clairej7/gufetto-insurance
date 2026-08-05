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
// fois : un CURSEUR PERSISTANT (copro/pipeline.autofillTenteLe) fait avancer le
// batch — on exclut les dossiers déjà tentés récemment, donc on ne re-traite plus
// les mêmes non-fiables à chaque clic. Ils redeviennent éligibles après le délai.

// Délai avant de re-tenter un dossier déjà passé par l'autofill (jours). Permet
// de repasser plus tard sur les non-fiables (Front rétabli / données nettoyées).
const RETRY_APRES_JOURS = 7;

export async function POST(req: NextRequest) {
  const session = await auth();
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (!isCron && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  }
  const actor = session?.user?.email || "cron@gufetto";

  const body = await req.json().catch(() => ({} as { limit?: number }));
  const limit = Math.min(Number(body.limit) || 25, 100); // borne de sécurité

  // Curseur persistant : on exclut les dossiers déjà tentés il y a moins de
  // RETRY_APRES_JOURS. Comme on marque chaque lot AVANT traitement (ci-dessous),
  // les non-fiables ne réapparaissent plus au lot/clic suivant → le batch avance.
  const cooldown = new Date(Date.now() - RETRY_APRES_JOURS * 24 * 60 * 60 * 1000);
  const pipelines = await prisma.insurancePipeline.findMany({
    where: {
      statut: "identifie",
      copro: {
        archivedAt: null,
        // On ne prospecte QUE des "identifié" réellement actifs : on exclut les
        // dossiers déjà classés "clos/gagné". Pour un identifié, clos = client MRI
        // HubSpot ("Insurance client") hors Wakam. Sinon le batch aiguillerait en
        // ODR des clients existants (mal rangés à l'étape "identifié" par l'import).
        NOT: {
          clientMriStatut: "Insurance client",
          NOT: { assureurActuel: { contains: "wakam", mode: "insensitive" } },
        },
      },
      OR: [{ autofillTenteLe: null }, { autofillTenteLe: { lt: cooldown } }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: limit,
  });

  // Marque tout le lot comme "tenté maintenant" AVANT de traiter : garantit qu'on
  // ne le reprendra pas au prochain lot/clic, y compris les non-fiables et les
  // dossiers qui déclencheraient une erreur (sinon boucle sur le même en-tête).
  if (pipelines.length > 0) {
    await prisma.insurancePipeline.updateMany({
      where: { id: { in: pipelines.map((p) => p.id) } },
      data: { autofillTenteLe: new Date() },
    });
  }

  const stats = { traites: 0, versRs: 0, versOdr: 0, nonFiables: 0, erreurs: 0 };
  const details: Array<Record<string, unknown>> = [];

  for (const p of pipelines) {
    try {
      // "action_manuelle" (et non "sync_auto") : l'aiguillage du batch est une
      // décision délibérée qui doit TENIR. Un event non-sync_auto par un acteur
      // marque le pipeline "touché" → la synchro Omni nocturne ne réécrase plus
      // son statut (sinon elle le renvoyait en "Identification" chaque nuit).
      const r = await applyAutofill(p.id, actor, "action_manuelle");
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

  // `count` = dossiers pris dans ce lot. `restants_potentiels` : le lot était plein
  // → il reste probablement des dossiers éligibles (l'appelant peut ré-appeler).
  return NextResponse.json({
    success: true,
    count: pipelines.length,
    restants_potentiels: pipelines.length === limit,
    stats,
    details,
  });
}
