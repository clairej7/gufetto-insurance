import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPersoAddresses } from "@/lib/rs4";

// GET /api/rs4/check-perso — repasse les mails de l'échantillon (volet 2) et
// remonte les adresses perso / mails de CS.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json(await checkPersoAddresses());
}
