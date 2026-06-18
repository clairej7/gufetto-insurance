import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function findSignatureZone(
  pdfBase64: string,
  totalPages: number
): Promise<{ pageIndex: number; yPercent: number } | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 128,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          {
            type: "text",
            text: `Ce document est un contrat d'assurance. Trouve la zone de signature "Pour le souscripteur" ou "Le souscripteur" (là où le client doit signer, côté gauche).

Retourne UNIQUEMENT ce JSON (sans markdown) :
{"page": <numéro de page 1-indexé>, "yPercent": <position Y en % depuis le HAUT de la page où commence la zone de signature, entre 0 et 100>}

Nombre total de pages : ${totalPages}. La signature est généralement sur la dernière page.`,
          },
        ],
      }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text
      .trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    const result = JSON.parse(raw) as { page: number; yPercent: number };
    return { pageIndex: result.page - 1, yPercent: result.yPercent };
  } catch (e) {
    console.error("[sign-pdf] Claude position detection failed:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { pdfPath, pipelineId } = await req.json() as { pdfPath: string; pipelineId: string };

  if (!pdfPath || !pipelineId) {
    return NextResponse.json({ error: "pdfPath et pipelineId requis" }, { status: 400 });
  }

  const { data: pdfData, error: downloadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(pdfPath);

  if (downloadError || !pdfData) {
    return NextResponse.json({ error: `Téléchargement PDF échoué: ${downloadError?.message}` }, { status: 500 });
  }

  const pdfBytes = await pdfData.arrayBuffer();
  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const signatureZone = await findSignatureZone(pdfBase64, pages.length);
  console.log("[sign-pdf] signature zone:", signatureZone);

  const stampPath = path.join(process.cwd(), "public", "tampon_matera.jpg");
  const stampBytes = fs.readFileSync(stampPath);
  const stampImage = await pdfDoc.embedJpg(stampBytes);

  const stampWidth = 160;
  const stampHeight = (stampImage.height / stampImage.width) * stampWidth;
  const margin = 50;

  let targetPage = pages[pages.length - 1];
  let x = margin;
  let y = margin + 20;

  if (signatureZone) {
    const page = pages[signatureZone.pageIndex] ?? pages[pages.length - 1];
    targetPage = page;
    const { height: pageHeight } = page.getSize();
    // yPercent est depuis le haut → convertir en coords pdf-lib (origine bas-gauche)
    const yFromTop = (signatureZone.yPercent / 100) * pageHeight;
    const yFromBottom = pageHeight - yFromTop;
    // Placer le tampon juste sous l'ancre, clampé dans la page
    y = Math.max(margin, Math.min(yFromBottom - stampHeight - 10, pageHeight - stampHeight - margin));
    x = margin;
  }

  targetPage.drawImage(stampImage, { x, y, width: stampWidth, height: stampHeight });

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
