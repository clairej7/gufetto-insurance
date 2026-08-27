import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchCsMembersDevis7 } from "@/lib/devis7";

// POST /api/devis7/fetch-cs-members — récupère les membres du CS (Matera,
// role=council) pour les dossiers de l'auto 7 où ils ne sont pas encore renseignés.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const r = await fetchCsMembersDevis7();
  return NextResponse.json({ ok: true, ...r });
}
