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

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { copro: { select: { buildingId: true, adresse: true } } },
  });

  const buildingId = pipeline?.copro?.buildingId;
  const adresse = pipeline?.copro?.adresse ?? null;
  if (!buildingId && !adresse) {
    return NextResponse.json({ error: "copro introuvable (building_id + adresse absents)" }, { status: 404 });
  }

  const result = await getDernierePrimePayeeFromFront(buildingId ?? "", pipelineId, adresse);
  return NextResponse.json({ success: true, ...result });
}
