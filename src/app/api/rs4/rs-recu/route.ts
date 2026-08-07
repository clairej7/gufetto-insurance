import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { marquerRSRecu } from "@/lib/actions";

// POST /api/rs4/rs-recu { pipelineId } — RS reçu : sort de la boucle de relances
// (rs_en_cours → devis_demandes), via l'action existante.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  await marquerRSRecu(pipelineId);
  return NextResponse.json({ ok: true });
}
