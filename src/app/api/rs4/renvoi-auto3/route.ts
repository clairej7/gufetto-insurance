import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { renvoiAuto3 } from "@/lib/rs4";

// POST /api/rs4/renvoi-auto3 { pipelineId, clearMail } — détecteur → Volet 1 (auto 3).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, clearMail = true } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  return NextResponse.json(await renvoiAuto3(session.user.email!, pipelineId, !!clearMail));
}
