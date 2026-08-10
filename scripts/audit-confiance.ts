// AUDIT LECTURE SEULE : échantillon réparti sur les étapes, recoupé avec Front.
// N'écrit RIEN sur Gufetto.
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { extractInsuranceInfoFromFront, matchPartner, looksLikeCourtierValue } from "../src/lib/front-insurance";

const PER_STATUT: Record<string, number> = {
  identifie: 8, rs_en_cours: 8, odr_en_cours: 8, devis_demandes: 6,
  devis_recus: 5, envoye_cs: 4, contrat_signe: 6, resiliation_envoyee: 5,
};
const norm = (s: string | null) => (s || "").toLowerCase();
const sameFamily = (a: string | null, b: string | null) => {
  const x = norm(a), y = norm(b); if (!x || !y) return true;
  const w = x.split(/[\s,]/)[0]; return y.includes(w) || x.includes(y.split(/[\s,]/)[0]);
};

function verdict(statut: string, ass: string | null, num: string | null, mail: string | null, info: any): [string, string] {
  const fCar = info.assureur, fRel = info.reliable, fPart = info.isPartner;
  const dPart = matchPartner(ass), courtierInAss = looksLikeCourtierValue(ass);
  if (statut === "odr_en_cours") {
    if (courtierInAss) return ["⚠️ à vérifier", `assureur "${ass}" = courtier`];
    if (fPart || dPart) return ["✅ cohérent", `partenaire confirmé (${fCar || ass})`];
    if (fCar && !fPart) return ["⚠️ à vérifier", `Front voit ${fCar} (non partenaire)`];
    return ["⚠️ à vérifier", "aucun partenaire corroboré"];
  }
  if (statut === "rs_en_cours") {
    if (dPart || fPart) return ["⚠️ à vérifier", "porteur partenaire → devrait être ODR"];
    if (fRel && !fPart) return ["✅ cohérent", "fiable non-partenaire"];
    if (num || mail || fRel) return ["✅ cohérent", "données présentes"];
    return ["⚠️ à vérifier", "peu de données"];
  }
  if (statut === "identifie") {
    if (fRel) return ["🟡 à traiter", "Front a des données (batch pas encore passé)"];
    return ["✅ cohérent", "neutre (rien d'exploitable)"];
  }
  if (fCar && ass && !sameFamily(fCar, ass)) return ["⚠️ à vérifier", `Front voit ${fCar} vs base "${ass}"`];
  return ["✅ cohérent", "hors périmètre batch, données cohérentes"];
}

async function main() {
  const sample: any[] = [];
  for (const [statut, n] of Object.entries(PER_STATUT)) {
    const rows = await prisma.insurancePipeline.findMany({
      where: { statut: statut as any, copro: { archivedAt: null } },
      select: { statut: true, copro: { select: { nom: true, buildingId: true, assureurActuel: true, numeroContrat: true, contactCourtierEmail: true } } },
    });
    for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    sample.push(...rows.slice(0, n));
  }
  const tally: Record<string, Record<string, number>> = {};
  console.log(`ÉCHANTILLON : ${sample.length} dossiers\n`);
  for (const p of sample) {
    let info: any;
    try { info = await extractInsuranceInfoFromFront(p.copro.buildingId); }
    catch { info = { assureur: null, reliable: false, isPartner: false }; }
    const [v, why] = verdict(p.statut, p.copro.assureurActuel, p.copro.numeroContrat, p.copro.contactCourtierEmail, info);
    tally[p.statut] ??= {}; tally[p.statut][v] = (tally[p.statut][v] || 0) + 1;
    console.log(`[${p.statut.padEnd(18)}] ${v}  ${p.copro.nom} (${p.copro.buildingId}) — base:"${p.copro.assureurActuel ?? "—"}" front:"${info.assureur ?? "—"}" | ${why}`);
  }
  console.log(`\n======= RÉCAP PAR ÉTAPE =======`);
  const glob: Record<string, number> = {};
  for (const [s, vs] of Object.entries(tally)) {
    console.log(`  ${s.padEnd(18)} ${Object.entries(vs).map(([k, n]) => `${k}:${n}`).join("  ")}`);
    for (const [k, n] of Object.entries(vs)) { const key = k.replace(/^\S+\s/, ""); glob[k] = (glob[k] || 0) + n; }
  }
  console.log(`\n======= GLOBAL =======`);
  const tot = sample.length;
  for (const [k, n] of Object.entries(glob).sort((a,b)=>b[1]-a[1])) console.log(`  ${k} : ${n}/${tot} (${Math.round(100*n/tot)}%)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
