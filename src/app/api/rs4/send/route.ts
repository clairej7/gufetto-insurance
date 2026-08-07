import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendVolet2 } from "@/lib/rs4";

// POST /api/rs4/send { subject, body } — Volet 2 : envoie les demandes de RS.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { subject, body, limit } = await req.json().catch(() => ({}));
  if (!subject || !body) return NextResponse.json({ error: "subject et body requis" }, { status: 400 });
  const res = await sendVolet2(session.user.email!, subject, body, typeof limit === "number" ? limit : undefined);
  return NextResponse.json(res);
}
