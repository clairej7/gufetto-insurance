import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOdrAcceptesSemaine, weekLabel, weekBounds, getRecapStatus, getRecapHistory } from "@/lib/odr-suivi";

// GET /api/odr-suivi/admin (admin) — même liste que la page gestio + l'état des flags
// « prévenir le CS » (retours des gestionnaires), pour le volet semi-auto.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const now = new Date();
  const [rows, sent, history] = await Promise.all([
    getOdrAcceptesSemaine(now),
    getRecapStatus(weekBounds(now).start.toISOString()),
    getRecapHistory(),
  ]);
  return NextResponse.json({
    success: true,
    weekLabel: weekLabel(now),
    total: rows.length,
    aPrevenirCount: rows.filter((r) => r.prevenirCs).length,
    rows,
    sent,      // statut d'envoi de la semaine en cours (null si pas encore envoyé)
    history,   // recaps clôturés des semaines passées (vide pour l'instant)
  });
}
