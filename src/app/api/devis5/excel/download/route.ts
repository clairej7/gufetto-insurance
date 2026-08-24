import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildDevis5Xlsx, type ExcelRow } from "@/lib/devis5-excel";

// POST /api/devis5/excel/download { rows } — renvoie le .xlsx (état affiché, éditions comprises).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { rows } = (await req.json().catch(() => ({}))) as { rows?: ExcelRow[] };
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "rows requis" }, { status: 400 });
  const buf = await buildDevis5Xlsx(rows);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="demandes-devis-axa.xlsx"`,
    },
  });
}
