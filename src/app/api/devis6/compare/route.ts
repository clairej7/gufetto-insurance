import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runDevis6Compare } from "@/lib/devis6-compare";

// POST /api/devis6/compare { pipelineId }
// Automatisation 6 — génère la comparaison d'un dossier DEPUIS le tableau, en
// réutilisant exactement l'extracteur Claude des fiches (@/lib/devis-extract) sur
// les documents déjà stockés (contrat MRI + devis AXA/Mila). Logique factorisée
// dans @/lib/devis6-compare (réutilisée par l'import de devis en masse).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = (await req.json().catch(() => ({}))) as { pipelineId?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const r = await runDevis6Compare(pipelineId, session.user.email ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, comparaisonFaite: true, devis: r.devis });
}
