import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { piloteIdentificationTick } from "@/lib/pilote";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/pilote-identification
// Un TICK de la boucle Pilote Identification (5 dossiers). Ne fait rien si le mode
// n'est pas déployé (ran=false). Appelé toutes les 10 min par le service cron.
// Auth : Bearer CRON_SECRET (cron) OU session admin (déclenchement manuel de test).
export async function POST(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const isCron = !!CRON_SECRET && authz === `Bearer ${CRON_SECRET}`;
  if (!isCron) {
    const session = await auth();
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await piloteIdentificationTick(isCron ? "auto:pilote" : "manuel:pilote-tick");
  return NextResponse.json({ success: true, ...r });
}
