import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanIdentifyPage } from "@/lib/autofill-identify";

// Volet 2 de l'auto 1 : scanne une PAGE de dossiers « Identification » et renvoie
// leur verdict de routage (ODR / RS / reste). Pur lecture — n'applique rien.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const body = await req.json().catch(() => ({} as { offset?: number; limit?: number }));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(Math.max(1, Number(body.limit) || 50), 200);
  const res = await scanIdentifyPage(offset, limit);
  return NextResponse.json({ success: true, ...res });
}
