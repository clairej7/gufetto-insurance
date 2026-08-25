import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDevis5LotXlsx } from "@/lib/devis5-excel";

// POST /api/devis5/lot/download { lotId } — re-télécharge le .xlsx figé d'un lot.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { lotId } = await req.json().catch(() => ({}));
  if (!lotId) return NextResponse.json({ error: "lotId requis" }, { status: 400 });
  const buf = await getDevis5LotXlsx(lotId);
  if (!buf) return NextResponse.json({ error: "lot introuvable" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="demandes-devis-axa.xlsx"`,
    },
  });
}
