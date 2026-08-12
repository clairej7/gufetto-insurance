import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendReadyToAuto6 } from "@/lib/devis5";

// POST /api/devis5/send-to-auto6 — envoie à l'Auto 6 les dossiers prêts
// (2 devis reçus, ou 1 reçu + l'autre refus / sans réponse ≥ 10 j).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const r = await sendReadyToAuto6(session.user.email ?? "?");
  return NextResponse.json({ ok: true, ...r });
}
