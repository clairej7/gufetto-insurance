import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrimeFromFrontDocs } from "@/lib/front-insurance";

// POST /api/prime/verify  { pipelineId }
// Automatisation 8 « clean prime » — cherche la prime d'un dossier SANS prime dans
// Front (avis d'échéance / relance impayé). Écrit la prime si trouvée (+ marqueur
// « à vérifier » si incertain). N'AGIT JAMAIS sur l'étape.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { pipelineId } = (await req.json().catch(() => ({}))) as { pipelineId?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { copro: { select: { id: true, buildingId: true, nom: true, adresse: true } } },
  });
  if (!pipeline?.copro) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  const { copro } = pipeline;

  const res = await getPrimeFromFrontDocs(copro.buildingId ?? "", [copro.adresse, copro.nom]);

  if (res.montant && res.confidence) {
    const aVerifier = res.confidence === "unsure";
    await prisma.copro.update({
      where: { id: copro.id },
      data: { primeActuelle: res.montant, primeAVerifier: aVerifier },
    });
    await prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "action_manuelle",
        description: `Prime récupérée automatiquement depuis Front (${res.source}) : ${res.montant} €${aVerifier ? " — à vérifier" : ""}`,
        createdBy: session.user.email,
      },
    });
    revalidatePath(`/pipeline/${pipelineId}`);
    return NextResponse.json({ success: true, found: true, montant: res.montant, confidence: res.confidence, source: res.source });
  }

  return NextResponse.json({ success: true, found: false, reason: res.source });
}
