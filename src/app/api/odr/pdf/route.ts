import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOdrByPartner, isOdrPartnerKey, renderOdrPdf, frenchDate, letterDossiers } from "@/lib/odr";

// GET /api/odr/pdf?partner=AXA
// Génère la lettre ODR remplie (PDF) avec les copros ODR non encore envoyées de
// l'assureur. Aperçu inline (le bouton d'envoi joint le même PDF).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const partner = req.nextUrl.searchParams.get("partner") || "";
  if (!isOdrPartnerKey(partner)) return NextResponse.json({ error: "partner invalide" }, { status: 400 });

  const includeFlagged = req.nextUrl.searchParams.get("includeFlagged") === "1";
  const bucket = (await getOdrByPartner()).find((b) => b.key === partner)!;
  const dossiers = letterDossiers(bucket, includeFlagged);
  if (dossiers.length === 0) {
    return NextResponse.json({ error: "Aucun dossier prêt (avec n° de contrat) pour cet assureur" }, { status: 400 });
  }

  const pdf = await renderOdrPdf(dossiers, frenchDate(new Date()));
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ODR_${partner}_Matera.pdf"`,
    },
  });
}
