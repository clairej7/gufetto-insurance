// Nettoyage rétroactif : copros dont le champ ASSUREUR contient en réalité un
// COURTIER (pollution Omni). Pour chacune (dossiers ACTIFS uniquement), on
// re-extrait Front et on applique planContractWrite : le vrai porteur va en
// assureur, le courtier mal placé descend dans le champ courtier (si vide),
// + note d'audit. Idempotent (re-lançable) : saute ce qui n'est plus un courtier.
//
// Usage : npx tsx scripts/repair-courtier-in-assureur.ts            (dry-run)
//         npx tsx scripts/repair-courtier-in-assureur.ts --apply
//         npx tsx scripts/repair-courtier-in-assureur.ts sample=8   (limiter, dry-run)
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { looksLikeCourtierValue, extractInsuranceInfoFromFront } from "../src/lib/front-insurance";
import { planContractWrite } from "../src/lib/rs-autofill-core";

const APPLY = process.argv.includes("--apply");
const sample = Number(process.argv.find((a) => a.startsWith("sample="))?.slice(7)) || 0;

// Dossiers "actifs" (funnel prospection) — on exclut gagnés/clos/perdus où la
// donnée Front serait périmée et la correction non pertinente.
const ACTIVE = new Set(["identifie", "rs_en_cours", "odr_en_cours", "devis_demandes", "devis_recus", "envoye_cs", "validation_cs"]);

async function main() {
  console.log(APPLY ? "=== APPLY ===" : `=== DRY-RUN${sample ? ` (sample ${sample})` : ""} ===`);
  const all = await prisma.copro.findMany({
    where: { assureurActuel: { not: null } },
    include: { pipelines: { select: { id: true, statut: true } } },
  });
  const pollues = all.filter((c) => looksLikeCourtierValue(c.assureurActuel));
  const actifs = pollues.filter((c) => c.pipelines.some((p) => ACTIVE.has(p.statut)));
  const horsScope = pollues.length - actifs.length;
  console.log(`Courtier dans champ assureur : ${pollues.length}  |  actifs (à traiter) : ${actifs.length}  |  gagnés/clos ignorés : ${horsScope}\n`);

  const cible = sample ? actifs.slice(0, sample) : actifs;
  const stats = { corrige: 0, inchange: 0, sansPorteurFront: 0, erreurs: 0 };

  for (let i = 0; i < cible.length; i++) {
    const c = cible[i];
    const prefix = `  [${i + 1}/${cible.length}] ${c.nom} (${c.buildingId})`;
    try {
      const info = await extractInsuranceInfoFromFront(c.buildingId);
      const { data, auditNotes } = planContractWrite(c, info);
      const changeAssureur = typeof data.assureurActuel === "string";
      if (!changeAssureur) {
        // pas de porteur Front → on ne corrige pas l'assureur (on laisse tel quel)
        stats.sansPorteurFront++;
        console.log(`${prefix} · assureur "${c.assureurActuel}" → pas de porteur Front, laissé tel quel`);
        continue;
      }
      console.log(`${prefix} · "${c.assureurActuel}" → assureur="${data.assureurActuel}"${data.courtierActuel ? `, courtier="${data.courtierActuel}"` : ""}`);
      stats.corrige++;
      if (APPLY) {
        await prisma.copro.update({ where: { id: c.id }, data: { ...data, contratVerrouilleLe: new Date() } });
        for (const p of c.pipelines.filter((p) => ACTIVE.has(p.statut))) {
          for (const note of auditNotes) {
            const deja = await prisma.pipelineEvent.count({ where: { pipelineId: p.id, type: "note_ajoutee", description: { contains: "Assureur corrigé" } } });
            if (!deja) await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "note_ajoutee", description: note, createdBy: "quentin.lepoutre@matera.eu" } });
          }
        }
      }
    } catch (e) {
      stats.erreurs++;
      console.log(`${prefix} · ERREUR ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n${APPLY ? "Corrigés" : "À corriger"} : ${stats.corrige} · sans porteur Front : ${stats.sansPorteurFront} · erreurs : ${stats.erreurs}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
