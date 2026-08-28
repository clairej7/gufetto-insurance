// GHC — mode « écrasement » (appliquer aussi les corrections, pas seulement le fill).
// Logique PARTAGÉE entre le bouton « Importer avec écrasement » et l'application initiale.
//
// Garde-fous (fruit de la revue manuelle GHC v7) :
//  - placeholders ignorés : « non », « --- », « - », vide, « [object Object] », n° « 0 ».
//  - courtier « Matera »/« Matera - Syndic » : jamais écrit (ce n'est pas un courtier).
//  - échéance : écrasée UNIQUEMENT si strictement plus récente (comparaison au jour).
//  - assureur :
//      • dossiers ODR (odr_*) → PROTÉGÉ (le porteur est déjà le bon ; GHC trop bruité).
//      • dossiers Signé/résiliation → écrit SEULEMENT si GHC = partenaire (AXA/Generali/Sada/Mila).
//      • dossiers actifs (identifie/rs/devis/cs) → fill + correction.
//      • current « Wakam »/« Matera Assurance » (= on était l'assureur) → JAMAIS écrasé.
//  - dossiers « morts » (abandonne/refuse/non_assurable, sans autre pipeline vivant) → ignorés.
//  - prime : plancher 300 € / plafond 50 000 € ; correction si écart > 15 %.

import { prisma } from "@/lib/prisma";
import { matchPartner } from "@/lib/front-insurance";
import { isCloturePourClient } from "@/lib/pipeline";
import { isEcheancePerimee } from "@/lib/perime";

