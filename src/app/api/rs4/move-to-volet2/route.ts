import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moveCompleteToVolet2 } from "@/lib/rs4";

// POST /api/rs4/move-to-volet2 — passe les dossiers « infos complètes » au volet 2.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await moveCompleteToVolet2(session.user.email!));
}
