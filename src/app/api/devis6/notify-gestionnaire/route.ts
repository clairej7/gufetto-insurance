import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildGestionnaireMessage, postDevisMessage } from "@/lib/devis6-slack";
import { contratPresent, CONTRAT_MANQUANT_MSG, comparaisonValide, DEVIS_INVALIDE_MSG } from "@/lib/devis6";

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

  // Garde-fou : pas de contrat rattaché → on refuse la transmission.
  if (!(await contratPresent(pipelineId))) return NextResponse.json({ error: CONTRAT_MANQUANT_MSG }, { status: 422 });
  // Garde-fou : aucun devis d'assurance valide (faux devis / hors MRI) → refus.
  if (!(await comparaisonValide(pipelineId))) return NextResponse.json({ error: DEVIS_INVALIDE_MSG }, { status: 422 });

  const built = await buildGestionnaireMessage(pipelineId);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 422 });

  const sent = await postDevisMessage(built.text, built.blocks);
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });

  // On mémorise le ts/channel du message initial (si bot token) → permet aux
  // réponses gestio d'arriver EN THREAD + de poser une réaction sur ce message.
  await prisma.pipelineEvent.create({
    data: { pipelineId, type: "action_manuelle", description: "Gestionnaire prévenu des nouveaux devis (message Slack)", metadata: { auto: "devis6_notify_gestionnaire", slackTs: sent.ts ?? null, slackChannel: sent.channel ?? null }, createdBy: session.user.email ?? "auto:devis6" },
  });
  return NextResponse.json({ success: true });
}
