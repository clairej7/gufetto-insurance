import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/odr/resolve  { pipelineIds: string[], action }
// Résolution des dossiers signalés après vérification.
// Incohérence (vérif dossiers) :
//  - cancel  : → « Identification » + note « ODR annulé, vérification manuelle nécessaire ».
//  - keep    : note override « ODR confirmé manuellement (Front ignoré) ».
// Doublon (anti-doublon) :
//  - accept  : → « ODR accepté » (doublon reconnu = ODR déjà envoyé/accepté).
//  - keepdup : note override « doublon ignoré » → envoi autorisé malgré tout.
const ACTIONS = ["cancel", "keep", "accept", "keepdup"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const action = body.action as Action;
  const ids: string[] = Array.isArray(body.pipelineIds) ? body.pipelineIds.filter((x: unknown) => typeof x === "string") : [];
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "action invalide" }, { status: 400 });
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
  } else if (action === "accept") {
    await prisma.$transaction(
      ids.flatMap((id) => [
        prisma.insurancePipeline.update({ where: { id }, data: { statut: "odr_accepte" } }),
        prisma.pipelineEvent.create({
          data: {
            pipelineId: id,
            type: "statut_change",
            ancienStatut: "odr_en_cours",
            nouveauStatut: "odr_accepte",
            description: "Doublon reconnu (ODR déjà envoyé/accepté) — passé en « ODR accepté »",
            createdBy: actor,
          },
        }),
      ]),
    );
  } else {
    // keep (incohérence) / keepdup (doublon) : simple note d'override
    const desc =
      action === "keep"
        ? "ODR confirmé manuellement (Front ignoré) — validé pour envoi"
        : "Doublon ignoré manuellement — envoi confirmé malgré tout";
    await prisma.$transaction(
      ids.map((id) =>
        prisma.pipelineEvent.create({ data: { pipelineId: id, type: "note_ajoutee", description: desc, createdBy: actor } }),
      ),
    );
  }

  return NextResponse.json({ success: true, count: ids.length, action });
}
