import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeWeeklyRecap } from "@/lib/weekly-recap";
import { postToChannelViaBot } from "@/lib/devis6-slack";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/weekly-recap
// Poste le recap hebdo « Assurance Pro » (semaine EN COURS, lun→run) dans
// #team_insurance_fr. Auth : header Authorization: Bearer CRON_SECRET (cron externe)
// OU session admin (déclenchement manuel via le bouton). Cron cible : vendredi 16h
// Europe/Paris (= 14h UTC été / 15h UTC hiver).
export async function POST(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const isCron = !!CRON_SECRET && authz === `Bearer ${CRON_SECRET}`;
  const session = isCron ? null : await auth();
  if (!isCron && !session?.user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channel = process.env.SLACK_TEAM_INSURANCE_CHANNEL_ID;
  if (!channel) return NextResponse.json({ error: "SLACK_TEAM_INSURANCE_CHANNEL_ID non configuré" }, { status: 500 });

  const recap = await computeWeeklyRecap(new Date());
  const sent = await postToChannelViaBot(channel, recap.text, recap.blocks);
  if (!sent.ok) return NextResponse.json({ error: sent.error ?? "Échec de l'envoi Slack" }, { status: 502 });

  return NextResponse.json({ success: true, week: recap.week, ts: sent.ts });
}
