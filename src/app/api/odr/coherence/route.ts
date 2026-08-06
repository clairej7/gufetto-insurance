import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyOdrDossiers, isOdrPartnerKey } from "@/lib/odr";

// POST /api/odr/coherence  { partner, offset?, limit? }
// Repasse de vérification par TRANCHE (re-lecture Front + cohérence data) et levée
// de flag des flaggés confirmés. Coûteux (Front/dossier) → l'appelant boucle. Mutation.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const partner: string = body.partner || "";
  if (!isOdrPartnerKey(partner)) return NextResponse.json({ error: "partner invalide" }, { status: 400 });
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(Math.max(1, Number(body.limit) || 8), 25); // borné : appels Front lents

  const { total, count, unflagged, issues, done } = await verifyOdrDossiers(partner, session.user.email!, offset, limit);
  return NextResponse.json({ total, count, unflagged, issues, done });
}
