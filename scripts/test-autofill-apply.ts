// Test RÉEL du niveau 2 (écriture + aiguillage) sur UN dossier, mais NON
// destructif : snapshot → écriture réelle en base → restauration exacte de
// l'état initial (aucun résidu). Écrit vraiment en prod le temps du test.
//
// Usage :
//   npx tsx scripts/test-autofill-apply.ts               # auto-pick un dossier "identifie", puis restaure
//   npx tsx scripts/test-autofill-apply.ts pipe=<id>     # sur un dossier précis
//   npx tsx scripts/test-autofill-apply.ts --keep        # conserve les modifs (ne restaure pas)
//
// Prérequis .env : DATABASE_URL + FRONT_API_TOKEN.

import "dotenv/config";
import { PrismaClient, type PipelineStatut } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractInsuranceInfoFromFront } from "../src/lib/front-insurance";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (!process.env.DATABASE_URL || !process.env.FRONT_API_TOKEN) {
    console.error("⚠️  DATABASE_URL et FRONT_API_TOKEN requis dans .env. Arrêt.");
    return;
  }
  const keep = process.argv.includes("--keep");
  const idArg = process.argv.find((a) => a.startsWith("pipe="))?.slice(5);
  const buildingArg = process.argv.find((a) => a.startsWith("building="))?.slice(9);

  let pipeline;
  if (idArg) {
    pipeline = await prisma.insurancePipeline.findUnique({ where: { id: idArg }, include: { copro: true } });
  } else if (buildingArg) {
    pipeline = await prisma.insurancePipeline.findFirst({ where: { copro: { buildingId: buildingArg } }, include: { copro: true } });
  } else {
    // Auto : parcourt les dossiers "identifie" à building_id RÉEL (numérique) et
    // s'arrête au 1er dont l'extraction Front est FIABLE (pour montrer une vraie
    // transition). Sinon prend le 1er numérique. Les essais non fiables n'écrivent
    // rien (data vide) donc ils ne modifient pas la base.
    const cands = (await prisma.insurancePipeline.findMany({
      where: { statut: "identifie", copro: { archivedAt: null } },
      include: { copro: true },
      take: 300,
      orderBy: { createdAt: "asc" },
    })).filter((p) => /^\d+$/.test(p.copro.buildingId));
    let tried = 0;
    for (const p of cands) {
      if (tried >= 12) break;
      tried++;
      const probe = await extractInsuranceInfoFromFront(p.copro.buildingId);
      if (probe.reliable) { pipeline = p; break; }
      if (!pipeline) pipeline = p; // fallback = 1er numérique
    }
    console.log(`(auto : ${tried} dossiers sondés)`);
  }
  if (!pipeline) { console.error("Aucun dossier 'identifie' avec building_id numérique trouvé."); return; }

  const copro = pipeline.copro;
  console.log(`\nDossier : ${copro.nom}`);
  console.log(`  building_id ${copro.buildingId} · pipeline ${pipeline.id} · statut ACTUEL "${pipeline.statut}"`);

  // --- snapshot avant ---
  const snap = {
    assureurActuel: copro.assureurActuel,
    numeroContrat: copro.numeroContrat,
    contactCourtierEmail: copro.contactCourtierEmail,
    contratVerrouilleLe: copro.contratVerrouilleLe,
    statut: pipeline.statut,
  };
  const eventsBefore = (
    await prisma.pipelineEvent.findMany({ where: { pipelineId: pipeline.id }, select: { id: true } })
  ).map((e) => e.id);

  // --- extraction Front (lecture seule) ---
  const info = await extractInsuranceInfoFromFront(copro.buildingId);
  console.log(`\n  Extraction Front :`);
  console.log(`    assureur   : ${info.assureur ?? "—"}`);
  console.log(`    n° contrat : ${info.numeroContrat ?? "—"}`);
  console.log(`    mail       : ${info.mailCourtier ?? "—"}`);
  console.log(`    fiable     : ${info.reliable} · partenaire : ${info.isPartner}`);

  const target: PipelineStatut = info.reliable ? (info.isPartner ? "odr_en_cours" : "rs_en_cours") : "identifie";

  try {
    // --- écriture RÉELLE ---
    const data: Record<string, unknown> = {};
    if (info.assureur) data.assureurActuel = info.assureur;
    if (info.numeroContrat) data.numeroContrat = info.numeroContrat;
    if (info.mailCourtier) data.contactCourtierEmail = info.mailCourtier;
    if (Object.keys(data).length) {
      data.contratVerrouilleLe = new Date();
      await prisma.copro.update({ where: { id: copro.id }, data });
    }
    if (pipeline.statut === "identifie" && target !== "identifie") {
      await prisma.insurancePipeline.update({ where: { id: pipeline.id }, data: { statut: target } });
      await prisma.pipelineEvent.create({
        data: {
          pipelineId: pipeline.id, type: "action_manuelle",
          ancienStatut: "identifie", nouveauStatut: target,
          description: "[TEST autofill] aiguillage via Front", createdBy: "test-autofill@gufetto",
        },
      });
    }
    const after = await prisma.insurancePipeline.findUnique({ where: { id: pipeline.id }, include: { copro: true } });
    console.log(`\n  ✍️  APRÈS écriture réelle :`);
    console.log(`    statut     : "${pipeline.statut}" → "${after?.statut}"  (cible : ${target})`);
    console.log(`    assureur   : ${after?.copro.assureurActuel ?? "—"}`);
    console.log(`    n° contrat : ${after?.copro.numeroContrat ?? "—"}`);
    console.log(`    mail       : ${after?.copro.contactCourtierEmail ?? "—"}`);
  } finally {
    if (!keep) {
      await prisma.copro.update({
        where: { id: copro.id },
        data: {
          assureurActuel: snap.assureurActuel,
          numeroContrat: snap.numeroContrat,
          contactCourtierEmail: snap.contactCourtierEmail,
          contratVerrouilleLe: snap.contratVerrouilleLe,
        },
      });
      await prisma.insurancePipeline.update({ where: { id: pipeline.id }, data: { statut: snap.statut } });
      await prisma.pipelineEvent.deleteMany({ where: { pipelineId: pipeline.id, id: { notIn: eventsBefore } } });
      console.log(`\n  ↩️  État initial RESTAURÉ (aucun résidu en base).`);
    } else {
      console.log(`\n  ⚠️  --keep : modifications CONSERVÉES en base.`);
    }
  }
}

main().finally(() => prisma.$disconnect());
