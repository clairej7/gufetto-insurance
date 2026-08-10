import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanReplies } from "@/lib/rs4";

// POST /api/rs4/scan-replies { offset, limit } — scanne un lot (lecture Front only).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 40 } = await req.json().catch(() => ({}));
  return NextResponse.json(await scanReplies(Number(offset) || 0, Number(limit) || 40));
}
