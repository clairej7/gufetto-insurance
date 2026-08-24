import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveDevis5Cell, type ColKey } from "@/lib/devis5-excel";

// POST /api/devis5/excel/save-cell { pipelineId, key, value } — édition manuelle.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, key, value } = await req.json().catch(() => ({}));
  if (!pipelineId || !key) return NextResponse.json({ error: "pipelineId et key requis" }, { status: 400 });
  const cell = await saveDevis5Cell(pipelineId, key as ColKey, value ?? null);
  return NextResponse.json({ ok: true, cell });
}
