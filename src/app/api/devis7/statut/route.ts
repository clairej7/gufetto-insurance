import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/devis7/statut { pipelineId, field: "cs_statut"|"resiliation", value } (admin)
// Auto 7 : enregistre le statut CS (accepté/refus) ou la résiliation (oui/non/-),
// puis applique les transitions automatiques d'étape :
//   - CS refus                         → dossier « perdu » (refuse) + résiliation forcée « - »
//   - CS accepté + résiliation « oui » → dossier « clos » (termine)
//   - sinon                            → reste en validation_cs
// La ligne reste dans le tableau (filtré sur le marqueur devis7_entered).
const autoOf = (m: unknown): string | undefined => (m as { auto?: string } | null)?.auto;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, field, value } = (await req.json().catch(() => ({}))) as { pipelineId?: string; field?: string; value?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { id: true, statut: true, events: { where: { OR: [
      { metadata: { path: ["auto"], equals: "devis7_cs_statut" } },
      { metadata: { path: ["auto"], equals: "devis7_resiliation" } },
    ] }, orderBy: { createdAt: "desc" }, select: { metadata: true } } },
  });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  const by = session.user.email ?? "admin";
  const latest = (a: string) => (p.events.find((e) => autoOf(e.metadata) === a)?.metadata as { value?: string } | undefined)?.value;
  let csStatut = latest("devis7_cs_statut");
  let resiliation = latest("devis7_resiliation");

  if (field === "cs_statut") {
    if (value !== "accepte" && value !== "refus") return NextResponse.json({ error: "Statut CS invalide" }, { status: 400 });
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Statut CS : ${value === "accepte" ? "accepté" : "refus"}`, metadata: { auto: "devis7_cs_statut", value }, createdBy: by } });
    csStatut = value;
    if (value === "refus") { // résiliation forcée à «-»
      await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: "Résiliation : - (CS refus)", metadata: { auto: "devis7_resiliation", value: "-" }, createdBy: by } });
      resiliation = "-";
    }
  } else if (field === "resiliation") {
    if (value !== "oui" && value !== "non" && value !== "-") return NextResponse.json({ error: "Résiliation invalide" }, { status: 400 });
    if (csStatut === "refus") return NextResponse.json({ error: "Résiliation forcée à « - » quand le CS a refusé" }, { status: 409 });
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Résiliation envoyée : ${value}`, metadata: { auto: "devis7_resiliation", value }, createdBy: by } });
    resiliation = value;
  } else {
    return NextResponse.json({ error: "field invalide" }, { status: 400 });
  }

  // Transition d'étape automatique.
  const target = csStatut === "refus" ? "refuse" : csStatut === "accepte" && resiliation === "oui" ? "termine" : "envoye_cs";
  if (p.statut !== target) {
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "statut_change", ancienStatut: p.statut, nouveauStatut: target, description: target === "refuse" ? "CS refus → dossier perdu" : target === "termine" ? "CS accepté + résiliation envoyée → dossier clos" : "Retour en validation CS", metadata: { auto: "devis7_transition" }, createdBy: by } });
    await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { statut: target as "refuse" | "termine" | "envoye_cs" } });
  }

  return NextResponse.json({ success: true, csStatut: csStatut ?? null, resiliation: (csStatut === "refus" ? "-" : resiliation) ?? null, statutPipeline: target });
}
