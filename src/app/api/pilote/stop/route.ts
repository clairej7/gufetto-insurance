import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stopPiloteIdentification } from "@/lib/pilote";

// POST /api/pilote/stop (admin) — « Stopper le mode Pilote » : arrête la boucle et
// fige un recap de session dans l'historique (renvoyé pour affichage immédiat).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const r = await stopPiloteIdentification(session.user.email ?? "admin");
  return NextResponse.json({ success: true, ...r });
}
