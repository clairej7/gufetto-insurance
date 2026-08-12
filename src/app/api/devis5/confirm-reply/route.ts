import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmDevisReply, type DevisReplyKind } from "@/lib/devis5";

const KINDS = ["devis_obtenu", "refus_assureur", "traiter_manuel", "pas_de_reponse"];

// POST /api/devis5/confirm-reply { eventId, kind } — confirme/corrige le statut
// d'une demande de devis via le menu déroulant.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { eventId, kind } = await req.json().catch(() => ({}));
  if (!eventId || !KINDS.includes(kind)) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  const r = await confirmDevisReply(String(eventId), kind as DevisReplyKind, session.user.email ?? "?");
  return NextResponse.json(r);
}
