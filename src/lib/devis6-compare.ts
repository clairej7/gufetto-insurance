// Cœur de l'Automatisation 6 « comparaison des devis » — extrait de la route
// /api/devis6/compare pour être réutilisable (route + import de devis en masse).
// Télécharge les docs stockés (contrat MRI + devis AXA/Mila), extrait via Claude
// (devis-extract), persiste contratActuelData + remplace les DevisRecu. Ne choisit
// PAS le devis recommandé (décidé à l'étape d'envoi au CS).

import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { extractDevisFromPdfBase64 } from "@/lib/devis-extract";

async function download(path: string): Promise<Buffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export type Devis6CompareResult =
  | { ok: true; devis: { assureur: string; prime: number | null }[] }
  | { ok: false; error: string; status: number };

export async function runDevis6Compare(pipelineId: string, actorEmail: string | null): Promise<Devis6CompareResult> {
  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true, contratActuelData: true,
      documents: { orderBy: { createdAt: "desc" }, select: { kind: true, storagePath: true, fileName: true } },
      devisRecus: { select: { id: true } },
    },
  });
  if (!p) return { ok: false, error: "Dossier introuvable", status: 404 };

  // Devis stockés : le plus récent AXA + le plus récent Mila.
  const devisDocs = [
    p.documents.find((d) => d.kind === "devis_axa"),
    p.documents.find((d) => d.kind === "devis_mila"),
  ].filter((d): d is { kind: string; storagePath: string; fileName: string } => !!d);
  if (!devisDocs.length) {
    return { ok: false, error: "Aucun devis stocké (AXA/Mila) pour ce dossier.", status: 422 };
  }
  const contratDoc = p.documents.find((d) => d.kind === "contrat_mri");

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
    return { ok: false, error: "Extraction Claude des devis impossible (PDF illisibles ou réponse invalide).", status: 502 };
  }

  // 3) Persistance — même forme que la comparaison des fiches.
  if (contratData) {
    await prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { contratActuelData: JSON.stringify(contratData) } });
  }
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
    data: { pipelineId, type: "action_manuelle", description: `Comparaison des devis générée (auto 6) — ${devisExtracted.length} devis analysé(s)`, metadata: { auto: "devis6_compare", nbDevis: devisExtracted.length }, createdBy: actorEmail ?? "auto:devis6" },
  });

  return { ok: true, devis: devisExtracted.map((d) => ({ assureur: d.data.assureur ?? "Devis", prime: typeof d.data.primeTTC === "number" ? d.data.primeTTC : null })) };
}
