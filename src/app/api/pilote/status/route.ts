import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPiloteStatus } from "@/lib/pilote";

// GET /api/pilote/status (admin) — état du mode Pilote (déployé ?, stats en cours,
// historique des sessions) pour alimenter le board Pilote.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json({ success: true, ...(await getPiloteStatus()) });
}
