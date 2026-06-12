import { prisma } from "@/lib/prisma";

// Ligne brute de l'export Omni "contrats" : un building peut apparaître sur
// PLUSIEURS lignes (ex. une ligne courtier + une ligne assureur pour le même
// contrat). La fusion par buildingId est faite dans syncContrats.
export type ContratRow = {
  buildingId: string;
  supplierName: string | null;
  brokerName: string | null;
  contractName: string | null;
  refNumber: string | null;
  terminationDate: Date | null;
  yearlyValue: number | null;
  emails: string[];
  phones: string[];
};

export type ContratSyncResult = {
  buildings: number;
  updated: number;
  // Copros dont les données contrat ont été éditées par un gestionnaire
  // (cliquet contratVerrouilleLe) → jamais réécrites par la sync.
  lockedManual: number;
  // Conflits (plusieurs contrats distincts) résolus automatiquement : une des
  // lignes correspond à l'assureur déjà connu du CRM → c'est elle le contrat.
  conflictsResolved: number;
  // Conflits NON résolus → seuls les contacts ont été fusionnés, les champs
  // contrat sont à arbitrer à la main.
  conflicts: number;
  conflictIds: string[];
  notFound: number;
  notFoundIds: string[];
  totalRows: number;
  errors?: string[];
};

// Champs fusionnés pour un building. Un champ null = "pas d'info dans cet
// export" → on ne touche pas à la valeur existante en base.
export type MergedContrat = {
  assureurActuel: string | null;
  courtierActuel: string | null;
  numeroContrat: string | null;
  primeActuelle: number | null;
  dateEcheance: Date | null;
  contactCourtierEmail: string | null;
  contactCourtierTel: string | null;
};

// Identifie la ligne "contrat" (assureur) parmi les lignes d'un même building :
// celle qui porte le n° de contrat, la prime et/ou un Broker Name. À défaut,
// la ligne la plus remplie.
function scoreRow(r: ContratRow): number {
  let score = 0;
  if (r.refNumber) score += 4;
  if (r.yearlyValue != null) score += 4;
  if (r.brokerName) score += 2;
  if (r.contractName) score += 1;
  if (r.terminationDate) score += 1;
  return score;
}

// Deux lignes peuvent décrire DEUX CONTRATS DISTINCTS (et pas courtier +
// assureur du même contrat) : on le détecte par des n° de contrat ou des noms
// de contrat différents. Dans ce cas on ne devine pas → seuls les contacts
// sont fusionnés, les champs contrat sont laissés à l'arbitrage manuel.
export function hasConflictingContracts(rows: ContratRow[]): boolean {
  const refs = new Set(rows.map((r) => r.refNumber).filter(Boolean));
  if (refs.size >= 2) return true;
  const names = new Set(rows.map((r) => r.contractName).filter(Boolean));
  return names.size >= 2;
}

// Résolution d'un conflit par l'assureur déjà connu du CRM (alimenté par le
// "Last Known MRI Supplier Name" de la requête Omni principale) : si exactement
// une ligne porte ce nom, c'est elle le contrat courant.
export function resolveConflictByAssureur(
  rows: ContratRow[],
  assureurConnu: string | null
): ContratRow | null {
  if (!assureurConnu) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const matches = rows.filter((r) => r.supplierName && norm(r.supplierName) === norm(assureurConnu));
  return matches.length === 1 ? matches[0] : null;
}

