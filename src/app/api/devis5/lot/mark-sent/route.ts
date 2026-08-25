import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markDevis5LotSent } from "@/lib/devis5-excel";

// POST /api/devis5/lot/mark-sent { lotId } — marque le lot envoyé (à la main) :
// date + event devis_sent sur chaque dossier (met à jour le dashboard). Idempotent.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { lotId } = await req.json().catch(() => ({}));
  if (!lotId) return NextResponse.json({ error: "lotId requis" }, { status: 400 });
  const r = await markDevis5LotSent(lotId, session.user.email ?? "?");
  return NextResponse.json(r);
}
