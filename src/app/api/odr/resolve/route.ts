import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/odr/resolve  { pipelineIds: string[], action: "cancel" | "keep" }
// Traite les dossiers en incohérence après vérification :
//  - cancel : repassent en « Identification » + note « ODR annulé, vérification
//    manuelle nécessaire » (sortent du lot ODR).
//  - keep   : note d'override « ODR confirmé manuellement (Front ignoré) » → la
//    re-vérification ne les signale plus (assureur inchangé, gardés dans le lot).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const action: string = body.action;
  const ids: string[] = Array.isArray(body.pipelineIds) ? body.pipelineIds.filter((x: unknown) => typeof x === "string") : [];
  if (action !== "cancel" && action !== "keep") return NextResponse.json({ error: "action invalide" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ error: "aucun dossier" }, { status: 400 });

  if (action === "cancel") {
    await prisma.$transaction(
      ids.flatMap((id) => [
        prisma.insurancePipeline.update({ where: { id }, data: { statut: "identifie", odrPartenaire: null } }),
        prisma.pipelineEvent.create({
          data: {
            pipelineId: id,
            type: "statut_change",
            ancienStatut: "odr_en_cours",
            nouveauStatut: "identifie",
            description: "ODR annulé, vérification manuelle nécessaire (re-lecture Front en désaccord)",
            createdBy: actor,
          },
        }),
      ]),
    );
  } else {
    await prisma.$transaction(
      ids.map((id) =>
        prisma.pipelineEvent.create({
          data: {
            pipelineId: id,
            type: "note_ajoutee",
            description: "ODR confirmé manuellement (Front ignoré) — validé pour envoi",
            createdBy: actor,
          },
        }),
      ),
    );
  }

  return NextResponse.json({ success: true, count: ids.length, action });
}
