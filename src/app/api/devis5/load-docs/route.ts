import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadDevis5Docs } from "@/lib/devis5";

// POST /api/devis5/load-docs { offset, limit } — charge un lot de docs (Front → Gufetto).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 5 } = await req.json().catch(() => ({}));
  return NextResponse.json(await loadDevis5Docs(Number(offset) || 0, Number(limit) || 5));
}
