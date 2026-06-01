import { PrismaClient, PipelineStatut } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TASK_TEMPLATES: {
  statut: PipelineStatut;
  label: string;
  description?: string;
  required: boolean;
  order: number;
}[] = [
  // 1. Identifié
  { statut: "identifie", label: "Vérifier les infos du contrat actuel (assureur, prime, dates)", required: true, order: 1 },
  { statut: "identifie", label: "Identifier l'adresse mail du courtier / assureur actuel", required: true, order: 2 },
  { statut: "identifie", label: "Vérifier que la copro est bien en offre pro (syndic professionnel)", required: true, order: 3 },

  // 2. RS en cours
  { statut: "rs_en_cours", label: "Récupérer le PV d'AG qui nomme Matera syndic de la copropriété", required: true, order: 1 },
  { statut: "rs_en_cours", label: "Récupérer le contrat d'assurance actuel", required: true, order: 2 },
  { statut: "rs_en_cours", label: "Envoyer mail de demande de relevé de sinistralité (RS) au courtier/assureur", description: "Mettre en copie le contrat actuel et le PV d'AG", required: true, order: 3 },
  { statut: "rs_en_cours", label: "Noter la date limite de relance (S+2)", required: false, order: 4 },

  // 3. RS reçu
  { statut: "rs_recu", label: "Vérifier que la PJ reçue est bien le relevé de sinistralité", required: true, order: 1 },
  { statut: "rs_recu", label: "Déposer le RS dans le dossier assurance sur Duomo", required: true, order: 2 },

  // 4. Devis demandés
  { statut: "devis_demandes", label: "Envoyer demande de devis à AXA", description: "Joindre le contrat actuel et le RS", required: true, order: 1 },
  { statut: "devis_demandes", label: "Envoyer demande de devis à Mila", description: "Joindre le contrat actuel et le RS", required: false, order: 2 },
  { statut: "devis_demandes", label: "Envoyer demande de devis à Sada (si applicable)", required: false, order: 3 },
  { statut: "devis_demandes", label: "Noter les délais de réponse attendus par assureur", required: false, order: 4 },

  // 5. Devis reçus
  { statut: "devis_recus", label: "Vérifier et valider les devis reçus", required: true, order: 1 },
  { statut: "devis_recus", label: "Déposer les devis dans le dossier assurance sur Duomo", required: true, order: 2 },
  { statut: "devis_recus", label: "Réaliser la comparaison avec le contrat actuel", required: true, order: 3 },

  // 6. Envoyé au CS
  { statut: "envoye_cs", label: "Récupérer l'adresse mail du Conseil Syndical (CS)", required: true, order: 1 },
  { statut: "envoye_cs", label: "Envoyer mail au CS avec comparaison des devis et recommandation", description: "Préciser que sans réponse sous 7 jours, Matera procédera à la contractualisation", required: true, order: 2 },
  { statut: "envoye_cs", label: "Joindre le ou les devis au mail", required: true, order: 3 },
  { statut: "envoye_cs", label: "Noter la date limite de réponse CS (J+7)", required: false, order: 4 },

  // 7. Validation CS
  { statut: "validation_cs", label: "Attendre réponse du CS (7 jours)", description: "Si pas de réponse après 7j, Matera peut procéder en tant que syndic", required: true, order: 1 },
  { statut: "validation_cs", label: "Traiter les éventuelles questions du CS", required: false, order: 2 },

  // 8. Contrat signé
  { statut: "contrat_signe", label: "Signer le contrat en tant que syndic (tampon / signature électronique)", required: true, order: 1 },
  { statut: "contrat_signe", label: "Renvoyer le contrat signé au nouvel assureur", required: true, order: 2 },
  { statut: "contrat_signe", label: "Déposer le nouveau contrat dans 'Mes contrats' sur Duomo", required: true, order: 3 },
  { statut: "contrat_signe", label: "Renseigner assureur, courtier, dates et montant de prime sur Duomo", required: true, order: 4 },
  { statut: "contrat_signe", label: "Clôturer l'ancien contrat sur Duomo", required: true, order: 5 },

  // 9. Résiliation envoyée
  { statut: "resiliation_envoyee", label: "Envoyer mail de résiliation à l'ancien courtier/assureur", required: true, order: 1 },
  { statut: "resiliation_envoyee", label: "Envoyer courrier LRAR via AR24", required: true, order: 2 },
  { statut: "resiliation_envoyee", label: "Mettre à jour les informations dans HubSpot", required: false, order: 3 },

  // 10. Mandat SEPA
  { statut: "sepa_complete", label: "Récupérer le RIB de la copropriété", required: true, order: 1 },
  { statut: "sepa_complete", label: "Remplir le mandat SEPA de prélèvement automatique", required: true, order: 2 },
  { statut: "sepa_complete", label: "Envoyer le mandat signé au nouvel assureur", required: true, order: 3 },
];

async function main() {
  console.log("Seeding task templates...");

  // Delete existing templates
  await prisma.stageTaskTemplate.deleteMany();

  for (const task of TASK_TEMPLATES) {
    await prisma.stageTaskTemplate.create({ data: task });
  }

  console.log(`✓ ${TASK_TEMPLATES.length} task templates created`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
