import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanCsReplies } from "@/lib/devis7-cs";

// POST /api/devis7/scan-cs { offset?, limit? } — scanne par lots les réponses du
// CS (Front, expéditeur = membre du CS) pour les dossiers en attente de statut.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const body = await req.json().catch(() => ({} as { offset?: number; limit?: number }));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(Math.max(1, Number(body.limit) || 15), 40);
  const r = await scanCsReplies(offset, limit);
  return NextResponse.json({ success: true, ...r });
}
