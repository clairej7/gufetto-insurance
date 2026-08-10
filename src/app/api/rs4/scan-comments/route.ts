import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanFrontComments } from "@/lib/rs4";

// POST /api/rs4/scan-comments { offset, limit } — scanne les commentaires internes
// des conversations Front des dossiers en relance (lecture only + flag DB).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 40 } = await req.json().catch(() => ({}));
  return NextResponse.json(await scanFrontComments(Number(offset) || 0, Number(limit) || 40));
}
