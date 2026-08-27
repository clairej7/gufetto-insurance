import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { applyIdentifyMoves, type IdentifyTarget } from "@/lib/autofill-identify";

// Volet 2 de l'auto 1 : applique le routage VALIDÉ par l'admin (déplace les
// dossiers cochés vers ODR / RS en cours). Trace un batchId pour l'historique.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email || "admin@gufetto";

  const body = await req.json().catch(() => ({} as { items?: Array<{ pipelineId: string; target: IdentifyTarget }>; batchId?: string }));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "aucun dossier à valider" }, { status: 400 });
  const batchId = body.batchId?.toString() || `${Date.now()}`;

  const res = await applyIdentifyMoves(items, actor, batchId);
  return NextResponse.json({ success: true, batchId, ...res });
}
