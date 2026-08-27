// Automatisation 1 — Volet 2 « Identification des dossiers ».
// Passe en revue les dossiers à l'étape « Identification » et propose un ROUTAGE
// à partir des données DÉJÀ présentes (aucun appel Front) :
//   - assureur propre + PARTENAIRE            → ODR en cours
//   - assureur propre + courtier présent      → RS en cours
//   - sinon                                    → reste en Identification
// Le routage n'est appliqué qu'après validation humaine (bouton « Valider »).
// Historique reconstruit depuis les events (metadata.auto = "identify_scan",
// groupés par batchId) → pas de nouvelle table Prisma.

import { prisma } from "@/lib/prisma";
import { matchPartner, looksLikeCourtierValue } from "@/lib/front-insurance";
import { getExcludedCoproIds } from "@/lib/exclusions";
import type { PipelineStatut } from "@/generated/prisma/client";

export type IdentifyVerdict = "odr" | "rs" | "manquant";
export type IdentifyTarget = "odr_en_cours" | "rs_en_cours" | "identifie";

export type IdentifyRow = {
  pipelineId: string;
  nom: string;
  adresse: string | null;
  assureur: string | null;
  courtier: string | null;
  numeroContrat: string | null;
  verdict: IdentifyVerdict;
  target: IdentifyTarget;
  raison: string;
};

type CoproVerdictInput = {
  assureurActuel: string | null;
  courtierActuel: string | null;
};

// Valeurs « bidon » fréquentes dans les champs (import Omni) → à traiter comme vides.
const PLACEHOLDERS = new Set(["non", "oui", "n/a", "na", "-", "--", "néant", "neant", "aucun", "aucune", "rien", "inconnu", "inconnue", "?", "nc", "sans", "tbd", "x"]);
function cleanValue(v: string | null | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  if (PLACEHOLDERS.has(t.toLowerCase())) return null;
  if (t.replace(/[^a-zA-Z0-9]/g, "").length < 2) return null; // trop court / que de la ponctuation
  return t;
}

// Décision de routage à partir des seules données stockées (pas de Front).
export function computeIdentifyVerdict(c: CoproVerdictInput): { verdict: IdentifyVerdict; target: IdentifyTarget; raison: string } {
  const A = cleanValue(c.assureurActuel);
  const C = cleanValue(c.courtierActuel);
  const aLow = (A ?? "").toLowerCase();
  const cLow = (C ?? "").toLowerCase();

  const assureurEstCourtier = looksLikeCourtierValue(A);
  // "Matera" (syndic) et "Matera Assurance" (probable Wakam) : le champ assureur
  // n'est pas un porteur MRI externe exploitable → on ne route pas.
  const assureurEstMatera = aLow.includes("matera");
  // WAKAM = on était l'assureur avant (churn / reprise) → traitement manuel, pas RS.
  const assureurEstWakam = aLow.includes("wakam");
  const assureurClean = !!A && !assureurEstCourtier && !assureurEstMatera && !assureurEstWakam;
  const partner = matchPartner(A);
  // Courtier exploitable pour une demande de RS : présent et PAS nous (Matera).
  const courtierEstMatera = cLow.includes("matera");
  const courtierClean = !!C && !courtierEstMatera;

  if (assureurClean && partner) {
    return { verdict: "odr", target: "odr_en_cours", raison: `Assureur partenaire identifié (${A})` };
  }
  if (assureurClean && !partner && courtierClean) {
    return { verdict: "rs", target: "rs_en_cours", raison: `Assureur (${A}) + courtier (${C}) identifiés` };
  }

  // Sinon : on explique pourquoi ça reste en Identification.
  const bits: string[] = [];
  if (!A) bits.push("assureur manquant");
  else if (assureurEstCourtier) bits.push(`champ assureur = courtier (« ${A} »)`);
  else if (assureurEstMatera) bits.push(`assureur = « ${A} » (Matera — à vérifier)`);
  else if (assureurEstWakam) bits.push(`assureur = Wakam (« ${A} » — on était l'assureur, à traiter à la main)`);
  else if (!partner && !C) bits.push("courtier manquant (assureur non partenaire)");
  else if (!partner && courtierEstMatera) bits.push(`courtier = Matera (« ${C} ») — pas un courtier externe`);
  return { verdict: "manquant", target: "identifie", raison: bits.join(" · ") || "infos insuffisantes" };
}

// Filtre commun : dossiers réellement à l'étape Identification, actifs, non exclus,
// hors clients MRI existants (hors Wakam) — même périmètre que le remplissage.
async function identifyWhere() {
  const excludedIds = await getExcludedCoproIds();
  return {
    statut: "identifie" as const,
    coproId: { notIn: excludedIds },
    copro: {
      archivedAt: null,
      NOT: {
        clientMriStatut: "Insurance client",
        NOT: { assureurActuel: { contains: "wakam", mode: "insensitive" as const } },
      },
    },
  };
}

