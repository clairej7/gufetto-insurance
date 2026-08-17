import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resetRsConv } from "@/lib/rs4";

// POST /api/rs4/reset-conv { pipelineId } — réinitialise la conversation RS
// (mauvais mail / redirection) : archive la conv Front + supprime les events
// d'envoi + remet l'état RS à zéro. Le dossier reste dans les automatisations.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  const r = await resetRsConv(String(pipelineId), session.user.email!);
  if (!r.ok) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  return NextResponse.json(r);
}
