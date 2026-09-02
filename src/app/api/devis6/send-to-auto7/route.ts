import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { devisEstValide } from "@/lib/devis6";

// POST /api/devis6/send-to-auto7 (admin)
// Envoie vers l'automatisation 7 tous les dossiers de l'auto 6 (devis_recus) dont
// le gestionnaire a VALIDÉ la proposition : passage à l'étape validation_cs +
// marqueur devis7_entered → ils quittent l'auto 6 et apparaissent dans l'auto 7.
const autoOf = (m: unknown): string | undefined => (m as { auto?: string } | null)?.auto;

export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const by = session.user.email ?? "admin";
  const excl = await getExcludedCoproIds();

  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: "devis_recus", coproId: { notIn: excl }, copro: { archivedAt: null },
      events: { some: { metadata: { path: ["auto"], equals: "devis6_gestio_response" } } },
    },
    select: {
      id: true,
      contratActuelData: true,
      documents: { where: { kind: "contrat_mri" }, select: { id: true }, take: 1 },
      devisRecus: { select: { data: true } },
      events: { where: { metadata: { path: ["auto"], equals: "devis6_gestio_response" } }, orderBy: { createdAt: "desc" }, take: 1, select: { metadata: true } },
    },
  });
  // Ne garder que ceux dont la DERNIÈRE réponse gestionnaire est « valide ».
  const valides = ps.filter((p) => (p.events[0]?.metadata as { reponse?: string } | undefined)?.reponse === "valide");
  // Garde-fous : contrat rattaché ET au moins un devis d'assurance valide.
  const prets = valides.filter((p) =>
    (p.documents.length > 0 || !!(p.contratActuelData && p.contratActuelData.trim())) &&
    p.devisRecus.some((d) => devisEstValide(d.data)),
  );
  const bloques = valides.length - prets.length;

  let moved = 0;
  for (const p of prets) {
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "statut_change", ancienStatut: "devis_recus", nouveauStatut: "envoye_cs", description: "Envoyé à l'automatisation 7 (validation CS)", metadata: { auto: "devis7_entered" }, createdBy: by } });
    await prisma.insurancePipeline.update({ where: { id: p.id }, data: { statut: "envoye_cs" } });
    moved++;
  }
  return NextResponse.json({ success: true, moved, bloques });
}
