import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const copros = await prisma.copro.findMany({
    where: { nom: { contains: 'Test' } },
    include: {
      pipelines: {
        include: {
          events: { orderBy: { createdAt: 'asc' } },
          tasks: true,
          devisRecus: true,
          taskCompletions: true,
        },
      },
    },
  });
  for (const c of copros) {
    console.log(`\n=== COPRO ${c.id} | ${c.buildingId} | ${c.nom} ===`);
    console.log(`  assureur=${c.assureurActuel} num=${c.numeroContrat} prime=${c.primeActuelle} echeance=${c.dateEcheance?.toISOString()}`);
    console.log(`  contratVerrouilleLe=${c.contratVerrouilleLe?.toISOString() ?? 'null'} contratActuel? source=${c.source}`);
    for (const p of c.pipelines) {
      console.log(`  -- PIPELINE ${p.id} statut=${p.statut} annee=${p.anneeEcheance} notes=${JSON.stringify(p.notes)}`);
      console.log(`       signedPdfUrl=${p.signedPdfUrl ?? 'null'} nouveauNum=${p.nouveauNumeroContrat ?? 'null'}`);
      console.log(`       events=${p.events.length} tasks=${p.tasks.length} devisRecus=${p.devisRecus.length} taskCompletions=${p.taskCompletions.length}`);
      for (const e of p.events) console.log(`         event ${e.createdAt.toISOString()} ${e.type} ${e.ancienStatut ?? ''}->${e.nouveauStatut ?? ''} "${e.description}" by ${e.createdBy}`);
      for (const t of p.tasks) console.log(`         task "${t.name}" status=${t.status} assignee=${t.assigneeEmail}`);
      for (const d of p.devisRecus) console.log(`         devis ${d.assureur} prime=${d.primeTTC} pdf=${d.pdfName}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
