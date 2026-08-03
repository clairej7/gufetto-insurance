// Test isolé de l'extraction Front (automatisation 1) — SANS base de données ni
// auth. Ne dépend que de FRONT_API_TOKEN (+ ANTHROPIC_API_KEY pour le secours PDF).
//
// Usage :
//   npx tsx scripts/test-front-insurance.ts 53735 101960 114750
// (sans argument : quelques building_id de test connus)
//
// Affiche, par copro, les 3 infos extraites + la fiabilité + l'aiguillage prévu.

import "dotenv/config";
import { extractInsuranceInfoFromFront } from "../src/lib/front-insurance";

const DEFAULTS = ["53735", "101960", "114750", "92095", "116240"];

async function main() {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;
  if (!process.env.FRONT_API_TOKEN) {
    console.error("⚠️  FRONT_API_TOKEN manquant (mets-le dans .env). Arrêt.");
    process.exit(1);
  }
  for (const id of ids) {
    try {
      const info = await extractInsuranceInfoFromFront(id);
      const dest = info.reliable ? (info.isPartner ? "→ ODR" : "→ RS en cours") : "→ reste Aucune action";
      console.log(`\n=== building ${id} ===`);
      console.log(`  assureur   : ${info.assureur ?? "—"}`);
      console.log(`  n° contrat : ${info.numeroContrat ?? "—"} (${info.numeroSource ?? "—"})`);
      console.log(`  mail       : ${info.mailCourtier ?? "—"}`);
      console.log(`  fiable     : ${info.reliable} (${info.confidence})  ${dest}`);
      console.log(`  détails    : ${info.reasons.join(" · ")}  [${info.sampledConversations} fils vus]`);
    } catch (e) {
      console.error(`  building ${id} : ERREUR`, e instanceof Error ? e.message : e);
    }
  }
}

main();
