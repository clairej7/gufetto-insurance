import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendRsSentSampleToAuto4 } from "@/lib/courtier-audit";

// POST /api/courtier/send-rssent-to-auto4
// Charge dans l'auto 4 les dossiers « RS déjà envoyée » — APRÈS vérification
// manuelle (ils ne passent pas automatiquement l'échantillon clean).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const res = await sendRsSentSampleToAuto4(session.user.email!);
  return NextResponse.json(res);
}
