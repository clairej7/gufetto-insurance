import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findOdrDuplicates, isOdrPartnerKey } from "@/lib/odr";

// GET /api/odr/dedup?partner=AXA&includeFlagged=1
// Compare les ODR à envoyer aux ODR déjà envoyés (docs + base) et renvoie les doublons.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const partner = req.nextUrl.searchParams.get("partner") || "";
  if (!isOdrPartnerKey(partner)) return NextResponse.json({ error: "partner invalide" }, { status: 400 });
  const includeFlagged = req.nextUrl.searchParams.get("includeFlagged") === "1";

  const { candidates, sentCount, duplicates } = await findOdrDuplicates(partner, includeFlagged);
  return NextResponse.json({ ok: duplicates.length === 0, candidates, sentCount, duplicates });
}
