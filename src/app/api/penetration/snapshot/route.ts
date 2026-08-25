import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordPenetrationSnapshot } from "@/lib/penetration";

// POST /api/penetration/snapshot { won, total } — enregistre (upsert) le point de
// la semaine courante. Appelé par le dashboard au chargement (idempotent).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { won, total } = await req.json().catch(() => ({}));
  if (typeof won === "number" && typeof total === "number") await recordPenetrationSnapshot(won, total);
  return NextResponse.json({ ok: true });
}
