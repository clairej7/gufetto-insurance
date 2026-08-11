import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractDevis5Infos } from "@/lib/devis5";

// POST /api/devis5/extract-info { offset, limit } — complète les infos devis
// (8 champs) depuis les contrats MRI des dossiers du volet 2 encore incomplets.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 5 } = await req.json().catch(() => ({}));
  const r = await extractDevis5Infos(session.user.email ?? "?", Number(offset) || 0, Number(limit) || 5);
  return NextResponse.json({ ok: true, ...r });
}
