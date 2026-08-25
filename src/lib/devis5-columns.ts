// Constantes du tableau Excel devis (Auto 5, Volet 2) — CLIENT-SAFE.
// Aucun import serveur (ni prisma, ni exceljs, ni Anthropic) : ce module est
// importé à la fois par la lib serveur (devis5-excel.ts) et par le composant
// client (tableau éditable), donc il ne doit contenir QUE des données/types.

// Listes autorisées (= options des formulaires de demande de devis).
export const PERIODES = ["avant_1950", "1950_1970", "1970_1985", "1985_2000", "apres_2000", "inconnue"];
export const NATURES = ["habitation", "mixte", "professionnelle"];
export const PROPORTIONS = ["moins_25", "25_50", "50_75", "plus_75"];
export const ACTIVITES = ["Restaurant", "Boulangerie / Pâtisserie", "Discothèque / Bar de nuit / Bar avec piste de danse", "Pizzeria avec four à bois", "Kebab", "Travail du bois", "Activités industrielles & agricoles", "Activités de transformation de produits", "Activités de recherche et développement", "Station essence", "Ambassade ou Consulat", "Aucune"];
export const CARACTERISTIQUES = ["Présence d'amiante", "Ossature / façade / parement en bois (> 10%)", "Arrêté de péril en cours", "Monument historique", "Logements sociaux ou HLM", "Immeuble squatté", "Immeuble en cours de construction ou démolition", "Aucune"];

export type CellColor = "green" | "orange" | "red";
export type Cell = { value: string | null; color: CellColor };
export type ColKey =
  | "adresse" | "prime" | "assureur" | "surface" | "periode"
  | "nature" | "activites" | "caracteristiques" | "proportion" | "pj";
export type ExcelRow = { pipelineId: string; nom: string; cells: Record<ColKey, Cell> };

export type ColType = "text" | "number" | "select" | "multi";
export type ColDef = { key: ColKey; letter: string; label: string; type: ColType; options?: readonly string[] };

// Colonnes A→K (A = nom, géré à part). Ordre = ordre de l'Excel AXA.
export const COLUMNS: ColDef[] = [
  { key: "adresse", letter: "B", label: "Adresse", type: "text" },
  { key: "prime", letter: "C", label: "Dernière prime payée (€)", type: "number" },
  { key: "assureur", letter: "D", label: "Assureur actuel", type: "text" },
  { key: "surface", letter: "E", label: "Surface développée (m²)", type: "text" },
  { key: "periode", letter: "F", label: "Période de construction", type: "select", options: PERIODES },
  { key: "nature", letter: "G", label: "Nature de l'occupation", type: "select", options: NATURES },
  { key: "activites", letter: "H", label: "Activité aggravante", type: "multi", options: ACTIVITES },
  { key: "caracteristiques", letter: "I", label: "Caractéristiques particulières", type: "multi", options: CARACTERISTIQUES },
  { key: "proportion", letter: "J", label: "Proportion de logements inoccupés", type: "select", options: PROPORTIONS },
  { key: "pj", letter: "K", label: "Besoin d'un contrat de protection juridique", type: "select", options: ["oui", "non"] },
];

// Libellés « humains » (les clés enum sont techniques).
export const LABELS: Record<string, string> = {
  avant_1950: "Avant 1950", "1950_1970": "1950-1970", "1970_1985": "1970-1985",
  "1985_2000": "1985-2000", apres_2000: "Après 2000", inconnue: "Inconnue",
  habitation: "Habitation", mixte: "Mixte", professionnelle: "Professionnelle",
  moins_25: "Moins de 25%", "25_50": "Entre 25% et 50%", "50_75": "Entre 50% et 75%", plus_75: "Plus de 75%",
  oui: "Oui", non: "Non",
};

export const displayValue = (key: ColKey, raw: string | null): string => {
  if (raw == null || raw === "") return "";
  if (key === "activites" || key === "caracteristiques") {
    try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.join(", "); } catch { /* brut */ }
    return raw;
  }
  return LABELS[raw] ?? raw;
};
