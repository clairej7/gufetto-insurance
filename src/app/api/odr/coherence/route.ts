import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyOdrDossiers, isOdrPartnerKey } from "@/lib/odr";

// POST /api/odr/coherence  { partner }
// Repasse de vérification des dossiers d'un assureur : contrôle la cohérence et
// lève le flag des flaggés confirmés (data déjà fiabilisée). Mutation → POST.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const partner: string = body.partner || "";
  if (!isOdrPartnerKey(partner)) return NextResponse.json({ error: "partner invalide" }, { status: 400 });

  const { checked, unflagged, issues } = await verifyOdrDossiers(partner, session.user.email!);
  return NextResponse.json({ ok: issues.length === 0, checked, unflagged, issues });
}
