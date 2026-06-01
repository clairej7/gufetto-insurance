const OMNI_API_URL = process.env.OMNI_API_URL || "";
const OMNI_API_KEY = process.env.OMNI_API_KEY || "";
const OMNI_MODEL_ID = process.env.OMNI_MODEL_ID || "";

export type OmniCopro = {
  building_id: string;
  nom: string;
  adresse?: string;
  gestionnaire_email?: string;
  assureur_actuel?: string;
  courtier_actuel?: string;
  prime_actuelle?: number;
  date_echeance?: string; // ISO date string
  date_debut_contrat?: string;
  contact_cs_email?: string;
  contact_cs_nom?: string;
};

export async function fetchCoprosFromOmni(): Promise<OmniCopro[]> {
  if (!OMNI_API_URL || !OMNI_API_KEY) {
    throw new Error("Omni API non configurée (OMNI_API_URL, OMNI_API_KEY manquants)");
  }

  // Query: copros pro with echéance in the next 8 months, excluding those already on AXA
  const prompt =
    "Liste des copropriétés de l'offre pro avec une date d'échéance d'assurance dans les 8 prochains mois, avec les informations du contrat d'assurance actuel (assureur, courtier, prime, dates) et le contact du conseil syndical. Exclure les copros dont le contrat est déjà chez AXA car géré par ODR.";

  const response = await fetch(`${OMNI_API_URL}/api/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OMNI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      modelId: OMNI_MODEL_ID,
      prompt,
      format: "json",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Omni API error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // Adapt based on actual Omni API response shape
  // This is a placeholder — adjust field mapping once you know the exact response structure
  const rows: Record<string, unknown>[] = data.data || data.rows || data.results || [];

  return rows.map((row) => ({
    building_id: String(row["building_id"] || row["id"] || ""),
    nom: String(row["nom"] || row["name"] || row["building_name"] || ""),
    adresse: row["adresse"] ? String(row["adresse"]) : undefined,
    gestionnaire_email: row["gestionnaire_email"] ? String(row["gestionnaire_email"]) : undefined,
    assureur_actuel: row["assureur_actuel"] ? String(row["assureur_actuel"]) : undefined,
    courtier_actuel: row["courtier_actuel"] ? String(row["courtier_actuel"]) : undefined,
    prime_actuelle: row["prime_actuelle"] ? Number(row["prime_actuelle"]) : undefined,
    date_echeance: row["date_echeance"] ? String(row["date_echeance"]) : undefined,
    date_debut_contrat: row["date_debut_contrat"] ? String(row["date_debut_contrat"]) : undefined,
    contact_cs_email: row["contact_cs_email"] ? String(row["contact_cs_email"]) : undefined,
    contact_cs_nom: row["contact_cs_nom"] ? String(row["contact_cs_nom"]) : undefined,
  })).filter((c) => c.building_id && c.nom);
}
