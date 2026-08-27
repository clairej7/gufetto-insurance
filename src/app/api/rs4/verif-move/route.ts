import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextStatut } from "@/lib/pipeline";
import type { PipelineStatut } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

// Auto 3/4 Volet 1 — déplacement manuel d'un dossier « à vérifier » :
//   direction=next            → étape suivante (Valider)
//   direction=identification  → retour à « Identification » (Renvoyer)
// Event action_manuelle → verrou anti-Omni + traçabilité.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email || "admin@gufetto";

  const { pipelineId, direction } = await req.json().catch(() => ({}));
  if (!pipelineId || !["next", "identification"].includes(direction)) {
    return NextResponse.json({ error: "pipelineId + direction (next|identification) requis" }, { status: 400 });
  }

  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { statut: true } });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  const target: PipelineStatut | null = direction === "identification" ? "identifie" : getNextStatut(p.statut);
  if (!target || target === p.statut) return NextResponse.json({ error: "Aucune étape cible valide" }, { status: 400 });

  const desc = direction === "identification"
    ? `Renvoyé manuellement en « Identification » (vérif échantillon RS)`
    : `Validé manuellement → étape suivante (vérif échantillon RS)`;

  await prisma.$transaction([
    prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { statut: target } }),
    prisma.pipelineEvent.create({
      data: { pipelineId, type: "action_manuelle", ancienStatut: p.statut, nouveauStatut: target, description: desc, metadata: { auto: "rs4_verif_move", direction }, createdBy: actor },
    }),
  ]);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${pipelineId}`);
  return NextResponse.json({ success: true, target });
}
