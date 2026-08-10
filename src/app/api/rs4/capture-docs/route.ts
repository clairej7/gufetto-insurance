import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { captureDocsForPipeline } from "@/lib/rs-docs";

// POST /api/rs4/capture-docs { pipelineId } — récupère les PJ de la réponse
// courtier (RS / contrat MRI) dans Gufetto, à la demande depuis la fiche.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  return NextResponse.json(await captureDocsForPipeline(pipelineId, session.user.email ?? undefined));
}
