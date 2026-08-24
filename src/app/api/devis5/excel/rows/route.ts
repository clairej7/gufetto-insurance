import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDevis5ExcelRows } from "@/lib/devis5-excel";

// POST /api/devis5/excel/rows — tableau initial (1 ligne/dossier, colonne A remplie).
export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await getDevis5ExcelRows()) });
}
