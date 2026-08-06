import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordPrimeCleanSnapshot } from "@/lib/prime";

// POST /api/prime/snapshot
// Enregistre un instantané de l'historique « clean prime » (fin d'un run). Le
// delta (résolus / montant ajouté) est calculé serveur vs le dernier instantané.
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  await recordPrimeCleanSnapshot(session.user.email ?? null);
  return NextResponse.json({ success: true });
}
