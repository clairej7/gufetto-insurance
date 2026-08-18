import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildGestionnaireMessage, postToDevisChannel } from "@/lib/devis6-slack";

// POST /api/devis6/notify-gestionnaire { pipelineId } (admin)
// Automatisation 6 — bouton « Envoyer » : poste dans le canal Slack le message
// prévenant le gestionnaire des nouveaux devis. Journalise la transmission
// (event devis6_notify_gestionnaire → compteur dashboard). N'envoie qu'au canal
// configuré (SLACK_DEVIS_WEBHOOK_URL) ; aucun mail externe.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = (await req.json().catch(() => ({}))) as { pipelineId?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const built = await buildGestionnaireMessage(pipelineId);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 422 });

  const sent = await postToDevisChannel(built.text);
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });

  await prisma.pipelineEvent.create({
    data: { pipelineId, type: "action_manuelle", description: "Gestionnaire prévenu des nouveaux devis (message Slack)", metadata: { auto: "devis6_notify_gestionnaire" }, createdBy: session.user.email ?? "auto:devis6" },
  });
  return NextResponse.json({ success: true });
}
