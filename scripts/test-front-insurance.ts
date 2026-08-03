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
  const t = { total: 0, reliable: 0, odr: 0, rs: 0, none: 0, assureur: 0, mail: 0, numero: 0, errors: 0 };
  for (const id of ids) {
    try {
      const info = await extractInsuranceInfoFromFront(id);
      const dest = info.reliable ? (info.isPartner ? "→ ODR" : "→ RS en cours") : "→ reste Aucune action";
      t.total++;
      if (info.assureur) t.assureur++;
      if (info.mailCourtier) t.mail++;
      if (info.numeroContrat) t.numero++;
      if (info.reliable) { t.reliable++; info.isPartner ? t.odr++ : t.rs++; } else t.none++;
      console.log(`\n=== building ${id} ===`);
      console.log(`  assureur   : ${info.assureur ?? "—"}`);
      console.log(`  n° contrat : ${info.numeroContrat ?? "—"} (${info.numeroSource ?? "—"})`);
      console.log(`  mail       : ${info.mailCourtier ?? "—"}`);
      console.log(`  fiable     : ${info.reliable} (${info.confidence})  ${dest}`);
    } catch (e) {
      t.errors++;
      console.error(`  building ${id} : ERREUR`, e instanceof Error ? e.message : e);
    }
  }
  const pct = (n: number) => t.total ? Math.round((100 * n) / t.total) : 0;
  console.log(`\n======== RÉCAP (${t.total} dossiers, ${t.errors} erreurs) ========`);
  console.log(`  Fiables (→ aiguillés) : ${t.reliable}/${t.total} = ${pct(t.reliable)}%`);
  console.log(`    dont → ODR : ${t.odr}   → RS en cours : ${t.rs}   → Aucune action : ${t.none}`);
  console.log(`  Couverture par champ : assureur ${t.assureur}/${t.total} (${pct(t.assureur)}%) · mail ${t.mail}/${t.total} (${pct(t.mail)}%) · n° ${t.numero}/${t.total} (${pct(t.numero)}%)`);
}

main();
