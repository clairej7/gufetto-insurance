import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchCsMembersVolet2 } from "@/lib/devis6";

// POST /api/devis6/fetch-cs-members — récupère les membres du conseil syndical
// (Matera, role=council) pour les dossiers du volet 2 et les met en cache.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const r = await fetchCsMembersVolet2();
  return NextResponse.json({ ok: true, ...r });
}
