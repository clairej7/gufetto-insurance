// Automatisation 4 — Volet 1 : vérification de l'échantillon chargé depuis l'auto 3.
// L'échantillon = dossiers marqués rsBatchAt (encore en « Récupération du RS »),
// mis à jour au fur et à mesure des envois de l'auto 3. On trie en 2 catégories :
//   - infos complètes   = mail courtier + assureur + n° de contrat présents
//   - infos incomplètes = au moins un de ces champs manquant
// (le mail courtier est normalement toujours là, garanti par l'auto 3 ; on le
//  revérifie par sécurité). Le n° de contrat est le champ le plus souvent absent.

import { prisma } from "@/lib/prisma";

export type Rs4Row = {
  pipelineId: string;
  nom: string;
  assureur: string | null;
  numeroContrat: string | null;
  courtier: string | null;
  mail: string | null;
  manque: string[]; // champs manquants (pour la catégorie incomplète)
};

export type Rs4Sample = {
  total: number;
  complete: number;
  incomplete: number;
  completeRows: Rs4Row[];
  incompleteRows: Rs4Row[];
};

export async function getRs4Sample(): Promise<Rs4Sample> {
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "rs_en_cours", rsBatchAt: { not: null }, copro: { archivedAt: null } },
    select: { id: true, rsBatchAt: true, copro: { select: { nom: true, assureurActuel: true, numeroContrat: true, courtierActuel: true, contactCourtierEmail: true } } },
    orderBy: { rsBatchAt: "desc" },
  });

  const completeRows: Rs4Row[] = [];
  const incompleteRows: Rs4Row[] = [];
  for (const p of ps) {
    const c = p.copro;
    const mail = c.contactCourtierEmail?.trim() || null;
    const assureur = c.assureurActuel?.trim() || null;
    const numeroContrat = c.numeroContrat?.trim() || null;
    const manque: string[] = [];
    if (!mail) manque.push("mail courtier");
    if (!assureur) manque.push("assureur");
    if (!numeroContrat) manque.push("n° de contrat");
    const row: Rs4Row = { pipelineId: p.id, nom: c.nom, assureur, numeroContrat, courtier: c.courtierActuel?.trim() || null, mail, manque };
    (manque.length === 0 ? completeRows : incompleteRows).push(row);
  }

  return { total: ps.length, complete: completeRows.length, incomplete: incompleteRows.length, completeRows, incompleteRows };
}
