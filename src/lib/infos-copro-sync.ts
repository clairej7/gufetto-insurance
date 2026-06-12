import { prisma } from "@/lib/prisma";

// Ligne de l'export Omni "infos copropriétés" : une ligne par building.
export type InfosCoproRow = {
  buildingId: string;
  surface: number | null;
  constructionYear: number | null;
  duomoUrl: string | null;
};

export type InfosCoproSyncResult = {
  buildings: number;
  updated: number;
  lockedManual: number;
  notFound: number;
  notFoundIds: string[];
  errors?: string[];
};

// Convertit une année de construction vers les tranches fermées du CRM
// (mêmes valeurs que le select du bloc "Infos copropriété").
export function mapConstructionYear(year: number | null): string | null {
  if (year === null || !Number.isFinite(year) || year < 1000 || year > 2100) return null;
  if (year < 1950) return "avant_1950";
  if (year < 1970) return "1950_1970";
  if (year < 1985) return "1970_1985";
  if (year < 2000) return "1985_2000";
  return "apres_2000";
}

/**
 * Sync des infos copropriété (surface, période de construction, lien Duomo)
 * depuis l'export Omni "infos copropriétés". Mêmes règles que syncContrats :
 * - ne crée JAMAIS de copro (building inconnu → notFound) ;
 * - ne met à jour QUE les champs renseignés (un export partiel n'efface rien) ;
 * - cliquet : copro éditée par un gestionnaire (contratVerrouilleLe) → skip.
 */
export async function syncInfosCopro(rows: InfosCoproRow[]): Promise<InfosCoproSyncResult> {
  let updated = 0;
  let lockedManual = 0;
  const notFoundIds: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    try {
      if (!row.buildingId || seen.has(row.buildingId)) continue;
      seen.add(row.buildingId);

      const existing = await prisma.copro.findUnique({ where: { buildingId: row.buildingId } });
      if (!existing) {
        notFoundIds.push(row.buildingId);
        continue;
      }
      if (existing.contratVerrouilleLe) {
        lockedManual++;
        continue;
      }

      const data: Record<string, unknown> = { syncedAt: new Date() };
      if (row.surface !== null) data.surfaceDeveloppee = row.surface;
      const periode = mapConstructionYear(row.constructionYear);
      if (periode !== null) data.periodeConstruction = periode;
      if (row.duomoUrl !== null) data.duomoUrl = row.duomoUrl;

      await prisma.copro.update({ where: { buildingId: row.buildingId }, data });
      updated++;
    } catch (e) {
      errors.push(`${row.buildingId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    buildings: seen.size,
    updated,
    lockedManual,
    notFound: notFoundIds.length,
    notFoundIds,
    errors: errors.length ? errors : undefined,
  };
}
