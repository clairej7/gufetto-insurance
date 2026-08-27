import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setRelancePause } from "@/lib/rs4";

// POST /api/rs4/relance-pause { pipelineId, paused } — met de côté (paused=true)
// ou remet dans la boucle (paused=false) un dossier, sans changer son étape.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, paused } = await req.json().catch(() => ({}));
  if (!pipelineId || typeof paused !== "boolean") return NextResponse.json({ error: "pipelineId + paused (boolean) requis" }, { status: 400 });
  const r = await setRelancePause(pipelineId, paused, session.user.email || "admin@gufetto");
  if (!r.ok) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  return NextResponse.json({ success: true });
}
