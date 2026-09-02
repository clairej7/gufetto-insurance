import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contratPresent, CONTRAT_MANQUANT_MSG } from "@/lib/devis6";

// POST /api/devis7/mark-sent { pipelineId, to } (admin)
// Journalise l'envoi de la proposition au conseil syndical (auto 7). NE CHANGE PAS
// l'étape : le dossier reste en « Validation du CS » en attente de la réponse du CS
// (Statut CS renseigné à la main). Alimente la colonne « Envoi CS » (Envoyé + date)
// et le compteur « propositions transmises » du dashboard.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, to } = (await req.json().catch(() => ({}))) as { pipelineId?: string; to?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { id: true } });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  // Garde-fou : pas de contrat rattaché → on refuse l'envoi au CS.
  if (!(await contratPresent(pipelineId))) return NextResponse.json({ error: CONTRAT_MANQUANT_MSG }, { status: 422 });

  await prisma.pipelineEvent.create({
    data: {
      pipelineId, type: "action_manuelle",
      description: `Proposition envoyée au conseil syndical${to ? ` (${to})` : ""}`,
      metadata: { auto: "devis7_cs_sent", to: to ?? null },
      createdBy: session.user.email ?? "admin",
    },
  });
  return NextResponse.json({ success: true });
}