export async function countIdentifyDossiers(): Promise<number> {
  return prisma.insurancePipeline.count({ where: await identifyWhere() });
}

// Scanne une PAGE de dossiers (offset/limit) et renvoie leur verdict + le total.
export async function scanIdentifyPage(offset: number, limit: number): Promise<{ total: number; rows: IdentifyRow[] }> {
  const where = await identifyWhere();
  const [total, pipelines] = await Promise.all([
    prisma.insurancePipeline.count({ where }),
    prisma.insurancePipeline.findMany({
      where,
      select: {
        id: true,
        copro: { select: { nom: true, adresse: true, assureurActuel: true, courtierActuel: true, numeroContrat: true } },
      },
      orderBy: { id: "asc" },
      skip: offset,
      take: limit,
    }),
  ]);
  const rows: IdentifyRow[] = pipelines.map((p) => {
    const v = computeIdentifyVerdict(p.copro);
    return {
      pipelineId: p.id,
      nom: p.copro.nom,
      adresse: p.copro.adresse,
      assureur: p.copro.assureurActuel,
      courtier: p.copro.courtierActuel,
      numeroContrat: p.copro.numeroContrat,
      verdict: v.verdict,
      target: v.target,
      raison: v.raison,
    };
  });
  return { total, rows };
}

// Applique le routage VALIDÉ : ne bouge que les dossiers encore en « identifie »
// (garde-fou anti-concurrence) et vers une cible ODR/RS. Event action_manuelle →
// verrou anti-Omni + traçabilité (metadata.auto/batchId pour l'historique).
export async function applyIdentifyMoves(
  items: Array<{ pipelineId: string; target: IdentifyTarget }>,
  actor: string,
  batchId: string,
): Promise<{ moved: number; odr: number; rs: number; ignores: number }> {
  let odr = 0;
  let rs = 0;
  let ignores = 0;

  for (const it of items) {
    if (it.target !== "odr_en_cours" && it.target !== "rs_en_cours") { ignores++; continue; }
    const p = await prisma.insurancePipeline.findUnique({ where: { id: it.pipelineId }, select: { statut: true, copro: { select: { assureurActuel: true } } } });
    if (!p || p.statut !== "identifie") { ignores++; continue; }

    const desc =
      it.target === "odr_en_cours"
        ? `Volet 2 (identification) validé → ODR en cours (assureur partenaire : ${p.copro.assureurActuel ?? "?"})`
        : `Volet 2 (identification) validé → RS en cours (assureur : ${p.copro.assureurActuel ?? "?"})`;

    await prisma.$transaction([
      prisma.insurancePipeline.update({ where: { id: it.pipelineId }, data: { statut: it.target as PipelineStatut } }),
      prisma.pipelineEvent.create({
        data: {
          pipelineId: it.pipelineId,
          type: "action_manuelle",
          ancienStatut: "identifie",
          nouveauStatut: it.target,
          description: desc,
          metadata: { auto: "identify_scan", batchId, target: it.target },
          createdBy: actor,
        },
      }),
    ]);
    if (it.target === "odr_en_cours") odr++; else rs++;
  }

  return { moved: odr + rs, odr, rs, ignores };
}

export type IdentifyHistoryEntry = { batchId: string; date: Date; odr: number; rs: number; total: number; by: string };

// Historique des validations, reconstruit depuis les events (groupés par batchId).
export async function getIdentifyHistory(limit = 20): Promise<IdentifyHistoryEntry[]> {
  const evs = await prisma.pipelineEvent.findMany({
    where: { type: "action_manuelle", metadata: { path: ["auto"], equals: "identify_scan" } },
    select: { createdAt: true, createdBy: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const byBatch = new Map<string, IdentifyHistoryEntry>();
  for (const e of evs) {
    const m = e.metadata as { batchId?: string; target?: string } | null;
    const batchId = m?.batchId;
    if (!batchId) continue;
    const cur = byBatch.get(batchId) ?? { batchId, date: e.createdAt, odr: 0, rs: 0, total: 0, by: e.createdBy ?? "?" };
    if (m?.target === "odr_en_cours") cur.odr++;
    else if (m?.target === "rs_en_cours") cur.rs++;
    cur.total = cur.odr + cur.rs;
    if (e.createdAt > cur.date) cur.date = e.createdAt;
    byBatch.set(batchId, cur);
  }
  return [...byBatch.values()].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
}
