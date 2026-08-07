import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendRelance } from "@/lib/rs4";

// POST /api/rs4/relance { relanceNum, subject, body } — Volet 3 : envoie une relance.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { relanceNum, subject, body } = await req.json().catch(() => ({}));
  if (!relanceNum || !subject || !body) return NextResponse.json({ error: "relanceNum, subject et body requis" }, { status: 400 });
  const res = await sendRelance(session.user.email!, Number(relanceNum), subject, body, Date.now());
  return NextResponse.json(res);
}
