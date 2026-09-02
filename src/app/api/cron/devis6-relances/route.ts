import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendDevis6Relances } from "@/lib/devis6-relance";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/devis6-relances
// Relance en thread les gestionnaires sans réponse depuis ≥ 2 jours (auto 6).
// Auth : header Authorization: Bearer CRON_SECRET (cron interne) OU session admin
// (bouton manuel). Appelé quotidiennement par le service crm-assurance-cron.
export async function POST(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const isCron = !!CRON_SECRET && authz === `Bearer ${CRON_SECRET}`;
  const session = isCron ? null : await auth();
  if (!isCron && !session?.user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const by = isCron ? "auto:devis6-relance" : (session?.user?.email ?? "admin");
  const r = await sendDevis6Relances(new Date(), by);
  return NextResponse.json({ success: true, ...r });
}
