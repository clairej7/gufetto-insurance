import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logDevis5DocLoad } from "@/lib/devis5";

// POST /api/devis5/load-docs-log { dossiers, created } — enregistre l'historique d'un run.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { dossiers = 0, created = 0 } = await req.json().catch(() => ({}));
  await logDevis5DocLoad(session.user.email ?? "?", Number(dossiers) || 0, Number(created) || 0);
  return NextResponse.json({ ok: true });
}
