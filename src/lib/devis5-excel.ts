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
// On EXCLUT aussi les dossiers déjà intégrés à un lot Excel (event devis5Lot) :
// ils sont « sortis » du Volet 2 et vivent dans le Volet 3.
async function volet2PipelineIds(): Promise<string[]> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: {
      metadata: { path: ["devis5Volet"], equals: 2 },
      pipeline: {
        statut: "devis_demandes", coproId: { notIn: excl }, copro: { archivedAt: null },
        events: {
          none: {
            OR: [
              { metadata: { path: ["devisType"], equals: "devis_sent" } },
              { metadata: { path: ["devis5Lot"], equals: true } },
            ],
          },
        },
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

const COPRO_SELECT = {
  nom: true, adresse: true, primeActuelle: true, assureurActuel: true, surfaceDeveloppee: true,
  periodeConstruction: true, natureOccupation: true, activitesAggravantes: true,
  caracteristiquesParticulieres: true, proportionInoccupee: true, protectionJuridique: true,
} as const;

// Cellules à partir des données Gufetto déjà connues : vert si présente, rouge si vide.
// (Persistance : une valeur déjà extraite/saisie a été écrite dans Copro → elle
// réapparaît en vert après un rafraîchissement, plus de remise à zéro.)
function cellsFromCopro(raw: Record<ColKey, string | null>): Record<ColKey, Cell> {
  return Object.fromEntries(COLUMNS.map((c) => {
    const v = raw[c.key];
    return [c.key, v != null && v !== "" ? { value: v, color: "green" as CellColor } : { value: null, color: "red" as CellColor }];
  })) as Record<ColKey, Cell>;
}

// Tableau initial : 1 ligne par dossier, pré-rempli avec ce que Gufetto sait déjà
// (vert), le reste en rouge (à retrouver via l'extraction du contrat).
export async function getDevis5ExcelRows(): Promise<{ count: number; rows: ExcelRow[] }> {
  const ids = await volet2PipelineIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { id: { in: ids } },
    select: { id: true, copro: { select: COPRO_SELECT } },
  });
  const byId = new Map(ps.map((p) => [p.id, p.copro]));
  const rows = ids.filter((id) => byId.has(id)).map((id) => {
    const c = byId.get(id)!;
    return { pipelineId: id, nom: c.nom, cells: cellsFromCopro(coproRaw(c)) };
  });
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
  // Défauts « safe » appliqués si l'extraction ne trouve rien (règles métier
  // Quentin) : ces champs ne restent JAMAIS vides, au pire orange « à vérifier ».
  const DEFAULTS: Partial<Record<ColKey, string>> = {
    surface: "Inconnue", // dernier recours : aucune surface trouvée au contrat
    periode: "inconnue",
    nature: "habitation",
    activites: JSON.stringify(["Aucune"]),
    caracteristiques: JSON.stringify(["Aucune"]),
    proportion: "moins_25",
    pj: "non",
  };

  for (const col of COLUMNS) {
    const k = col.key;
    const ex = existing[k];
    if (ex != null && ex !== "") { cells[k] = { value: ex, color: "green" }; continue; }
    // assureur n'est pas extrait du contrat (donnée Gufetto uniquement)
    const c = k === "assureur" ? null : asStr((conf as Record<string, ConfVal<unknown> | undefined>)[k]);
    if (c) {
      cells[k] = { value: c.raw, color: c.sure ? "green" : "orange" };
      // On ne PERSISTE en base QUE les valeurs sûres (vertes). Les défauts « à
      // vérifier » (orange) restent affichés (et conservés via le localStorage du
      // tableau) mais NE sont PAS écrits dans Copro — sinon ils repasseraient
      // verts au rechargement, perdant le signal « à vérifier ».
      if (c.sure) {
        const field = coproCol[k]!;
        toPersist[field] = k === "prime" || k === "surface" ? Number(c.raw) : c.raw;
      }
    } else if (DEFAULTS[k] !== undefined) {
      // Défaut « safe » DÉTERMINISTE (dans le code, pas via le modèle qui omet
      // parfois le champ) → orange « à vérifier », jamais persisté en base.
      cells[k] = { value: DEFAULTS[k]!, color: "orange" };
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
  if (key === "prime" || key === "surface") {
    // champ numérique en base → « Inconnue » ou tout texte non chiffré = null
    // (la valeur affichée « Inconnue » vit dans le tableau, pas en base).
    const cleaned = v.replace(/[^\d.]/g, "");
    stored = cleaned ? Number(cleaned) : null;
  }
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

// ─── Volet 3 : lots Excel ────────────────────────────────────────────────────
export type LotSend = { assureur: string; at: string; by: string };
export type Devis5LotRow = { id: string; createdAt: string; createdBy: string; sentAt: string | null; count: number; sends: LotSend[] };

function parseSends(raw: string | null): LotSend[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Crée un lot à partir des lignes affichées : fige rows + pipelineIds, marque les
// dossiers (event devis5Lot → ils sortent du Volet 2). Retourne l'id du lot.
export async function createDevis5Lot(rows: ExcelRow[], actorEmail: string): Promise<{ id: string }> {
  const pipelineIds = rows.map((r) => r.pipelineId).filter(Boolean);
  const lot = await prisma.devis5Lot.create({
    data: { createdBy: actorEmail, count: rows.length, rows: JSON.stringify(rows), pipelineIds: JSON.stringify(pipelineIds) },
  });
  if (pipelineIds.length) {
    await prisma.pipelineEvent.createMany({
      data: pipelineIds.map((pid) => ({
        pipelineId: pid, type: "action_manuelle" as const,
        description: "Intégré à un lot Excel de demandes de devis (Volet 3)",
        metadata: { devis5Lot: true, lotId: lot.id }, createdBy: actorEmail,
      })),
    });
  }
  return { id: lot.id };
}

export async function getDevis5Lots(): Promise<Devis5LotRow[]> {
  const lots = await prisma.devis5Lot.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return lots.map((l) => ({ id: l.id, createdAt: l.createdAt.toISOString(), createdBy: l.createdBy, sentAt: l.sentAt?.toISOString() ?? null, count: l.count, sends: parseSends(l.sends) }));
}

// Re-génère le .xlsx d'un lot depuis ses lignes figées.
export async function getDevis5LotXlsx(lotId: string): Promise<Buffer | null> {
  const lot = await prisma.devis5Lot.findUnique({ where: { id: lotId } });
  if (!lot) return null;
  let rows: ExcelRow[] = [];
  try { rows = JSON.parse(lot.rows) as ExcelRow[]; } catch { rows = []; }
  return buildDevis5Xlsx(rows);
}

// Marque un lot « envoyé » (à la main) → date + event devis_sent sur chaque dossier
// (⇒ « demandes envoyées » du dashboard). Idempotent.
export async function markDevis5LotSent(lotId: string, actorEmail: string, assureur?: string): Promise<{ ok: boolean; sentAt: string; marked: number; sends: LotSend[] }> {
  const lot = await prisma.devis5Lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new Error("lot introuvable");
  const now = new Date();
  const firstSend = !lot.sentAt;
  let ids: string[] = [];
  try { ids = JSON.parse(lot.pipelineIds) as string[]; } catch { ids = []; }

  // Ajoute l'envoi (par assureur) à l'historique du lot.
  const sends = parseSends(lot.sends);
  sends.push({ assureur: (assureur || "").trim() || "assureur", at: now.toISOString(), by: actorEmail });
  const data: { sends: string; sentAt?: Date; sentBy?: string } = { sends: JSON.stringify(sends) };
  if (firstSend) { data.sentAt = now; data.sentBy = actorEmail; }
  await prisma.devis5Lot.update({ where: { id: lotId }, data });

  // Le comptage « demande envoyée » ne se fait qu'au PREMIER envoi (idempotent) :
  // envoyer le même lot à un 2ᵉ assureur ne re-compte pas les dossiers.
  let marked = 0;
  if (firstSend) {
    const already = await prisma.pipelineEvent.findMany({
      where: { pipelineId: { in: ids }, metadata: { path: ["devisType"], equals: "devis_sent" } },
      select: { pipelineId: true },
    });
    const done = new Set(already.map((e) => e.pipelineId));
    const todo = ids.filter((id) => !done.has(id));
    if (todo.length) {
      await prisma.pipelineEvent.createMany({
        data: todo.map((pid) => ({
          pipelineId: pid, type: "action_manuelle" as const,
          description: `Demande de devis envoyée (lot Excel du ${now.toLocaleDateString("fr-FR")})`,
          metadata: { devisType: "devis_sent", relanceNum: 0, auto: "devis5_lot", lotId }, createdBy: actorEmail,
        })),
      });
    }
    marked = todo.length;
  }
  return { ok: true, sentAt: (lot.sentAt ?? now).toISOString(), marked, sends };
}
