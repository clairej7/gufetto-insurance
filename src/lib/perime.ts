// Automatisation 8 — composant « clean avis d'échéance » (données périmées).
// Repère les dossiers dont l'échéance est dépassée depuis plusieurs mois/années
// (import Omni ancien → donnée jugée périmée), pose un flag `donneePerimee`, et
// tente de récupérer une donnée plus récente dans Front (assureur / courtier /
// prime / échéance) via le moteur d'aiguillage de l'automatisation 1. Si trouvé :
// remplit + aiguille le statut + retire le flag. Sinon : le dossier reste flagué.
//
// Protection Omni : l'aiguillage passe par applyAutofill en « action_manuelle »
// (verrou statut) ; la prime et l'échéance récupérées posent leurs cliquets
// (contratVerrouilleLe / echeanceVerrouilleLe) → la synchro nocturne ne les écrase pas.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { categoriseDossier, getDaysUntilEcheance, type DossierBucket } from "@/lib/pipeline";
import { applyAutofill } from "@/lib/rs-autofill-core";
import { getPrimeFromFrontDocs } from "@/lib/front-insurance";

// Échéance « périmée » : dépassée depuis plus de ~6 mois. En-deçà, c'est souvent un
// simple renouvellement en cours, pas une donnée périmée.
export const PERIME_SEUIL_JOURS = 183;

// Un dossier « périmable » est ACTIF (ni clos, ni perdu, ni gagné/signé).
const ACTIVE_BUCKETS: DossierBucket[] = ["urgent", "autre", "odr", "odr_envoye"];

export function isEcheancePerimee(dateEcheance: Date | null): boolean {
  const d = getDaysUntilEcheance(dateEcheance);
  return d !== null && d <= -PERIME_SEUIL_JOURS;
}

type PerimeCandidate = { coproId: string; qualifie: boolean };

// Recalcule quels dossiers sont périmés et réconcilie le flag : pose-le sur les
// dossiers concernés, retire-le sur ceux qui ne le sont plus (échéance rafraîchie
// par Omni, dossier clos, etc.). Ne re-flague jamais un dossier déjà résolu.
export async function findPerimeeDossiers(): Promise<{ flagged: number; unflagged: number; concerned: number }> {
  const rows = await prisma.insurancePipeline.findMany({
    where: { copro: { archivedAt: null } },
    select: {
      statut: true,
      copro: {
        select: { id: true, dateEcheance: true, clientMriStatut: true, assureurActuel: true, donneePerimee: true, perimeeResolvedAt: true },
      },
    },
  });

  // Agrège par copro : périmé si AU MOINS un pipeline actif est périmé, et jamais résolu.
  const byCopro = new Map<string, PerimeCandidate & { flagged: boolean; resolved: boolean }>();
  for (const r of rows) {
    const c = r.copro;
    const bucket = categoriseDossier({ statut: r.statut, dateEcheance: c.dateEcheance, clientMriStatut: c.clientMriStatut, assureurActuel: c.assureurActuel });
    const qualifie = ACTIVE_BUCKETS.includes(bucket) && isEcheancePerimee(c.dateEcheance) && !c.perimeeResolvedAt;
    const prev = byCopro.get(c.id);
    if (prev) prev.qualifie = prev.qualifie || qualifie;
    else byCopro.set(c.id, { coproId: c.id, qualifie, flagged: c.donneePerimee, resolved: !!c.perimeeResolvedAt });
  }

  const aFlaguer = [...byCopro.values()].filter((v) => v.qualifie && !v.flagged).map((v) => v.coproId);
  const aRetirer = [...byCopro.values()].filter((v) => !v.qualifie && v.flagged).map((v) => v.coproId);

  if (aFlaguer.length) await prisma.copro.updateMany({ where: { id: { in: aFlaguer } }, data: { donneePerimee: true } });
  if (aRetirer.length) await prisma.copro.updateMany({ where: { id: { in: aRetirer } }, data: { donneePerimee: false } });

  const concerned = [...byCopro.values()].filter((v) => v.qualifie).length;
  return { flagged: aFlaguer.length, unflagged: aRetirer.length, concerned };
}

// Compteurs live pour l'interface admin.
export async function computePerimeState(): Promise<{ concerned: number; untried: number; resolved: number }> {
  const [concerned, untried, resolved] = await Promise.all([
    prisma.copro.count({ where: { archivedAt: null, donneePerimee: true } }),
    prisma.copro.count({ where: { archivedAt: null, donneePerimee: true, perimeeVerifTenteLe: null } }),
    prisma.copro.count({ where: { archivedAt: null, perimeeResolvedAt: { not: null } } }),
  ]);
  return { concerned, untried, resolved };
}

export type PerimeCleanRow = {
  date: string; // ISO
  concerned: number;
  resolvedTotal: number;
  resolved: number; // dossiers dé-périmés par ce run
};

