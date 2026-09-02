import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/devis7/cs-verdict { pipelineId, verdict: "accord"|"refus" } (admin)
// Volet 2 « Suivi des réponses du CS » : le gestionnaire qualifie la réponse du CS.
//   - « accord » → statut CS accepté + dossier passe en SIGNÉ (contrat_signe)
//   - « refus »  → statut CS refus   + dossier passe en PERDU (refuse)
// Écrit l'event devis7_cs_statut (→ sort le dossier du Volet 2 « en attente » et
// alimente l'historique + le recap). « Traiter à la main » = pas d'appel (no-op UI).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId, verdict } = (await req.json().catch(() => ({}))) as { pipelineId?: string; verdict?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  if (verdict !== "accord" && verdict !== "refus") return NextResponse.json({ error: "verdict invalide" }, { status: 400 });

  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { id: true, statut: true } });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  const by = session.user.email ?? "admin";

  const csValue = verdict === "accord" ? "accepte" : "refus";
  const target = verdict === "accord" ? "contrat_signe" : "refuse";

  // Statut CS (marqueur qui sort le dossier du Volet 2 + historique + recap).
  await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Statut CS : ${verdict === "accord" ? "accepté" : "refus"}`, metadata: { auto: "devis7_cs_statut", value: csValue }, createdBy: by } });

  // Transition d'étape.
  if (p.statut !== target) {
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "statut_change", ancienStatut: p.statut, nouveauStatut: target, description: verdict === "accord" ? "CS accord → dossier signé" : "CS refus → dossier perdu", metadata: { auto: "devis7_transition" }, createdBy: by } });
    await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { statut: target as "contrat_signe" | "refuse" } });
  }

  return NextResponse.json({ success: true, verdict, statutPipeline: target });
}
