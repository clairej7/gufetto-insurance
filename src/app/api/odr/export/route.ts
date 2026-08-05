import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOdrByPartner, isOdrPartnerKey, odrCsv } from "@/lib/odr";

// GET /api/odr/export?partner=AXA&kind=ready|missing
// Renvoie un CSV (adresse + n° de contrat) des ODR non encore envoyés d'un assureur.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const partner = req.nextUrl.searchParams.get("partner") || "";
  const kind = req.nextUrl.searchParams.get("kind") === "missing" ? "missing" : "ready";
  if (!isOdrPartnerKey(partner)) return NextResponse.json({ error: "partner invalide" }, { status: 400 });

  const bucket = (await getOdrByPartner()).find((b) => b.key === partner)!;
  const dossiers = kind === "missing" ? bucket.missingNum : bucket.ready;
  const csv = odrCsv(dossiers);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="odr_${partner.toLowerCase()}_${kind}.csv"`,
    },
  });
}
