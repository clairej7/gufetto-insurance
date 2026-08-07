import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRs4Volet3Data } from "@/lib/rs4";

// GET /api/rs4/volet3 — suivi + éligibilité des relances.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await getRs4Volet3Data(Date.now()));
}
