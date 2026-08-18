import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `Extrait les informations clés de ce contrat/devis d'assurance multirisque immeuble (MRI).
Retourne UNIQUEMENT un objet JSON valide sans markdown ni backticks, avec exactement ces champs.
Si une information n'est pas trouvée dans le document, mets null pour les valeurs optionnelles.

{
  "assureur": "nom de l'assureur (string)",
  "numeroContrat": "numéro de contrat ou devis (string ou null)",
  "primeTTC": "prime annuelle TTC en euros (number, OBLIGATOIRE)",
  "primeHT": "prime hors taxes en euros (number ou null)",
  "taxes": "montant des taxes en euros (number ou null)",
  "fraisCourtage": "frais de courtage en euros (number ou null)",
  "franchiseIncendie": "description de la franchise incendie (string ou null)",
  "franchiseDDE": "description de la franchise dégâts des eaux (string ou null)",
  "franchiseVol": "description de la franchise vol (string ou null)",
  "franchiseClimatique": "description de la franchise événements climatiques (string ou null)",
  "lci": "limitation contractuelle d'indemnité (string ou null)",
  "rcPlafond": "plafond de responsabilité civile (string ou null)",
  "garanties": {
    "incendie": "couverture incendie incluse (boolean)",
    "dommagesElectriques": "dommages électriques inclus (boolean)",
    "evenementsClimatiques": "événements climatiques inclus (boolean)",
    "catastrophesNaturelles": "catastrophes naturelles incluses (boolean)",
    "catastrophesTechnologiques": "catastrophes technologiques incluses (boolean)",
    "degatsDesEaux": "dégâts des eaux inclus (boolean)",
    "vol": "vol inclus (boolean)",
    "brisDeGlace": "bris de glace inclus (boolean)",
    "rc": "responsabilité civile incluse (boolean)",
    "defenseRecours": "défense et recours inclus (boolean)",
    "vandalisme": "vandalisme inclus (boolean)",
    "effondrement": "effondrement inclus (boolean)",
    "brisDeMachines": "bris de machines inclus (boolean)",
    "autresEvenements": "autres événements inclus (boolean)",
    "protectionJuridique": "protection juridique incluse (boolean)",
    "protectionCS": "protection conseil syndical incluse (boolean)",
    "honoSyndic": "honoraires syndic inclus (boolean)"
  },
  "pointsForts": ["liste de points forts courts (max 4 items)"],
  "pointsFaibles": ["liste de points faibles courts (max 4 items)"]
}`;

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

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    let extracted: Record<string, unknown>;
    try {
      // Strip any accidental markdown fences
      const raw = content.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
      extracted = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Impossible de parser la réponse JSON de Claude", raw: content.text },
        { status: 500 }
      );
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
