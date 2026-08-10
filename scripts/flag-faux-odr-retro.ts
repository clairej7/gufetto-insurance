// Rétroactif : flague "Possible faux ODR, vérifier assureur" les dossiers DÉJÀ en
// odr_en_cours aiguillés par l'automatisation 1 sur un porteur partenaire, mais
// dont le champ assureur contient un AUTRE porteur réel (ni courtier, ni le même
// partenaire). Même logique que le flag temps-réel. AUCUN appel Front.
//
// Usage : npx tsx scripts/flag-faux-odr-retro.ts            (dry-run)
//         npx tsx scripts/flag-faux-odr-retro.ts --apply
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { matchPartner, looksLikeCourtierValue } from "../src/lib/front-insurance";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (--apply pour écrire) ===");
  const pipes = await prisma.insurancePipeline.findMany({
    where: { statut: "odr_en_cours" },
    include: {
      copro: { select: { nom: true, buildingId: true, assureurActuel: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  let flags = 0, dejaFlag = 0, sansEventAuto1 = 0, pasDeConflit = 0;
  for (const p of pipes) {
    const routing = p.events.find((e) => /Aiguillé automatiquement → ODR/i.test(e.description ?? ""));
    if (!routing) { sansEventAuto1++; continue; } // ODR non issu de l'auto 1 → hors périmètre
    const odrPartner = (routing.metadata as { partnerKey?: string } | null)?.partnerKey ?? null;
    const champ = p.copro.assureurActuel;
    const conflit = !!champ && !looksLikeCourtierValue(champ) && matchPartner(champ) !== odrPartner;
    if (!conflit) { pasDeConflit++; continue; }

    if (p.events.some((e) => e.type === "note_ajoutee" && /Possible faux ODR/i.test(e.description ?? ""))) { dejaFlag++; continue; }

    console.log(`  ⚑ ${p.copro.nom} (${p.copro.buildingId}) — champ « ${champ} » ≠ ODR « ${odrPartner ?? "?"} »`);
    flags++;
    if (APPLY) {
      await prisma.pipelineEvent.create({
        data: {
          pipelineId: p.id, type: "note_ajoutee",
          description: `Possible faux ODR, vérifier assureur (champ : « ${champ} » ≠ porteur ODR « ${odrPartner ?? "?"} »)`,
          createdBy: "quentin.lepoutre@matera.eu",
        },
      });
    }
  }
  console.log(`\n${APPLY ? "Flagués" : "À flaguer"} : ${flags} · déjà flagués : ${dejaFlag} · ODR hors auto 1 : ${sansEventAuto1} · sans conflit : ${pasDeConflit} · total ODR : ${pipes.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
