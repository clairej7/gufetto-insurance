// Dossier TEST pour l'Automatisation 6 (Comparer les devis & prévenir le gestionnaire).
// Statut devis_recus + contrat (avec PJ) + 2 devis « comparés » (data) → le bouton
// « Envoyer » est actif et tout le flux Slack/validation est testable sans toucher
// aux vrais dossiers. Re-lançable (supprime puis recrée le dossier test).
//   npx tsx scripts/create-test-auto6.ts
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const BID = "test-auto6";
const gar = (pj: boolean) => ({ incendie: true, dommagesElectriques: true, evenementsClimatiques: true, catastrophesNaturelles: true, catastrophesTechnologiques: true, degatsDesEaux: true, vol: true, brisDeGlace: true, rc: true, defenseRecours: true, vandalisme: true, effondrement: true, brisDeMachines: true, autresEvenements: true, protectionJuridique: pj, protectionCS: true, honoSyndic: true });

async function main() {
  await prisma.copro.deleteMany({ where: { buildingId: BID } }); // cascade pipeline/events/devis
  const copro = await prisma.copro.create({
    data: {
      buildingId: BID, nom: "TEST — Automatisation 6 (à supprimer)", adresse: "1 rue de Test, 75000 Paris",
      gestionnaireEmail: "quentin.lepoutre@matera.eu", gestionnaireNom: "Quentin Lepoutre",
      assureurActuel: "GROUPAMA (TEST)", numeroContrat: "TEST-A6-001", primeActuelle: 5200,
      dateEcheance: new Date("2026-12-31"), surfaceDeveloppee: 900, periodeConstruction: "1970_1985",
      natureOccupation: "habitation", protectionJuridique: "oui",
    },
  });
  const contrat = { assureur: "GROUPAMA GRAND EST (TEST)", numeroContrat: "TEST-A6-001", primeTTC: 5200, garanties: gar(true) };
  const p = await prisma.insurancePipeline.create({
    data: {
      coproId: copro.id, statut: "devis_recus", anneeEcheance: 2026,
      notes: "Dossier de test Auto 6", contratActuelData: JSON.stringify(contrat),
    },
  });
  await prisma.devisRecu.createMany({ data: [
    { pipelineId: p.id, assureur: "AXA France IARD", numeroContrat: "TEST-AXA", primeTTC: 4200, recommande: false,
      data: JSON.stringify({ assureur: "AXA France IARD", primeTTC: 4200, garanties: gar(false), pointsForts: ["Garanties complètes", "Franchise nulle"], pointsFaibles: ["Pas de protection juridique"] }) },
    { pipelineId: p.id, assureur: "Mila", numeroContrat: "TEST-MILA", primeTTC: 4450, recommande: false,
      data: JSON.stringify({ assureur: "Mila", primeTTC: 4450, garanties: gar(true), pointsForts: ["LCI élevée", "PJ incluse"], pointsFaibles: ["Frais de service 15%"] }) },
  ] });
  await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: "Dossier de test Auto 6 créé", metadata: { auto: "test_auto6" }, createdBy: "claude@test" } });
  console.log("✅ Dossier test créé");
  console.log("   copro    ", copro.id);
  console.log("   pipeline ", p.id);
  console.log("   URL       https://gufetto-insurance.up.railway.app/pipeline/" + p.id);
  console.log("   → visible dans Auto 6 (statut devis_recus), contrat PJ=oui, AXA 4200 (sans PJ) / Mila 4450 (PJ), gestionnaire Quentin Lepoutre");
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
