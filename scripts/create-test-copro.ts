import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Créer une copro de test
  const copro = await prisma.copro.create({
    data: {
      buildingId: 'test-copro-' + Date.now(),
      nom: 'Immeuble Test - Claire',
      adresse: '123 Rue de Test, 75000 Paris',
      gestionnaireEmail: 'claire.jaquemet@matera.eu',

      // Contrat actuel
      assureurActuel: 'Allianz',
      numeroContrat: 'TEST-2024-001',
      primeActuelle: 5000,
      dateEcheance: new Date('2025-12-31'),

      // Caractéristiques
      surfaceDeveloppee: 10000,
      periodeConstruction: '1970_1985',
      natureOccupation: 'habitation',
      proportionInoccupee: 'moins_25',
      protectionJuridique: 'oui',
    },
  });

  console.log('✅ Copro créée:', copro);

  // Créer un pipeline pour cette copro
  const pipeline = await prisma.insurancePipeline.create({
    data: {
      coproId: copro.id,
      statut: 'identifie',
      anneeEcheance: 2025,
      notes: 'Copro de test pour validation',
    },
  });

  console.log('✅ Pipeline créé:', pipeline);

  // Créer un événement initial
  const event = await prisma.pipelineEvent.create({
    data: {
      pipelineId: pipeline.id,
      type: 'action_manuelle',
      description: 'Création de la copro de test',
      createdBy: 'claude@test',
    },
  });

  console.log('✅ Événement créé:', event);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
