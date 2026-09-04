import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildOdrRecapMessage, recordRecapSent, weekBounds } from "@/lib/odr-suivi";
import { postToChannelViaBot } from "@/lib/devis6-slack";

const CHANNEL = process.env.SLACK_DEVIS_CHANNEL_ID;

// POST /api/odr-suivi/post-recap (admin) — poste le recap hebdo « ODR acceptés » sur
// #devis_assurance_pro avec le lien vers la page tokenisée « Prévenir le CS ».
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  if (!CHANNEL) return NextResponse.json({ error: "SLACK_DEVIS_CHANNEL_ID non configuré" }, { status: 500 });

  const now = new Date();
  const m = await buildOdrRecapMessage(now);
  const r = await postToChannelViaBot(CHANNEL, m.text, m.blocks);
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Échec de l'envoi Slack" }, { status: 502 });
  await recordRecapSent(weekBounds(now).start.toISOString(), m.count, session.user?.email ?? null);
  return NextResponse.json({ success: true, count: m.count, link: m.url });
}
