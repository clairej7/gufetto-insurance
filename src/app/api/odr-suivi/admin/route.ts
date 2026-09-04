import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOdrAcceptesSemaine, weekLabel } from "@/lib/odr-suivi";

// GET /api/odr-suivi/admin (admin) — même liste que la page gestio + l'état des flags
// « prévenir le CS » (retours des gestionnaires), pour le volet semi-auto.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const now = new Date();
  const rows = await getOdrAcceptesSemaine(now);
  return NextResponse.json({
    success: true,
    weekLabel: weekLabel(now),
    total: rows.length,
    aPrevenirCount: rows.filter((r) => r.prevenirCs).length,
    rows,
  });
}
