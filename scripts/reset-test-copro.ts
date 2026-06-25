import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const COPRO_ID = 'cmq98bnwr00000xwyp4mnxamv'; // Immeuble Test - Claire (test-copro-1781166127488)

async function main() {
  const copro = await prisma.copro.findUnique({
    where: { id: COPRO_ID },
    include: { pipelines: true },
  });
  if (!copro) throw new Error('Copro test introuvable');
  console.log(`Reset de "${copro.nom}" (${copro.buildingId}) — ${copro.pipelines.length} pipeline(s)`);

  for (const p of copro.pipelines) {
    const [ev, tc, dr, tk] = await prisma.$transaction([
      prisma.pipelineEvent.deleteMany({ where: { pipelineId: p.id } }),
      prisma.taskCompletion.deleteMany({ where: { pipelineId: p.id } }),
      prisma.devisRecu.deleteMany({ where: { pipelineId: p.id } }),
      prisma.task.deleteMany({ where: { pipelineId: p.id } }),
    ]);
    await prisma.insurancePipeline.update({
      where: { id: p.id },
      data: {
        statut: 'identifie',
        signedPdfUrl: null,
        contratActuelData: null,
        nouveauNumeroContrat: null,
        nouveauDateEffet: null,
        nouveauPrimeTTC: null,
      },
    });
    console.log(`  pipeline ${p.id}: -${ev.count} events, -${tk.count} tasks, -${dr.count} devis, -${tc.count} taskCompletions → statut=identifie`);
  }

  // Verrou contrat côté copro (laisse les champs contrat seed intacts)
  await prisma.copro.update({ where: { id: COPRO_ID }, data: { contratVerrouilleLe: null } });
  console.log('  copro: contratVerrouilleLe=null (champs contrat seed conservés)');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
