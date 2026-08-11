import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { passDevis6ToVolet2 } from "@/lib/devis6";

// POST /api/devis6/pass-to-volet2 — passe au volet 2 (mail CS) tous les dossiers
// dont la comparaison est prête (contrat + devis + prime vérifiée + reco choisie).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const r = await passDevis6ToVolet2(session.user.email ?? "?");
  return NextResponse.json({ ok: true, ...r });
}