// Enregistre un instantané (fin de run). `resolved` calculé en DELTA vs le dernier
// instantané → robuste à une interruption (refresh). Baseline (1er) = delta nul.
export async function recordPerimeCleanSnapshot(createdBy: string | null): Promise<void> {
  const s = await computePerimeState();
  const last = await prisma.perimeCleanRun.findFirst({ orderBy: { createdAt: "desc" } });
  const resolved = last ? Math.max(0, s.resolved - last.resolvedTotal) : 0;
  await prisma.perimeCleanRun.create({
    data: { concerned: s.concerned, resolvedTotal: s.resolved, resolved, createdBy },
  });
}

// Crée la baseline du jour si l'historique est vide.
export async function ensurePerimeBaseline(): Promise<void> {
  if ((await prisma.perimeCleanRun.count()) === 0) await recordPerimeCleanSnapshot(null);
}

export async function getPerimeCleanHistory(): Promise<PerimeCleanRow[]> {
  const rows = await prisma.perimeCleanRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({ date: r.createdAt.toISOString(), concerned: r.concerned, resolvedTotal: r.resolvedTotal, resolved: r.resolved }));
}

export type PerimeeRecoveryResult = {
  resolved: boolean;
  moved: boolean;
  targetStatut: string;
  assureur: string | null;
  primeMontant: number | null;
  echeanceRefreshed: boolean;
  reason: string;
};

// Tente de récupérer une donnée plus récente pour UN dossier périmé et met à jour
// le flag / le statut en conséquence. Réutilise le moteur de l'automatisation 1.
export async function applyPerimeeRecovery(pipelineId: string, actorEmail: string): Promise<PerimeeRecoveryResult> {
  const pipeline = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { copro: { select: { id: true, buildingId: true, nom: true, adresse: true, primeActuelle: true, dateEcheance: true, perimeeResolvedAt: true } } },
  });
  if (!pipeline?.copro) {
    return { resolved: false, moved: false, targetStatut: "identifie", assureur: null, primeMontant: null, echeanceRefreshed: false, reason: "dossier introuvable" };
  }
  const copro = pipeline.copro;
  const now = new Date();

  // 1) Moteur d'aiguillage (automatisation 1) : écrit assureur/courtier/n°/mail
  //    trouvés dans Front + cliquet contrat, et aiguille identifie→RS/ODR. Event
  //    « action_manuelle » → verrou statut face à Omni.
  const r = await applyAutofill(pipelineId, actorEmail, "action_manuelle");

  // 2) Prime + prochaine échéance depuis les avis d'échéance Front.
  const prime = await getPrimeFromFrontDocs(copro.buildingId ?? "", [copro.adresse, copro.nom]);

  const data: Record<string, unknown> = { perimeeVerifTenteLe: now };
  let primeMontant: number | null = null;
  let echeanceRefreshed = false;

  // Prime : n'écrit que si le dossier n'en avait pas (fill-if-empty) + cliquet contrat.
  if (prime.montant && prime.confidence && copro.primeActuelle == null) {
    data.primeActuelle = prime.montant;
    data.primeAVerifier = prime.confidence === "unsure";
    data.contratVerrouilleLe = now;
    primeMontant = prime.montant;
  }
  // Échéance : n'écrit que si strictement plus récente que l'actuelle (dé-périmage)
  //  + cliquet échéance pour qu'Omni ne la réécrase pas.
  if (prime.echeance && (!copro.dateEcheance || prime.echeance.getTime() > copro.dateEcheance.getTime())) {
    data.dateEcheance = prime.echeance;
    data.echeanceVerrouilleLe = now;
    echeanceRefreshed = true;
  }

  const resolved = r.moved || r.wroteFields || primeMontant != null || echeanceRefreshed;
  if (resolved) {
    data.donneePerimee = false;
    if (!copro.perimeeResolvedAt) data.perimeeResolvedAt = now;
  }

  await prisma.copro.update({ where: { id: copro.id }, data });

  // Note d'audit (une ligne lisible) quand quelque chose a bougé.
  if (resolved) {
    const bits: string[] = [];
    if (r.moved) bits.push(`aiguillé → ${r.targetStatut}${r.assureur ? ` (${r.assureur})` : ""}`);
    else if (r.wroteFields) bits.push("champs contrat mis à jour");
    if (primeMontant != null) bits.push(`prime ${primeMontant} €${prime.confidence === "unsure" ? " (à vérifier)" : ""}`);
    if (echeanceRefreshed) bits.push(`échéance → ${prime.echeance!.toISOString().slice(0, 10)}`);
    await prisma.pipelineEvent.create({
      data: {
        pipelineId,
        type: "action_manuelle",
        description: `Donnée périmée résolue depuis Front : ${bits.join(" · ")}`,
        createdBy: actorEmail,
      },
    });
  }

  revalidatePath(`/pipeline/${pipelineId}`);
  return {
    resolved,
    moved: r.moved,
    targetStatut: r.targetStatut,
    assureur: r.assureur,
    primeMontant,
    echeanceRefreshed,
    reason: resolved ? "donnée plus récente trouvée" : "rien de plus récent dans Front",
  };
}
