import { NextRequest, NextResponse } from "next/server";
import { extractDevisFromPdfBase64 } from "@/lib/devis-extract";

// Extraction d'un contrat/devis MRI depuis un PDF uploadé (fiche dossier).
// Le prompt + le schéma vivent dans @/lib/devis-extract (partagé avec l'auto 6).
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier PDF fourni" }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return NextResponse.json({ error: "Le fichier doit être un PDF" }, { status: 400 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const extracted = await extractDevisFromPdfBase64(base64);
    if (!extracted) {
      return NextResponse.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: extracted });
  } catch (err) {
    console.error("[devis/extract] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 }
    );
  }
}
