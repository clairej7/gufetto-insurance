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
  if (!conversationId) {
    return NextResponse.json({ ok: true });
  }

  // Chercher le pipeline event qui correspond à cette conversation
  const sentEvent = await prisma.pipelineEvent.findFirst({
    where: {
      type: "action_manuelle",
      metadata: { path: ["conversationId"], equals: conversationId },
    },
    select: { pipelineId: true },
  });

  if (!sentEvent) {
    return NextResponse.json({ ok: true });
  }

  const from = payload.payload.author?.email ?? "inconnu";
  const fromName = payload.payload.author?.name ?? from;
  const subject = payload.payload.subject ?? "(sans objet)";
  const body = payload.payload.text ?? payload.payload.blurb ?? "";

  await prisma.pipelineEvent.create({
    data: {
      pipelineId: sentEvent.pipelineId,
      type: "action_manuelle",
      description: `Réponse reçue de ${fromName} — ${from}`,
      metadata: {
        frontReply: true,
        conversationId,
        from,
        fromName,
        subject,
        body,
      },
      createdBy: "front-webhook",
    },
  });

  return NextResponse.json({ ok: true });
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
