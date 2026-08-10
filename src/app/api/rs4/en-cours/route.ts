import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moveToEnCours } from "@/lib/rs4";

// POST /api/rs4/en-cours { pipelineId } — Volet 3 → Volet 4 « RS en cours de
// récupération » (courtier a répondu, RS pas encore reçu) : sort de la relance.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  return NextResponse.json(await moveToEnCours(session.user.email!, pipelineId));
}
