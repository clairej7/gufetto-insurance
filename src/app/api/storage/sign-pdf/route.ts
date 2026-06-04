import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import fs from "fs";
import path from "path";

async function findSouscripteurPosition(
  pdfBytes: ArrayBuffer
): Promise<{ pageIndex: number; x: number; y: number } | null> {
  try {
    // Import dynamique pour éviter les problèmes de worker côté serveur
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), useWorkerFetch: false, isEvalSupported: false }).promise;

    const searchTerms = ["le souscripteur", "pour le souscripteur", "souscripteur"];

    // On cherche en partant de la dernière page (page de signature)
    for (let pageNum = doc.numPages; pageNum >= 1; pageNum--) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();

      for (const term of searchTerms) {
        for (const item of textContent.items) {
          if ("str" in item && item.str.toLowerCase().includes(term)) {
            // transform[4] = x, transform[5] = y (coords PDF, origine bas-gauche)
            return {
              pageIndex: pageNum - 1,
              x: item.transform[4],
              y: item.transform[5], // Y baseline du texte
            };
          }
        }
      }
    }
  } catch (e) {
    console.error("[sign-pdf] pdfjs error:", e);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { pdfPath, pipelineId } = await req.json() as { pdfPath: string; pipelineId: string };

  if (!pdfPath || !pipelineId) {
    return NextResponse.json({ error: "pdfPath et pipelineId requis" }, { status: 400 });
  }

  // Télécharger le PDF depuis Supabase
  const { data: pdfData, error: downloadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(pdfPath);

  if (downloadError || !pdfData) {
    return NextResponse.json({ error: `Téléchargement PDF échoué: ${downloadError?.message}` }, { status: 500 });
  }

  const pdfBytes = await pdfData.arrayBuffer();

  // Chercher la position "Le souscripteur" dans le PDF
  const souscripteurPos = await findSouscripteurPosition(pdfBytes);

  // Charger le tampon Matera
  const stampPath = path.join(process.cwd(), "public", "tampon_matera.jpg");
  const stampBytes = fs.readFileSync(stampPath);

  // Modifier le PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const stampImage = await pdfDoc.embedJpg(stampBytes);
  const pages = pdfDoc.getPages();

  const stampWidth = 160;
  const stampHeight = (stampImage.height / stampImage.width) * stampWidth;
  const margin = 50;

  let targetPage = pages[pages.length - 1];
  let x = margin;
  let y = margin + 20;

  if (souscripteurPos) {
    targetPage = pages[souscripteurPos.pageIndex] ?? targetPage;
    x = souscripteurPos.x;
    y = souscripteurPos.y - stampHeight - 10; // 10pt sous la baseline du texte
  }

  targetPage.drawImage(stampImage, { x, y, width: stampWidth, height: stampHeight });

  // Sauvegarder le PDF signé
  const signedPdfBytes = await pdfDoc.save();
  const signedPath = `devis/${pipelineId}/signed-${Date.now()}.pdf`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(signedPath, signedPdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Upload PDF signé échoué: ${uploadError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, signedPath });
}