// `forcedContract` (résolution de conflit) : les champs contrat viennent
// EXCLUSIVEMENT de cette ligne — les autres lignes sont d'autres contrats,
// elles n'apportent que leurs contacts.
export function mergeContratRows(rows: ContratRow[], forcedContract?: ContratRow): MergedContrat {
  if (forcedContract) {
    const emails = [...new Set(rows.flatMap((r) => r.emails))];
    const phones = [...new Set(rows.flatMap((r) => r.phones))];
    return {
      assureurActuel: forcedContract.supplierName,
      courtierActuel: forcedContract.brokerName,
      numeroContrat: forcedContract.refNumber,
      primeActuelle: forcedContract.yearlyValue,
      dateEcheance: forcedContract.terminationDate,
      contactCourtierEmail: emails.length ? emails.join(", ") : null,
      contactCourtierTel: phones.length ? phones.join(", ") : null,
    };
  }

  const sorted = [...rows].sort((a, b) => scoreRow(b) - scoreRow(a));
  const contract = sorted[0];
  const others = sorted.slice(1);

  const firstNonEmpty = <T>(pick: (r: ContratRow) => T | null): T | null => {
    for (const r of sorted) {
      const v = pick(r);
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };

  // Courtier : le Broker Name de la ligne contrat ; sinon, s'il y a une autre
  // ligne (fournisseur distinct de l'assureur), c'est elle le courtier.
  const courtier =
    contract.brokerName ||
    others.find((r) => r.supplierName && r.supplierName !== contract.supplierName)
      ?.supplierName ||
    null;

  // Priorité absolue : ne perdre AUCUNE adresse mail → union de toutes les
  // lignes, dédupliquée, ordre d'apparition conservé.
  const emails = [...new Set(sorted.flatMap((r) => r.emails))];
  const phones = [...new Set(sorted.flatMap((r) => r.phones))];

  return {
    assureurActuel: contract.supplierName,
    courtierActuel: courtier,
    numeroContrat: firstNonEmpty((r) => r.refNumber),
    primeActuelle: firstNonEmpty((r) => r.yearlyValue),
    dateEcheance: firstNonEmpty((r) => r.terminationDate),
    contactCourtierEmail: emails.length ? emails.join(", ") : null,
    contactCourtierTel: phones.length ? phones.join(", ") : null,
  };
}

/**
 * Sync des infos contrat (assureur, courtier, n° de contrat, prime, contacts)
 * depuis l'export Omni "contrats". Contrairement à syncCopros :
 * - ne crée JAMAIS de copro : un building inconnu est compté en notFound ;
 * - ne met à jour QUE les champs renseignés (un export partiel n'efface rien) ;
 * - cliquet permanent : copro éditée par un gestionnaire (contratVerrouilleLe)
 *   → jamais réécrite, comptée en lockedManual ;
 * - ne touche ni statut, ni pipeline, ni tâches.
 */
export async function syncContrats(rows: ContratRow[]): Promise<ContratSyncResult> {
  const byBuilding = new Map<string, ContratRow[]>();
  for (const row of rows) {
    if (!row.buildingId) continue;
    const list = byBuilding.get(row.buildingId) ?? [];
    list.push(row);
    byBuilding.set(row.buildingId, list);
  }

  let updated = 0;
  let lockedManual = 0;
  let conflictsResolved = 0;
  const conflictIds: string[] = [];
  const notFoundIds: string[] = [];
  const errors: string[] = [];

  for (const [buildingId, group] of byBuilding) {
    try {
      const existing = await prisma.copro.findUnique({ where: { buildingId } });
      if (!existing) {
        notFoundIds.push(buildingId);
        continue;
      }
      if (existing.contratVerrouilleLe) {
        lockedManual++;
        continue;
      }

      // Conflit (plusieurs contrats distincts) : on tente d'abord la résolution
      // par l'assureur connu du CRM ; sinon arbitrage manuel (contacts seuls).
      let conflict = hasConflictingContracts(group);
      let resolved: ContratRow | null = null;
      if (conflict) {
        resolved = resolveConflictByAssureur(group, existing.assureurActuel);
        if (resolved) {
          conflict = false;
          conflictsResolved++;
        } else {
          conflictIds.push(buildingId);
        }
      }

      const merged = mergeContratRows(group, resolved ?? undefined);
      const data: Record<string, unknown> = { syncedAt: new Date() };
      const contactsOnly: (keyof MergedContrat)[] = ["contactCourtierEmail", "contactCourtierTel"];
      for (const [key, value] of Object.entries(merged)) {
        if (value === null) continue;
        if (conflict && !contactsOnly.includes(key as keyof MergedContrat)) continue;
        data[key] = value;
      }

      await prisma.copro.update({ where: { buildingId }, data });
      updated++;
    } catch (e) {
      errors.push(`${buildingId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    buildings: byBuilding.size,
    updated,
    lockedManual,
    conflictsResolved,
    conflicts: conflictIds.length,
    conflictIds,
    notFound: notFoundIds.length,
    notFoundIds,
    totalRows: rows.length,
    errors: errors.length ? errors : undefined,
  };
}
