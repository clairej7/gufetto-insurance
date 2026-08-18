import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { extractDevisFromPdfBase64 } from "@/lib/devis-extract";

// POST /api/devis6/compare { pipelineId }
// Automatisation 6 — génère la comparaison d'un dossier DEPUIS le tableau, en
// réutilisant exactement l'extracteur Claude des fiches (@/lib/devis-extract) sur
// les documents déjà stockés (contrat MRI + devis AXA/Mila captés depuis Front).
// Persiste contratActuelData + les DevisRecu → le détail s'affiche sur la fiche et
// le statut « Comparaison faite » + les prix devis remontent dans le tableau.
// Ne choisit PAS le devis recommandé (décidé à l'étape d'envoi au CS).

async function download(path: string): Promise<Buffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = (await req.json().catch(() => ({}))) as { pipelineId?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true, contratActuelData: true,
      documents: { orderBy: { createdAt: "desc" }, select: { kind: true, storagePath: true, fileName: true } },
      devisRecus: { select: { id: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  // Devis stockés (captés depuis Front) : le plus récent AXA + le plus récent Mila.
  const devisDocs = [
    p.documents.find((d) => d.kind === "devis_axa"),
    p.documents.find((d) => d.kind === "devis_mila"),
  ].filter((d): d is { kind: string; storagePath: string; fileName: string } => !!d);
  if (!devisDocs.length) {
    return NextResponse.json({ error: "Aucun devis stocké (AXA/Mila) pour ce dossier — lance la comparaison depuis la fiche (upload manuel des PDF)." }, { status: 422 });
  }

  // Contrat actuel : doc contrat_mri le plus récent, sinon on garde le contratActuelData existant.
  const contratDoc = p.documents.find((d) => d.kind === "contrat_mri");

  try {
    // 1) Contrat (extraction seulement si un doc est présent).
    let contratData: unknown = null;
    if (contratDoc) {
      const buf = await download(contratDoc.storagePath);
      if (buf) contratData = await extractDevisFromPdfBase64(buf.toString("base64"));
    }

    // 2) Devis (extraction de chaque PDF).
    const devisExtracted: { doc: { storagePath: string; fileName: string }; data: NonNullable<Awaited<ReturnType<typeof extractDevisFromPdfBase64>>> }[] = [];
    for (const doc of devisDocs) {
      const buf = await download(doc.storagePath);
      if (!buf) continue;
      const data = await extractDevisFromPdfBase64(buf.toString("base64"));
      if (data) devisExtracted.push({ doc, data });
    }
    if (!devisExtracted.length) {
      return NextResponse.json({ error: "Extraction Claude des devis impossible (PDF illisibles ou réponse invalide)." }, { status: 502 });
    }

    // 3) Persistance — même forme que la comparaison des fiches.
    if (contratData) {
      await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { contratActuelData: JSON.stringify(contratData) } });
    }
    // On remplace les DevisRecu existants (re-génération propre).
    if (p.devisRecus.length) await prisma.devisRecu.deleteMany({ where: { pipelineId } });
    for (const { doc, data } of devisExtracted) {
      await prisma.devisRecu.create({
        data: {
          pipelineId,
          assureur: data.assureur ?? "Devis",
          numeroContrat: data.numeroContrat ?? null,
          primeTTC: typeof data.primeTTC === "number" ? data.primeTTC : 0,
          data: JSON.stringify(data),
          pdfName: doc.fileName,
          pdfUrl: doc.storagePath,
        },
      });
    }
    await prisma.pipelineEvent.create({
      data: { pipelineId, type: "action_manuelle", description: `Comparaison des devis générée (auto 6) — ${devisExtracted.length} devis analysé(s)`, metadata: { auto: "devis6_compare", nbDevis: devisExtracted.length }, createdBy: session.user.email ?? "auto:devis6" },
    });

    return NextResponse.json({
      success: true,
      comparaisonFaite: true,
      devis: devisExtracted.map((d) => ({ assureur: d.data.assureur ?? "Devis", prime: typeof d.data.primeTTC === "number" ? d.data.primeTTC : null })),
    });
  } catch (err) {
    console.error("[devis6/compare] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur interne" }, { status: 500 });
  }
}