const PRIME_FLOOR = 300, PRIME_CEIL = 50000, DIV = 0.15;
const ODR_STATUTS = ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"];
const SIGNE_STATUTS = ["contrat_signe", "sepa_complete", "termine", "resiliation_envoyee"];
const DEAD_STATUTS = ["abandonne", "refuse", "non_assurable"];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const PLACEHOLDER = new Set(["non", "---", "--", "-", "", "n/a", "na", "néant", "neant"]);
export function cleanStr(v: string | null | undefined): string | null {
  let s = (v ?? "").trim();
  if (!s || s.includes("[object Object]")) return null;
  s = s.replace(/\s*[?]\s*$/, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
  if (PLACEHOLDER.has(s.toLowerCase())) return null;
  return s || null;
}
const cleanNum = (v: string | null): string | null => { const s = cleanStr(v); return s && s !== "0" ? s : null; };
const isMatera = (s: string) => /^matera(\s*-?\s*syndic)?$/i.test(s.trim());
const isWakamFam = (s: string | null) => !!s && (norm(s).includes("wakam") || norm(s).includes("matera assurance"));
const dayKey = (d: Date) => d.toLocaleDateString("fr-FR");

export type GhcRowIn = { buildingId: string; assureur: string | null; courtier: string | null; numeroContrat: string | null; montant: number | null; echeance: Date | null; aVerifier?: boolean };
export type FieldChange = { field: string; from: string | null; to: string; kind: "fill" | "overwrite" };
export type CoproChange = { coproId: string; buildingId: string; nom: string; adresse: string | null; step: string; changes: FieldChange[] };
export type OverwriteRecap = { coprosChanged: number; byField: Record<string, { fill: number; overwrite: number }>; byStep: Record<string, number>; skippedHold: number; skippedDead: number };

const GHC_SELECT = {
  id: true, nom: true, adresse: true, buildingId: true, clientMriStatut: true, assureurActuel: true, courtierActuel: true,
  numeroContrat: true, primeActuelle: true, dateEcheance: true, donneePerimee: true, ghcFields: true,
  pipelines: { select: { id: true, statut: true } },
} as const;

const STEP_OF = (statuts: string[]): string => {
  if (statuts.some((s) => ODR_STATUTS.includes(s))) return "ODR";
  if (statuts.some((s) => SIGNE_STATUTS.includes(s))) return "Signé/résiliation";
  if (statuts.includes("validation_cs") || statuts.includes("envoye_cs")) return "Validation CS";
  if (statuts.includes("devis_recus")) return "Comparaison devis";
  if (statuts.includes("devis_demandes")) return "Demandes de devis";
  if (statuts.includes("rs_en_cours") || statuts.includes("rs_recu")) return "Récupération RS";
  if (statuts.includes("identifie")) return "Identification";
  return "Autre";
};

// Calcule le plan de modifications (aucune écriture).
export async function planGhcOverwrite(rows: GhcRowIn[], holds: Set<string>): Promise<{ changes: CoproChange[]; recap: OverwriteRecap }> {
  const g = new Map(rows.map((r) => [r.buildingId, r]));
  const copros = await prisma.copro.findMany({ where: { archivedAt: null }, select: GHC_SELECT });
  const changes: CoproChange[] = [];
  const recap: OverwriteRecap = { coprosChanged: 0, byField: {}, byStep: {}, skippedHold: 0, skippedDead: 0 };
  const bump = (f: string, k: "fill" | "overwrite") => { (recap.byField[f] ??= { fill: 0, overwrite: 0 })[k]++; };

  for (const c of copros) {
    const gr = g.get(c.buildingId);
    if (!gr) continue;
    if (holds.has(c.buildingId)) { recap.skippedHold++; continue; }
    const statuts = c.pipelines.map((p) => p.statut);
    if (statuts.length > 0 && statuts.every((s) => DEAD_STATUTS.includes(s))) { recap.skippedDead++; continue; }

    const isOdr = statuts.some((s) => ODR_STATUTS.includes(s));
    const isSigne = !isOdr && statuts.some((s) => SIGNE_STATUTS.includes(s));
    const estClos = isCloturePourClient(c.clientMriStatut, c.assureurActuel);
    const list: FieldChange[] = [];

    // assureur
    const A = cleanStr(gr.assureur);
    if (A && !isMatera(A) && !isWakamFam(c.assureurActuel)) {
      const allowed = isOdr ? false : isSigne ? !!matchPartner(A) : true;
      if (allowed) {
        if (!c.assureurActuel) { list.push({ field: "assureur", from: null, to: A, kind: "fill" }); bump("assureur", "fill"); }
        else if (norm(A) !== norm(c.assureurActuel)) {
          // Anti-churn : ne pas réécrire un assureur si c'est le MÊME partenaire (ex. AXA → AXA France IARD).
          const pFrom = matchPartner(c.assureurActuel), pTo = matchPartner(A);
          if (!(pFrom && pTo && pFrom === pTo)) { list.push({ field: "assureur", from: c.assureurActuel, to: A, kind: "overwrite" }); bump("assureur", "overwrite"); }
        }
      }
    }
    // courtier
    const C = cleanStr(gr.courtier);
    if (C && !isMatera(C)) {
      if (!c.courtierActuel) { list.push({ field: "courtier", from: null, to: C, kind: "fill" }); bump("courtier", "fill"); }
      else if (norm(C) !== norm(c.courtierActuel)) { list.push({ field: "courtier", from: c.courtierActuel, to: C, kind: "overwrite" }); bump("courtier", "overwrite"); }
    }
    // numéro
    const N = cleanNum(gr.numeroContrat);
    if (N) {
      if (!c.numeroContrat) { list.push({ field: "numeroContrat", from: null, to: N, kind: "fill" }); bump("numeroContrat", "fill"); }
      else if (norm(N) !== norm(c.numeroContrat)) { list.push({ field: "numeroContrat", from: c.numeroContrat, to: N, kind: "overwrite" }); bump("numeroContrat", "overwrite"); }
    }
    // prime
    if (gr.montant != null && gr.montant >= PRIME_FLOOR && gr.montant <= PRIME_CEIL) {
      const gm = Math.round(gr.montant);
      if (c.primeActuelle == null) { list.push({ field: "primeActuelle", from: null, to: `${gm}`, kind: "fill" }); bump("primeActuelle", "fill"); }
      else if (Math.abs(c.primeActuelle - gm) / Math.max(c.primeActuelle, gm) > DIV) { list.push({ field: "primeActuelle", from: `${c.primeActuelle}`, to: `${gm}`, kind: "overwrite" }); bump("primeActuelle", "overwrite"); }
    }
    // échéance : uniquement si strictement plus récente
    if (gr.echeance) {
      if (!c.dateEcheance) { list.push({ field: "dateEcheance", from: null, to: dayKey(gr.echeance), kind: "fill" }); bump("dateEcheance", "fill"); }
      else if (dayKey(gr.echeance) !== dayKey(c.dateEcheance) && gr.echeance.getTime() > c.dateEcheance.getTime()) { list.push({ field: "dateEcheance", from: dayKey(c.dateEcheance), to: dayKey(gr.echeance), kind: "overwrite" }); bump("dateEcheance", "overwrite"); }
    }
    void estClos;
    if (list.length === 0) continue;
    const step = STEP_OF(statuts);
    recap.coprosChanged++;
    recap.byStep[step] = (recap.byStep[step] ?? 0) + 1;
    changes.push({ coproId: c.id, buildingId: c.buildingId, nom: c.nom, adresse: c.adresse ?? null, step, changes: list });
  }
  return { changes, recap };
}

const parseFields = (s: string | null): string[] => { try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; } };

