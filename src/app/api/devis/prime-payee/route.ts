import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDernierePrimePayeeFromFront } from "@/lib/front-insurance";

// Récupère la "dernière prime payée" du dossier depuis le mail de demande de devis
// déjà envoyé à l'assureur (Front). L'UI n'envoie que le pipelineId ; on résout le
// building_id côté serveur.
export async function POST(req: NextRequest) {
  const { pipelineId } = (await req.json()) as { pipelineId?: string };
  if (!pipelineId) {
    return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  }

  // Priorité à une « dernière prime payée » IMPORTÉE (lot Excel envoyé à AXA) —
  // pour les dossiers sans mail Front de demande de devis. Le plus récent fait foi.
  const imported = await prisma.pipelineEvent.findFirst({
    where: { pipelineId, metadata: { path: ["auto"], equals: "prime_payee_import" } },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const impMontant = (imported?.metadata as { montant?: unknown } | null)?.montant;
  if (typeof impMontant === "number" && impMontant > 0) {
    return NextResponse.json({ success: true, montant: impMontant, source: "import" });
  }

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { copro: { select: { buildingId: true, adresse: true, nom: true } } },
  });

  const buildingId = pipeline?.copro?.buildingId;
  // copro.adresse est souvent null → on passe aussi le nom (qui contient l'adresse)
  // comme indice de recherche Front.
  const adresse = pipeline?.copro?.adresse ?? null;
  const nom = pipeline?.copro?.nom ?? null;
  if (!buildingId && !adresse && !nom) {
    return NextResponse.json({ error: "copro introuvable (building_id + adresse + nom absents)" }, { status: 404 });
  }

  const result = await getDernierePrimePayeeFromFront(buildingId ?? "", pipelineId, [adresse, nom]);
  return NextResponse.json({ success: true, ...result });
}
