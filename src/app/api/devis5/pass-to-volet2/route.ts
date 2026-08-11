import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { passDevis5CompletsToVolet2 } from "@/lib/devis5";

// POST /api/devis5/pass-to-volet2 — passe au volet 2 tous les dossiers complets
// (RS + contrat) encore en volet 1. Idempotent (marqueur unique par dossier).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const r = await passDevis5CompletsToVolet2(session.user.email ?? "?");
  return NextResponse.json({ ok: true, ...r });
}
