import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { archiveOpenNoReply } from "@/lib/rs4";

// POST /api/rs4/archive-open — ré-archive les RS restées « ouvertes » sans réponse
// (course avec une règle Front qui rouvre la conv après l'envoi).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await archiveOpenNoReply());
}
