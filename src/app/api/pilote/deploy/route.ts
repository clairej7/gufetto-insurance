import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deployPiloteIdentification } from "@/lib/pilote";

// POST /api/pilote/deploy (admin) — « Déployer le mode Pilote » : active la boucle
// autonome d'Identification (le cron pilote-identification traitera 5 dossiers /10 min).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const status = await deployPiloteIdentification(session.user.email ?? "admin");
  return NextResponse.json({ success: true, ...status });
}
