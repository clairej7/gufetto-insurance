import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moveToDetector } from "@/lib/rs4";

// POST /api/rs4/to-detector { pipelineId } — renvoie un dossier au détecteur (V3).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  return NextResponse.json(await moveToDetector(session.user.email!, pipelineId));
}
