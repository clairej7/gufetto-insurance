import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendCleanSampleToAuto4 } from "@/lib/courtier-audit";

// POST /api/courtier/send-to-auto4
// Charge l'échantillon clean (courtier + mail, RS non envoyée) dans l'auto 4.
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const res = await sendCleanSampleToAuto4(session.user.email!);
  return NextResponse.json(res);
}
