import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { closeRedirectConversation } from "@/lib/rs4";

// POST /api/rs4/close-conversation { pipelineId } — cas « redirection » : clôture
// (archive) la conversation Front + renvoie le dossier au Volet 1 (mail effacé)
// pour un nouvel envoi au bon contact.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  return NextResponse.json(await closeRedirectConversation(session.user.email!, pipelineId));
}
