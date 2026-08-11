import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recoverEscapedConversations } from "@/lib/rs4";

// POST /api/rs4/recover-inbox { offset, limit } — re-classe dans l'inbox Gufetto
// les conversations RS déplacées ailleurs (CSM via la règle Matera). Par lots.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 40 } = await req.json().catch(() => ({}));
  return NextResponse.json(await recoverEscapedConversations(Number(offset) || 0, Number(limit) || 40));
}
