// Seed de la base de référence courtiers/assureurs (Automatisation 3).
// Source = base curée par Quentin ("manuel"). Idempotent : purge d'abord les
// lignes source="manuel" puis réinsère. Le scraping Front (source="front")
// n'est pas touché.
//
// Lancer : npx tsx scripts/seed-courtier-ref.ts

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { normNom } from "../src/lib/courtier-ref";

type Seed = {
  nom: string;
  type: "courtier" | "assureur";
  emails?: string[]; // 1er = principal
  assureur?: string; // compagnie associée si connue
  notes?: string;
};

// --- Assureurs (compagnies) : garde-fou — on ne demande PAS le RS ici,
//     ils renvoient vers le courtier. Renseignés comme type="assureur". ---
const ASSUREURS: Seed[] = [
  { nom: "AXA", type: "assureur" },
  { nom: "Generali", type: "assureur" },
  { nom: "SADA", type: "assureur" },
  { nom: "Swiss Life", type: "assureur" },
  { nom: "Groupama", type: "assureur" },
  { nom: "Mila", type: "assureur" },
  { nom: "Crédit Mutuel", type: "assureur" },
  { nom: "Matmut", type: "assureur", emails: ["clients.entreprises@imentreprises.fr"] },
];

// --- Courtiers : cœur de la base, avec leur(s) mail(s) type. ---
const COURTIERS: Seed[] = [
  { nom: "Verspieren", type: "courtier", notes: "Format mail : (initiale prénom)(nom)@verspieren.com — à confirmer au cas par cas." },
  { nom: "Abeille Assurances", type: "courtier", emails: ["cbl@abeille-assurances.com", "v-decarvalho@abeille-assurances.com"] },
  { nom: "Assurimo", type: "courtier", emails: ["assurlyon@assurimo.fr"] },
  { nom: "Odealim", type: "courtier", emails: ["prodimparis@odealim.com", "odealim@odealim.fr", "compta.prod.idf@odealim.fr"] },
  { nom: "Assurgerance", type: "courtier", emails: ["web@assurgerance.com"], notes: "Groupe Odealim." },
  { nom: "Plasse", type: "courtier", emails: ["sylvie.chapon@pplasse.fr"] },
  { nom: "Filhet Allard", type: "courtier", emails: ["aplanchamp@filhetallard.com"] },
  { nom: "Salset", type: "courtier" },
  { nom: "Lamy Assurances", type: "courtier", emails: ["mri_pj@lamy-assurances.fr"] },
  { nom: "Lycéa", type: "courtier", emails: ["sdaret@lycea.fr"] },
  { nom: "CCGA Assurances", type: "courtier", emails: ["contact@ccga-assurances.com"] },
  { nom: "Bélier Assurances", type: "courtier", emails: ["mri_pj@belier-assurances.fr"] },
  { nom: "Ricard Conseil", type: "courtier", emails: ["charlotte@ricardconseils.fr"] },
  { nom: "Diot Assurances", type: "courtier", emails: ["squentin@diot.com", "standard.accueil@diot.com"] },
  { nom: "Entoria", type: "courtier", emails: ["cotisations.iard@entoria.fr"] },
  { nom: "Verlingue", type: "courtier", emails: ["verlingueimmobilier@verlingue.fr"] },
  { nom: "AIC Giovannetti", type: "courtier", emails: ["cch@cabinet-aicg.fr"] },
  { nom: "Saint Pierre Assurances", type: "courtier", emails: ["mri@stpierreassurances.com"] },
  { nom: "Rambaud Labrosse Assurances", type: "courtier", emails: ["assurances@rambaud-labrosse.com"] },
  { nom: "Jean Charpentier-Sopagi S.A.", type: "courtier", emails: ["r.raveau@jcadb.org"] },
  { nom: "SCABD", type: "courtier", emails: ["scabd@wanadoo.fr"] },
];

async function main() {
  const rows = [...ASSUREURS, ...COURTIERS];
  const del = await prisma.courtierRef.deleteMany({ where: { source: "manuel" } });
  console.log(`Purge source=manuel : ${del.count} ligne(s) supprimée(s).`);

  for (const r of rows) {
    const emails = r.emails ?? [];
    await prisma.courtierRef.create({
      data: {
        nom: r.nom,
        nomNorm: normNom(r.nom),
        type: r.type,
        email: emails[0] ?? null,
        emailsAll: emails.length ? emails.join(";") : null,
        assureur: r.assureur ?? null,
        source: "manuel",
        verifie: emails.length > 0, // mail fourni par Quentin = vérifié
        notes: r.notes ?? null,
      },
    });
  }

  const total = await prisma.courtierRef.count();
  const courtiers = await prisma.courtierRef.count({ where: { type: "courtier" } });
  const assureurs = await prisma.courtierRef.count({ where: { type: "assureur" } });
  const avecMail = await prisma.courtierRef.count({ where: { NOT: { email: null } } });
  console.log(`OK — ${rows.length} lignes insérées. Base : ${total} au total · ${courtiers} courtiers · ${assureurs} assureurs · ${avecMail} avec mail.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