// Applique un plan (écritures + événements d'audit). Retourne le nb de dossiers écrits.
export async function applyGhcOverwritePlan(rows: GhcRowIn[], changes: CoproChange[], actor: string, runLabel: string): Promise<{ written: number }> {
  const g = new Map(rows.map((r) => [r.buildingId, r]));
  const now = new Date();
  let written = 0;
  for (const ch of changes) {
    const gr = g.get(ch.buildingId);
    const data: Record<string, unknown> = {};
    const fields: string[] = [];
    for (const f of ch.changes) {
      if (f.field === "assureur") { data.assureurActuel = f.to; fields.push("assureur"); }
      else if (f.field === "courtier") { data.courtierActuel = f.to; fields.push("courtier"); }
      else if (f.field === "numeroContrat") { data.numeroContrat = f.to; fields.push("numero"); }
      else if (f.field === "primeActuelle") { data.primeActuelle = Number(f.to); fields.push("prime"); if (gr?.aVerifier != null) data.primeAVerifier = gr.aVerifier; }
      else if (f.field === "dateEcheance" && gr?.echeance) { data.dateEcheance = gr.echeance; data.echeanceVerrouilleLe = now; fields.push("echeance"); }
    }
    if (fields.length === 0) continue;
    data.contratVerrouilleLe = now;
    data.ghcImportedAt = now;
    const prev = await prisma.copro.findUnique({ where: { id: ch.coproId }, select: { ghcFields: true, donneePerimee: true, dateEcheance: true } });
    data.ghcFields = JSON.stringify([...new Set([...parseFields(prev?.ghcFields ?? null), ...fields])]);
    if (fields.includes("echeance") && gr?.echeance && prev?.donneePerimee && !isEcheancePerimee(gr.echeance)) data.donneePerimee = false;
    await prisma.copro.update({ where: { id: ch.coproId }, data });
    const desc = `GHC ${runLabel} (écrasement) — ${ch.changes.map((f) => `${f.field}${f.kind === "overwrite" ? " corrigé" : " ajouté"}: ${f.to}`).join(" · ")}`;
    const firstPipe = await prisma.insurancePipeline.findFirst({ where: { coproId: ch.coproId }, select: { id: true } });
    if (firstPipe) await prisma.pipelineEvent.create({ data: { pipelineId: firstPipe.id, type: "action_manuelle", description: desc.slice(0, 480), metadata: { auto: "ghc_overwrite", runLabel, fields }, createdBy: actor } });
    written++;
  }
  return { written };
}

// Lit la source GHC en base (table GhcContract).
export async function getGhcContractRows(): Promise<GhcRowIn[]> {
  const rows = await prisma.ghcContract.findMany();
  return rows.map((r) => ({ buildingId: r.buildingId, assureur: r.assureur, courtier: r.courtier, numeroContrat: r.numeroContrat, montant: r.montant, echeance: r.echeance, aVerifier: r.aVerifier }));
}

// Applique le mode écrasement PAR TRANCHE (le client boucle → barre de progression).
// À la dernière tranche, enregistre un run d'historique avec les compteurs du plan complet.
export async function applyGhcOverwriteChunk(actor: string, offset: number, limit: number): Promise<{ total: number; processed: number; done: boolean; recap: OverwriteRecap }> {
  const rows = await getGhcContractRows();
  const { changes, recap } = await planGhcOverwrite(rows, new Set());
  const slice = changes.slice(offset, offset + limit);
  await applyGhcOverwritePlan(rows, slice, actor, "écrasement");
  const done = offset + slice.length >= changes.length;
  if (done && changes.length > 0) {
    const bf = recap.byField;
    const sum = (f: string) => (bf[f]?.fill ?? 0) + (bf[f]?.overwrite ?? 0);
    await prisma.ghcImportRun.create({ data: {
      label: "écrasement", fileName: "GHC (écrasement des divergences)", createdBy: actor,
      dossiersClean: recap.coprosChanged, assureursMaj: sum("assureur"), primesMaj: sum("primeActuelle"),
      courtiersMaj: sum("courtier"), numerosMaj: sum("numeroContrat"), echeancesMaj: sum("dateEcheance"),
      versOdr: 0, versRs: 0, divergences: 0, casParticuliers: 0,
    } });
  }
  return { total: changes.length, processed: slice.length, done, recap };
}
