import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRs4DetectorData } from "@/lib/rs4";

// GET /api/rs4/detector — données du Volet 3 (détecteur) pour rafraîchir après scan.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await getRs4DetectorData(Date.now()));
}
