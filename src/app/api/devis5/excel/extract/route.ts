import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractDevis5Row } from "@/lib/devis5-excel";

// POST /api/devis5/excel/extract { pipelineId } — remplit une ligne (Gufetto +
// extraction contrat) avec code couleur. Appelé en boucle par l'UI (barre de
// chargement) pour « Retrouver les infos de 5 / de X dossiers ».
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  const row = await extractDevis5Row(pipelineId);
  if (!row) return NextResponse.json({ error: "dossier introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true, row });
}
