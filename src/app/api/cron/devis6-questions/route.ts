import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectDevis6Questions } from "@/lib/devis6-questions";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/devis6-questions
// Détecte les questions gestionnaire sous une propo (auto 6) et tague le relai en
// thread. Auth : Bearer CRON_SECRET (cron interne, ~5 min) OU session admin.
export async function POST(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const isCron = !!CRON_SECRET && authz === `Bearer ${CRON_SECRET}`;
  const session = isCron ? null : await auth();
  if (!isCron && !session?.user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const by = isCron ? "auto:devis6-question" : (session?.user?.email ?? "admin");
  const r = await detectDevis6Questions(new Date(), by);
  return NextResponse.json({ success: true, ...r });
}
