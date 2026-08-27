import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runAutofillChunk, mergeStats, type AutofillStats } from "@/lib/autofill-batch";

// Scan nocturne de l'automatisation 1 « Pré-remplissage depuis Front ».
// Draine le stock des dossiers « Identification » par lots successifs jusqu'à
// épuisement, borné par un budget temps + un plafond de sécurité (pour rester
// sous le timeout d'une requête et ménager les API Front/Anthropic).
//
// Appelé chaque nuit par le service cron Railway (headers authorization/x-cron-secret).
// Grâce au curseur persistant (autofillTenteLe), un dossier non-fiable ou en erreur
// n'est pas repris dans la même nuit ; il redevient éligible après le cooldown.
// Aucun mail sortant : l'auto 1 ne fait qu'aiguiller des statuts (RS / ODR).

const CRON_SECRET = process.env.CRON_SECRET;

const CHUNK = 40; // taille d'un lot (requêtes courtes, comme le batch manuel)
const TIME_BUDGET_MS = 180_000; // ~3 min : on s'arrête ENTRE deux lots au-delà
const MAX_TOTAL = 500; // plafond dur de dossiers traités par nuit

export async function POST(req: NextRequest) {
  // Auth : soit le cron (Bearer CRON_SECRET ou x-cron-secret), soit un admin
  // connecté (pour déclencher/tester le scan à la main).
  const authHeader = req.headers.get("authorization");
  const xcron = req.headers.get("x-cron-secret");
  const isCron = !!CRON_SECRET && (authHeader === `Bearer ${CRON_SECRET}` || xcron === CRON_SECRET);
  const session = isCron ? null : await auth();
  if (!isCron && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = session?.user?.email || "cron@gufetto";

  const started = Date.now();
  let total: AutofillStats = { traites: 0, versRs: 0, versOdr: 0, nonFiables: 0, erreurs: 0 };
  let count = 0;
  let lots = 0;
  let drained = false;

  while (count < MAX_TOTAL && Date.now() - started < TIME_BUDGET_MS) {
    const take = Math.min(CHUNK, MAX_TOTAL - count);
    const r = await runAutofillChunk(actor, take);
    lots++;
    total = mergeStats(total, r.stats);
    count += r.count;
    // Stock épuisé (lot plus court que demandé) ou rien pris → terminé.
    if (!r.restants_potentiels || r.count === 0) { drained = true; break; }
  }

  const result = { success: true, count, lots, drained, dureeMs: Date.now() - started, stats: total };
  console.log(new Date().toISOString(), "[cron/autofill]", JSON.stringify(result));
  return NextResponse.json(result);
}
