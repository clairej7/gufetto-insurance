import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRs4Sample } from "@/lib/rs4";

// GET /api/rs4/verify — Volet 1 auto 4 : trie l'échantillon en complets/incomplets.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await getRs4Sample());
}
