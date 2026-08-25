import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildDevis5Xlsx, createDevis5Lot, type ExcelRow } from "@/lib/devis5-excel";

// POST /api/devis5/excel/download { rows, finalize? }
// - Sans finalize : renvoie juste le .xlsx (état affiché).
// - finalize=true (« Générer l'excel » du Volet 2) : crée un LOT (Volet 3), sort
//   les dossiers du Volet 2, PUIS renvoie le .xlsx. L'id du lot est dans l'en-tête X-Lot-Id.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { rows, finalize } = (await req.json().catch(() => ({}))) as { rows?: ExcelRow[]; finalize?: boolean };
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "rows requis" }, { status: 400 });
  let lotId = "";
  if (finalize) {
    const lot = await createDevis5Lot(rows, session.user.email ?? "?");
    lotId = lot.id;
  }
  const buf = await buildDevis5Xlsx(rows);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="demandes-devis-axa.xlsx"`,
      ...(lotId ? { "X-Lot-Id": lotId } : {}),
    },
  });
}
