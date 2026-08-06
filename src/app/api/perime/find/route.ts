import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findPerimeeDossiers } from "@/lib/perime";

// POST /api/perime/find
// Automatisation 8 « clean avis d'échéance » — identifie tous les dossiers à échéance
// périmée (dépassée depuis > 6 mois, dossier actif) et pose/retire le flag en
// conséquence. Aucun changement d'étape ici : pose seulement la mention.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const res = await findPerimeeDossiers();
  return NextResponse.json({ success: true, ...res });
}
