import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanDevisReplies } from "@/lib/devis5";

// POST /api/devis5/scan-replies { offset, limit } — détecteur de réponses devis
// (conversations AXA/achille + Mila/souscription uniquement).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 20 } = await req.json().catch(() => ({}));
  const r = await scanDevisReplies(Number(offset) || 0, Number(limit) || 20);
  return NextResponse.json({ ok: true, ...r });
}
