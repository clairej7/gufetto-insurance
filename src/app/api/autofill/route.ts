import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runAutofillChunk } from "@/lib/autofill-batch";

// Batch de l'automatisation 1 : passe les dossiers "Aucune action" (identifie)
// dans l'autofill Front → aiguille chacun (ODR / RS en cours / reste).
// Réservé aux admins (session isAdmin) ou à un appel cron (header x-cron-secret).
//
// NB : traitement SÉQUENTIEL et borné (limit) pour ménager les API Front/Anthropic
// et rester sous le timeout d'une requête. Pour tout le stock, appeler plusieurs
// fois : un CURSEUR PERSISTANT (copro/pipeline.autofillTenteLe) fait avancer le
// batch — on exclut les dossiers déjà tentés récemment, donc on ne re-traite plus
// les mêmes non-fiables à chaque clic. Ils redeviennent éligibles après le délai.
// Le scan nocturne (/api/cron/autofill) boucle sur ce même lot jusqu'à épuisement.

export async function POST(req: NextRequest) {
  const session = await auth();
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (!isCron && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  }
  const actor = session?.user?.email || "cron@gufetto";

  const body = await req.json().catch(() => ({} as { limit?: number; runId?: string }));
  const limit = Math.min(Number(body.limit) || 25, 100); // borne de sécurité
  const runId = body.runId?.toString() || undefined;

  const r = await runAutofillChunk(actor, limit, runId);

  // `count` = dossiers pris dans ce lot. `restants_potentiels` : le lot était plein
  // → il reste probablement des dossiers éligibles (l'appelant peut ré-appeler).
  return NextResponse.json({ success: true, ...r });
}
