import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moveToRelance, moveAllNoReplyToRelance } from "@/lib/rs4";

// POST /api/rs4/move-to-relance { pipelineId } | { all: true } — détecteur → Volet 4.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body?.all) return NextResponse.json(await moveAllNoReplyToRelance(session.user.email!));
  if (!body?.pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  return NextResponse.json(await moveToRelance(session.user.email!, body.pipelineId));
}
