// Automatisation 5 — Volet 2 « Tableau Excel devis ».
// AXA demande désormais un Excel (11 colonnes A→K) par lot de dossiers. Ce module
// fournit : les lignes (1 par dossier du volet 2), l'extraction avec code couleur
// (vert = sûr, orange = douteux, rouge = manquant), la sauvegarde d'une cellule
// éditée, et la génération du .xlsx.
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { extractDevisConfidentForPipeline, type ConfVal } from "@/lib/devis-info";
import { COLUMNS, displayValue, type Cell, type CellColor, type ColKey, type ExcelRow } from "@/lib/devis5-columns";

export type { Cell, CellColor, ColKey, ExcelRow } from "@/lib/devis5-columns";
export { COLUMNS, LABELS, displayValue } from "@/lib/devis5-columns";

// ── Périmètre = dossiers passés au Volet 2 (mêmes critères que getDevis5Volet2Data) ──
async function volet2PipelineIds(): Promise<string[]> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: {
      metadata: { path: ["devis5Volet"], equals: 2 },
      pipeline: {
        statut: "devis_demandes", coproId: { notIn: excl }, copro: { archivedAt: null },
        events: { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } },
      },
    },
    select: { pipelineId: true, pipeline: { select: { copro: { select: { dateEcheance: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  // dédup en gardant l'ordre (échéance croissante ensuite)
  const seen = new Set<string>();
  const ids = ev.filter((e) => (seen.has(e.pipelineId) ? false : (seen.add(e.pipelineId), true)));
  ids.sort((a, b) => {
    const da = a.pipeline.copro.dateEcheance?.getTime() ?? Infinity;
    const db = b.pipeline.copro.dateEcheance?.getTime() ?? Infinity;
    return da - db;
  });
  return ids.map((e) => e.pipelineId);
}

// Tableau initial : 1 ligne par dossier, SEULE la colonne A (nom) est remplie.
export async function getDevis5ExcelRows(): Promise<{ count: number; rows: ExcelRow[] }> {
  const ids = await volet2PipelineIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { id: { in: ids } },
    select: { id: true, copro: { select: { nom: true } } },
  });
  const byId = new Map(ps.map((p) => [p.id, p.copro.nom]));
  const empty = (): Record<ColKey, Cell> =>
    Object.fromEntries(COLUMNS.map((c) => [c.key, { value: null, color: "red" as CellColor }])) as Record<ColKey, Cell>;
  const rows = ids.filter((id) => byId.has(id)).map((id) => ({ pipelineId: id, nom: byId.get(id)!, cells: empty() }));
  return { count: rows.length, rows };
}

// Copro → forme brute par colonne (assureur/prime existants, F→K si déjà remplis).
function coproRaw(c: {
  adresse: string | null; primeActuelle: number | null; assureurActuel: string | null; surfaceDeveloppee: number | null;
  periodeConstruction: string | null; natureOccupation: string | null; activitesAggravantes: string | null;
  caracteristiquesParticulieres: string | null; proportionInoccupee: string | null; protectionJuridique: string | null;
}): Record<ColKey, string | null> {
  return {
    adresse: c.adresse, prime: c.primeActuelle != null ? String(c.primeActuelle) : null,
    assureur: c.assureurActuel, surface: c.surfaceDeveloppee != null ? String(c.surfaceDeveloppee) : null,
    periode: c.periodeConstruction, nature: c.natureOccupation,
    activites: c.activitesAggravantes, caracteristiques: c.caracteristiquesParticulieres,
    proportion: c.proportionInoccupee, pj: c.protectionJuridique,
  };
}

// Remplit UNE ligne : données Gufetto existantes (vert) + extraction contrat
// (vert si sûr, orange si douteux) sur les champs vides ; persiste les valeurs
// trouvées dans Copro (n'écrase jamais un champ déjà rempli). rouge = manquant.
export async function extractDevis5Row(pipelineId: string): Promise<ExcelRow | null> {
  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { coproId: true, copro: { select: {
      nom: true, adresse: true, primeActuelle: true, assureurActuel: true, surfaceDeveloppee: true,
      periodeConstruction: true, natureOccupation: true, activitesAggravantes: true,
      caracteristiquesParticulieres: true, proportionInoccupee: true, protectionJuridique: true,
    } } },
  });
  if (!p) return null;
  const existing = coproRaw(p.copro);
  const { data: conf } = await extractDevisConfidentForPipeline(pipelineId);

  const cells = {} as Record<ColKey, Cell>;
  const toPersist: Record<string, unknown> = {};
  const asStr = (cv: ConfVal<unknown> | undefined): { raw: string; sure: boolean } | null => {
    if (!cv) return null;
    const v = cv.value;
    if (Array.isArray(v)) return { raw: JSON.stringify(v), sure: cv.sure };
    if (typeof v === "number") return { raw: String(v), sure: cv.sure };
    if (typeof v === "string") return { raw: v, sure: cv.sure };
    return null;
  };
  const coproCol: Record<ColKey, string | null> = {
    adresse: "adresse", prime: "primeActuelle", assureur: "assureurActuel", surface: "surfaceDeveloppee",
    periode: "periodeConstruction", nature: "natureOccupation", activites: "activitesAggravantes",
    caracteristiques: "caracteristiquesParticulieres", proportion: "proportionInoccupee", pj: "protectionJuridique",
  };

  for (const col of COLUMNS) {
    const k = col.key;
    const ex = existing[k];
    if (ex != null && ex !== "") { cells[k] = { value: ex, color: "green" }; continue; }
    // assureur n'est pas extrait du contrat (donnée Gufetto uniquement)
    const c = k === "assureur" ? null : asStr((conf as Record<string, ConfVal<unknown> | undefined>)[k]);
    if (c) {
      cells[k] = { value: c.raw, color: c.sure ? "green" : "orange" };
      // persiste dans Copro (champ vide uniquement) — la valeur « colle » pour la suite
      const field = coproCol[k]!;
      toPersist[field] = k === "prime" || k === "surface" ? Number(c.raw) : c.raw;
    } else {
      cells[k] = { value: null, color: "red" };
    }
  }
  if (Object.keys(toPersist).length) {
    await prisma.copro.update({ where: { id: p.coproId }, data: toPersist });
  }
  return { pipelineId, nom: p.copro.nom, cells };
}

