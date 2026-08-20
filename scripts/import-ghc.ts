// Importeur GHC — internalise l'excel « Cleaning contrats assurance » dans GhcContract.
//
// ⚠️ PIÈGE DE COLONNE (bug v2, 2026-08-14) : l'assureur DOIT venir de la colonne
// « Nom fournisseur » (données GHC NETTOYÉES), et surtout PAS de « Nom fournisseur
// produit » (colonne BRUTE Omni). Les confondre avait mis 186 faux « Matera » en
// assureur, masquant les vrais AXA/Generali/SADA → ODR ratés. Corrigé en v3 (2026-08-20).
//
// Mapping des colonnes (matcher les EN-TÊTES par nom EXACT) :
//   buildingId    ← « Building ID »
//   buildingName  ← « Building Name »
//   assureur      ← « Nom fournisseur »        (PAS « Nom fournisseur produit »)
//   courtier      ← « Nom courtier »
//   numeroContrat ← « N° contrat »
//   montant       ← « Montant »
//   echeance      ← « Date d'échéance 2 »       (le bloc nettoyé, pas « Date d'échéance »)
//   aVerifier     ← « A vérifier »
//
// L'xlsx n'étant pas lisible en Node, on le parse d'abord en JSON via openpyxl en
// matchant les en-têtes par nom exact, puis :
//   npx tsx scripts/import-ghc.ts <chemin-du-json> <label>   (ex. label = "v4")
import "dotenv/config";
import fs from "fs";
import { prisma } from "../src/lib/prisma";

type GhcJsonRow = {
  buildingId: string | number;
  buildingName?: string | null;
  assureur?: string | null;
  courtier?: string | null;
  numeroContrat?: string | null;
  montant?: number | null;
  echeance?: string | null;
  aVerifier?: boolean;
};

// Valeurs poubelle repérées dans la colonne assureur GHC → jamais écrites (null).
const GARBAGE_ASSUREUR = /\bsuez\b|eau\s*france|ne\s*plus\s*utiliser/i;
const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return !s || s === "-" ? null : s;
};
const cleanAssureur = (v: string | null | undefined): string | null => {
  const s = clean(v);
  return s && GARBAGE_ASSUREUR.test(s) ? null : s;
};

async function main(): Promise<void> {
  const [jsonPath, label] = process.argv.slice(2);
  if (!jsonPath || !label) {
    console.error("usage: npx tsx scripts/import-ghc.ts <chemin-json> <label>");
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as GhcJsonRow[];
  const seen = new Set<string>();
  const data = rows
    .filter((r) => {
      const id = r.buildingId != null ? String(r.buildingId) : "";
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((r) => ({
      buildingId: String(r.buildingId),
      buildingName: clean(r.buildingName),
      assureur: cleanAssureur(r.assureur),
      courtier: clean(r.courtier),
      numeroContrat: clean(r.numeroContrat),
      montant: typeof r.montant === "number" ? r.montant : null,
      echeance: r.echeance ? new Date(r.echeance) : null,
      aVerifier: !!r.aVerifier,
    }));
  await prisma.$transaction([
    prisma.ghcContract.deleteMany({}),
    prisma.ghcContract.createMany({ data }),
    prisma.ghcImportRun.create({ data: { label, fileName: jsonPath.split("/").pop() ?? "ghc.json", createdBy: "import-script" } }),
  ]);
  console.log(`GhcContract remplacé : ${data.length} lignes (label ${label}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)); });
