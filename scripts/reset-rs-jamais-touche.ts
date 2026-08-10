// Repasse : remet à "identifie" les dossiers coincés en "rs_en_cours" par le
// seul import Omni, jamais touchés (ni travail humain, ni automatisation 1).
// Ainsi ils repasseront plus tard dans l'automatisation 1 (qui ne part que de
// "identifie"). Ne touche PAS à Front (statut uniquement) → n'alourdit pas le run.
//
// Un event d'audit statut_change (créé par un email) est posé : il VERROUILLE le
// dossier contre la synchro Omni nocturne (sinon Omni le repousserait en RS).
// Idempotent : ne sélectionne que les rs_en_cours → une fois remis en identifie,
// ils sortent du périmètre.
//
// Usage : npx tsx scripts/reset-rs-jamais-touche.ts            (dry-run)
//         npx tsx scripts/reset-rs-jamais-touche.ts --apply
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/* eslint-disable @typescript-eslint/no-explicit-any */
function isOmniSync(e: any) {
  return e.createdBy === "sync" || (e.type === "sync_auto" && /Statut mis à jour depuis Omni/i.test(e.description ?? ""));
}
function isAuto1(e: any) {
  const src = (e.metadata as any)?.source;
  if (src === "front_autofill" || src === "front+omni_autofill") return true;
  return /Aiguillé automatiquement|Autofill Front|Assureur corrigé|Probable Wakam/i.test(e.description ?? "");
}
// "Jamais touché" = aucun event qui soit du vrai travail humain ou de l'auto 1.
function jamaisTouche(events: any[]) {
  return !events.some((e) => !isOmniSync(e) && !isAuto1(e)) && !events.some(isAuto1);
}

const APPLY = process.argv.includes("--apply");
const DESC = "Remis en « Aucune action » — étape « RS en cours » issue de l'import Omni sans travail réel (repasse). Repassera par l'automatisation 1.";

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN (--apply pour écrire) ===");
  const pipes = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", copro: { archivedAt: null } },
    include: { events: true, copro: { select: { nom: true, buildingId: true } } },
  });
  const cibles = pipes.filter((p) => jamaisTouche(p.events));
  console.log(`rs_en_cours (non archivés) : ${pipes.length}  |  jamais touchés (à remettre) : ${cibles.length}\n`);

  let done = 0;
  for (const p of cibles) {
    if (APPLY) {
      await prisma.$transaction([
        prisma.insurancePipeline.update({ where: { id: p.id }, data: { statut: "identifie" } }),
        prisma.pipelineEvent.create({
          data: {
            pipelineId: p.id, type: "statut_change", ancienStatut: "rs_en_cours", nouveauStatut: "identifie",
            description: DESC, createdBy: "quentin.lepoutre@matera.eu",
            metadata: { source: "repasse-reset-rs" },
          },
        }),
      ]);
    }
    done++;
    if (done <= 15) console.log(`  ${APPLY ? "✓" : "→"} ${p.copro.nom} (${p.copro.buildingId})`);
  }
  if (cibles.length > 15) console.log(`  … +${cibles.length - 15} autres`);
  console.log(`\n${APPLY ? "Remis en 'identifie'" : "À remettre"} : ${cibles.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
