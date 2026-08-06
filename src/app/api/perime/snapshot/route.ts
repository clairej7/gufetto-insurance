import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordPerimeCleanSnapshot } from "@/lib/perime";

// POST /api/perime/snapshot
// Enregistre un instantané de l'historique « clean avis d'échéance » (fin d'un run).
// Le delta (dossiers résolus) est calculé serveur vs le dernier instantané.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  await recordPerimeCleanSnapshot(session.user.email ?? null);
  return NextResponse.json({ success: true });
}
