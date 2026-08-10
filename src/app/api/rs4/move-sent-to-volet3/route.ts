import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moveSentToVolet3 } from "@/lib/rs4";

// POST /api/rs4/move-sent-to-volet3 — bascule les déjà-envoyés (à la main) au
// volet 3 avec leur vraie date d'envoi. Aucun mail envoyé.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await moveSentToVolet3(session.user.email!));
}
