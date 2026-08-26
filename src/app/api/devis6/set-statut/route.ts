import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/devis6/set-statut { pipelineId, statut: "attente"|"valide"|"refus" }
// Met à jour à la main le statut de la réponse gestionnaire (Auto 6). « valide »
// (= accepté par le gestionnaire) compte comme une transmission ET fait avancer
// le dossier en « Validation du CS » (auto 7).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, statut } = await req.json().catch(() => ({}));
  if (!pipelineId || !["attente", "valide", "refus"].includes(statut)) return NextResponse.json({ error: "params invalides" }, { status: 400 });
  const by = session.user.email ?? "admin";

  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { statut: true, events: { where: { metadata: { path: ["auto"], equals: "devis6_notify_gestionnaire" } }, take: 1, select: { id: true } } },
  });
  if (!p) return NextResponse.json({ error: "dossier introuvable" }, { status: 404 });

  // Transmission au gestionnaire (marqueur) — créé s'il n'existe pas encore.
  if (!p.events.length) {
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "Proposition transmise au gestionnaire (manuel)", metadata: { auto: "devis6_notify_gestionnaire", source: "manuel" }, createdBy: by } });
  }

  if (statut === "refus") {
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "Réponse gestionnaire : refus (manuel)", metadata: { auto: "devis6_gestio_response", reponse: "refus", source: "manuel" }, createdBy: by } });
  } else if (statut === "valide") {
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "Validé par le gestionnaire (manuel)", metadata: { auto: "devis6_gestio_response", reponse: "valide", source: "manuel" }, createdBy: by } });
    // Avance en Validation du CS (auto 7) si encore en Comparaison des devis.
    if (p.statut === "devis_recus") {
      await prisma.pipelineEvent.create({ data: { pipelineId, type: "statut_change", ancienStatut: "devis_recus", nouveauStatut: "envoye_cs", description: "Envoyé à l'automatisation 7 (validation CS)", metadata: { auto: "devis7_entered" }, createdBy: by } });
      await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { statut: "envoye_cs" } });
    }
  }
  // "attente" = juste la transmission (déjà posée ci-dessus).
  return NextResponse.json({ ok: true, advanced: statut === "valide" });
}
