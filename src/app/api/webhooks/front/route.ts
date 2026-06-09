import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Front envoie les événements de nouveaux messages entrants
// Doc : https://dev.frontapp.com/docs/webhooks-1
export async function POST(req: NextRequest) {
  const payload = await req.json() as FrontWebhookPayload;

  // On ne traite que les messages entrants (réponses)
  if (payload.type !== "message" || !payload.payload?.is_inbound) {
    return NextResponse.json({ ok: true });
  }

  const conversationId = payload.payload.conversation?.id;
  const htmlBody = payload.payload.body ?? "";
  const textBody = payload.payload.text ?? payload.payload.blurb ?? "";

  // Tenter d'extraire gufetto-ref depuis le HTML du message reçu
  // Format : gufetto-ref:{pipelineId}:{type}
  const refMatch = htmlBody.match(/gufetto-ref:([^<\s"]+)/);
  let pipelineId: string | null = null;
  let emailType: string | null = null;

  if (refMatch) {
    const parts = refMatch[1].split(":");
    pipelineId = parts[0] ?? null;
    emailType = parts.slice(1).join(":") || null;
  }

  // Fallback : chercher via conversationId dans les events existants
  if (!pipelineId && conversationId) {
    const sentEvent = await prisma.pipelineEvent.findFirst({
      where: {
        type: "action_manuelle",
        metadata: { path: ["conversationId"], equals: conversationId },
      },
      select: { pipelineId: true, metadata: true },
    });
    if (sentEvent) {
      pipelineId = sentEvent.pipelineId;
      const meta = sentEvent.metadata as Record<string, unknown> | null;
      emailType = (meta?.emailType as string) ?? null;
    }
  }

  if (!pipelineId) {
    return NextResponse.json({ ok: true });
  }

  const from = payload.payload.author?.email ?? "inconnu";
  const fromName = payload.payload.author?.name ?? from;
  const subject = payload.payload.subject ?? "(sans objet)";
  const description = buildDescription(emailType, fromName, from);

  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description,
      metadata: {
        frontReply: true,
        emailType,
        conversationId: conversationId ?? null,
        from,
        fromName,
        subject,
        body: textBody,
      },
      createdBy: "front-webhook",
    },
  });

  return NextResponse.json({ ok: true });
}

function buildDescription(emailType: string | null, fromName: string, from: string): string {
  const sender = `${fromName} (${from})`;
  if (!emailType) return `Réponse reçue de ${sender}`;

  if (emailType === "rs") return `Réponse reçue à la demande de RS — ${sender}`;
  if (emailType === "rs_relance") return `Réponse reçue à la relance RS — ${sender}`;
  if (emailType === "resiliation") return `Réponse reçue à l'email de résiliation — ${sender}`;
  if (emailType === "insureur") return `Réponse reçue à l'envoi du contrat signé — ${sender}`;
  if (emailType === "reco_cs") return `Réponse reçue à la recommandation — ${sender}`;
  if (emailType.startsWith("devis_")) {
    const assureur = emailType.replace("devis_", "").toUpperCase();
    return `Réponse reçue à la demande de devis ${assureur} — ${sender}`;
  }
  return `Réponse reçue de ${sender}`;
}

type FrontWebhookPayload = {
  type: string;
  payload?: {
    id?: string;
    is_inbound?: boolean;
    subject?: string;
    blurb?: string;
    text?: string;
    body?: string;
    conversation?: { id?: string };
    author?: { email?: string; name?: string };
  };
};
