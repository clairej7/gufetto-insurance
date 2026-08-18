// Extraction Claude d'un contrat/devis MRI → données structurées de comparaison.
// Brique PARTAGÉE : utilisée par la fiche dossier (/api/devis/extract) ET par
// l'automatisation 6 (comparaison en masse depuis le tableau). Un seul prompt,
// un seul schéma → la comparaison batch est identique à celle des fiches.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DevisExtracted = {
  assureur?: string;
  numeroContrat?: string | null;
  primeTTC?: number;
  primeHT?: number | null;
  taxes?: number | null;
  fraisCourtage?: number | null;
  franchiseIncendie?: string | null;
  franchiseDDE?: string | null;
  franchiseVol?: string | null;
  franchiseClimatique?: string | null;
  lci?: string | null;
  rcPlafond?: string | null;
  garanties?: Record<string, boolean>;
  pointsForts?: string[];
  pointsFaibles?: string[];
};

export const DEVIS_EXTRACTION_PROMPT = `Extrait les informations clés de ce contrat/devis d'assurance multirisque immeuble (MRI).
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

// Extrait depuis un PDF (base64, sans retour ligne). Renvoie null si l'IA ne
// répond pas exploitablement. sonnet-5 = raisonnement adaptatif par défaut → on
// cherche le bloc "text" (pas content[0], qui peut être un bloc thinking).
export async function extractDevisFromPdfBase64(base64: string): Promise<DevisExtracted | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: DEVIS_EXTRACTION_PROMPT },
      ],
    }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  try {
    const raw = textBlock.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(raw) as DevisExtracted;
  } catch {
    return null;
  }
}
