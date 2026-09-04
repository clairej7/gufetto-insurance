import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { signOdrWeekToken, getOdrAcceptesSemaine, weekBounds, weekLabel } from "@/lib/odr-suivi";
import { postToChannelViaBot } from "@/lib/devis6-slack";

const CHANNEL = process.env.SLACK_DEVIS_CHANNEL_ID;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://gufetto-insurance.up.railway.app";

// POST /api/odr-suivi/post-recap (admin) — poste le recap hebdo « ODR acceptés » sur
// #devis_assurance_pro avec le lien vers la page tokenisée « Prévenir le CS ».
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  if (!CHANNEL) return NextResponse.json({ error: "SLACK_DEVIS_CHANNEL_ID non configuré" }, { status: 500 });

  const now = new Date();
  const { start } = weekBounds(now);
  const rows = await getOdrAcceptesSemaine(now);
  const token = signOdrWeekToken(start.toISOString());
  const url = `${BASE_URL}/suivi-odr/${token}`;
  const label = weekLabel(now);

  const text = `ODR acceptés de la semaine (${label}) — ${rows.length} dossier(s)`;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*📋 ODR acceptés de la semaine* _(${label})_\nVoici les *${rows.length}* copropriété(s) dont l'ODR a été accepté cette semaine.` } },
    { type: "section", text: { type: "mrkdwn", text: `👉 <${url}|Voir la liste et signaler celles où il faut *prévenir le conseil syndical*>` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Repère tes copropriétés : si l'une est sensible, clique « Prévenir le CS » — l'équipe assurance s'en charge." }] },
  ];

  const r = await postToChannelViaBot(CHANNEL, text, blocks);
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Échec de l'envoi Slack" }, { status: 502 });
  return NextResponse.json({ success: true, count: rows.length, link: url });
}