// Sauvegarde d'une cellule éditée à la main → écrit dans Copro, renvoie la cellule (verte).
export async function saveDevis5Cell(pipelineId: string, key: ColKey, value: string | null): Promise<Cell> {
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { coproId: true } });
  if (!p) throw new Error("dossier introuvable");
  const v = (value ?? "").trim();
  const field: Record<ColKey, string> = {
    adresse: "adresse", prime: "primeActuelle", assureur: "assureurActuel", surface: "surfaceDeveloppee",
    periode: "periodeConstruction", nature: "natureOccupation", activites: "activitesAggravantes",
    caracteristiques: "caracteristiquesParticulieres", proportion: "proportionInoccupee", pj: "protectionJuridique",
  };
  let stored: unknown = v || null;
  if (key === "prime" || key === "surface") stored = v ? Number(v.replace(/[^\d.]/g, "")) : null;
  await prisma.copro.update({ where: { id: p.coproId }, data: { [field[key]]: stored } });
  // Une saisie manuelle est considérée fiable → vert (rouge si vidée).
  return { value: v || null, color: v ? "green" : "red" };
}

// Génère le .xlsx (A→K, valeurs « humaines ») à partir de lignes fournies par l'UI
// (on prend l'état affiché, y compris les éditions manuelles).
export async function buildDevis5Xlsx(rows: ExcelRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Demandes de devis");
  ws.columns = [
    { header: "Nom de la copropriété", key: "nom", width: 40 },
    ...COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.type === "multi" ? 32 : 22 })),
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  for (const r of rows) {
    const row: Record<string, string> = { nom: r.nom };
    for (const c of COLUMNS) row[c.key] = displayValue(c.key, r.cells[c.key]?.value ?? null);
    ws.addRow(row);
  }
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
