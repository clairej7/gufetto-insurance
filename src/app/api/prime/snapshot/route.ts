import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordPrimeCleanSnapshot } from "@/lib/prime";

// POST /api/prime/snapshot  { resolved, montant }
// Enregistre un instantané de l'historique « clean prime » (fin d'un run de vérif
// en masse) : état courant du stock + ce que le run a apporté.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const resolved = Math.max(0, Math.round(Number(body.resolved) || 0));
  const montant = Math.max(0, Number(body.montant) || 0);
  await recordPrimeCleanSnapshot(resolved, montant, session.user.email ?? null);
  return NextResponse.json({ success: true });
}
