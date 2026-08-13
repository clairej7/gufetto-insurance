import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendRelance } from "@/lib/rs4";

// POST /api/rs4/relance { relanceNum, limit? } — envoie la relance N (template
// server-side) EN RÉPONSE au fil d'origine. `limit` = envoyer seulement les N
// premiers éligibles (bouton « 5 relances »). Sans limit = tous les éligibles.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { relanceNum, limit } = await req.json().catch(() => ({}));
  if (!relanceNum) return NextResponse.json({ error: "relanceNum requis" }, { status: 400 });
  const lim = typeof limit === "number" && limit > 0 ? Math.floor(limit) : undefined;
  const res = await sendRelance(session.user.email!, Number(relanceNum), Date.now(), lim);
  return NextResponse.json(res);
}
