// Automatisation 6 « Comparer les devis & mail au CS » — logique des 3 volets.
// V1 : liste des comparaisons prêtes (contrat + devis + prime vérifiée + repéré
//      un devis recommandé) → passage au V2.
// V2 : prévisualisation + envoi en masse du mail au Conseil Syndical (à venir).
// V3 : suivi des propositions envoyées au CS.
//
// Périmètre = étape « Comparaison des devis » (statut devis_recus), hors ODR
// (jamais concernés), hors exclus/archivés.

import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";

function gestLabel(nom: string | null, email: string | null): string | null {
  if (nom?.trim()) return nom.trim();
  if (!email) return null;
  return email.split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export type Devis6Row = {
  pipelineId: string; nom: string; adresse: string | null; gestionnaire: string | null;
  hasContrat: boolean; hasDevis: boolean; nbDevis: number; primeVerifiee: boolean; comparaisonFaite: boolean;
  pret: boolean;
};
export type Devis6Volet1 = { total: number; prets: number; rows: Devis6Row[] };

export async function getDevis6Volet1Data(): Promise<Devis6Volet1> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: "devis_recus", coproId: { notIn: excl }, copro: { archivedAt: null },
      // Dossiers déjà passés au volet 2 → sortent de la liste V1.
      events: { none: { metadata: { path: ["devis6Volet"], equals: 2 } } },
    },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, primeActuelle: true, primeAVerifier: true, gestionnaireNom: true, gestionnaireEmail: true } },
      documents: { select: { kind: true } },
      devisRecus: { select: { recommande: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  const rows: Devis6Row[] = ps.map((p) => {
    const hasContrat = p.documents.some((d) => d.kind === "contrat_mri") || !!(p.contratActuelData && p.contratActuelData.trim());
    // « Devis » présent = soit un DevisRecu structuré (comparaison), soit au moins
    // un DOC de devis chargé (Devis AXA / Devis Mila) même sans données extraites.
    const devisDocs = p.documents.filter((d) => d.kind === "devis_axa" || d.kind === "devis_mila").length;
    const nbDevis = p.devisRecus.length + devisDocs;
    const hasDevis = nbDevis > 0;
    const primeVerifiee = p.copro.primeActuelle != null && !p.copro.primeAVerifier;
    const comparaisonFaite = p.devisRecus.some((d) => d.recommande);
    const pret = hasContrat && hasDevis && primeVerifiee && comparaisonFaite;
    return {
      pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
      gestionnaire: gestLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail),
      hasContrat, hasDevis, nbDevis, primeVerifiee, comparaisonFaite, pret,
    };
  });
  return { total: rows.length, prets: rows.filter((r) => r.pret).length, rows };
}

// Nb de dossiers prêts (tout au vert) encore en V1 = éligibles au passage V2.
export async function getDevis6PretsCount(): Promise<number> {
  return (await getDevis6Volet1Data()).prets;
}

// ─── Tableau unique de suivi (nouvelle structure Auto 6) ─────────────────────
// Une ligne par dossier à l'étape « Comparaison des devis » (statut devis_recus),
// hors exclus/archivés. Le « Prix actuel » (dernière prime payée) est récupéré
// côté client via /api/devis/prime-payee (source = mail de demande de devis).
export type Devis6Devis = { assureur: string; prime: number | null };
// Statut de la réponse du gestionnaire (prévenu de la proposition). Alimenté plus
// tard par un détecteur de réponses ; défaut « attente » tant qu'aucune réponse.
export type Devis6Statut = "attente" | "valide" | "refus" | "autre";
export type Devis6TableRow = {
  pipelineId: string; nom: string; adresse: string | null;
  gestionnaire: string | null; gestionnaireEmail: string | null;
  comparaisonFaite: boolean; statut: Devis6Statut; statutComment: string | null;
  envoyeLe: string | null; // date du dernier envoi au gestionnaire (Slack), sinon null
  // Prime du contrat (extraite du contrat MRI, sinon primeActuelle). Sert de base
  // AVEC la dernière prime payée (récupérée côté client) via resolvePrimeReference
  // — MÊME règle que la fiche dossier (garde le + haut dans la bande de cohérence).
  contratPrime: number | null;
  devis1: Devis6Devis | null; devis2: Devis6Devis | null;
};
export type Devis6Table = { total: number; faites: number; rows: Devis6TableRow[]; gestionnaires: string[] };

// primeTTC extraite du contrat comparé (contratActuelData JSON), si présente.
function parseContratPrime(raw: string | null): number | null {
  if (!raw) return null;
  try { const d = JSON.parse(raw) as { primeTTC?: unknown }; return typeof d.primeTTC === "number" ? d.primeTTC : null; } catch { return null; }
}

export async function getDevis6TableData(): Promise<Devis6Table> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: { statut: "devis_recus", coproId: { notIn: excl }, copro: { archivedAt: null } },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, primeActuelle: true, gestionnaireNom: true, gestionnaireEmail: true } },
      devisRecus: { orderBy: { createdAt: "asc" }, select: { assureur: true, primeTTC: true, data: true } },
      // Réponse gestionnaire (→ Statut) + dernier envoi Slack (→ état « Envoyé »).
      events: { where: { OR: [
        { metadata: { path: ["auto"], equals: "devis6_gestio_response" } },
        { metadata: { path: ["auto"], equals: "devis6_notify_gestionnaire" } },
      ] }, orderBy: { createdAt: "desc" }, select: { metadata: true, createdAt: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  const autoOf = (m: unknown): string | undefined => (m as { auto?: string } | null)?.auto;
  const rows: Devis6TableRow[] = ps.map((p) => {
    const dv = p.devisRecus;
    const toDevis = (d: { assureur: string; primeTTC: number } | undefined): Devis6Devis | null =>
      d ? { assureur: d.assureur, prime: d.primeTTC ?? null } : null;
    const resp = (p.events.find((e) => autoOf(e.metadata) === "devis6_gestio_response")?.metadata ?? null) as { reponse?: string; comment?: string } | null;
    const notif = p.events.find((e) => autoOf(e.metadata) === "devis6_notify_gestionnaire");
    const statut: Devis6Statut = resp?.reponse === "valide" ? "valide" : resp?.reponse === "refus" ? "refus" : "attente";
    return {
      pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
      gestionnaire: gestLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail),
      gestionnaireEmail: p.copro.gestionnaireEmail,
      // Comparaison faite = une extraction Claude structurée existe (≥ 1 devis avec data).
      comparaisonFaite: dv.some((d) => !!(d.data && d.data.trim())),
      statut, statutComment: resp?.comment ?? null,
      envoyeLe: notif?.createdAt?.toISOString() ?? null,
      contratPrime: parseContratPrime(p.contratActuelData) ?? p.copro.primeActuelle,
      devis1: toDevis(dv[0]), devis2: toDevis(dv[1]),
    };
  });
  const gestionnaires = [...new Set(rows.map((r) => r.gestionnaire).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, "fr"));
  return { total: rows.length, faites: rows.filter((r) => r.comparaisonFaite).length, rows, gestionnaires };
}

// Passe au volet 2 tous les dossiers prêts (marqueur event devis6Volet=2).
export async function passDevis6ToVolet2(actorEmail: string): Promise<{ passed: number }> {
  const { rows } = await getDevis6Volet1Data();
  const prets = rows.filter((r) => r.pret);
  for (const r of prets) {
    await prisma.pipelineEvent.create({
      data: { pipelineId: r.pipelineId, type: "action_manuelle", description: `${r.nom} — comparaison prête, passage au volet 2 (mail CS)`, metadata: { devis6Volet: 2 }, createdBy: actorEmail },
    });
  }
  return { passed: prets.length };
}

// ─── Volet 2 : file d'attente + envoi mail CS ────────────────────────────────
export type CsMember = { name: string; email: string };
export type Devis6Volet2Row = {
  pipelineId: string; nom: string; adresse: string | null; passedAt: string; buildingId: string | null;
  csMembers: CsMember[]; csMembersSyncedAt: string | null; contactCsEmail: string | null;
  recoAssureur: string | null; recoPrime: number | null; primeActuelle: number | null; economie: number | null;
};
export type Devis6Volet2 = { count: number; avecMembres: number; materaConfigure: boolean; rows: Devis6Volet2Row[] };

function parseCsMembers(raw: string | null): CsMember[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((m) => m?.email) : []; } catch { return []; }
}

async function getVolet2PipelineIds(): Promise<string[]> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["devis6Volet"], equals: 2 }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null }, statut: "devis_recus" } },
    select: { pipelineId: true }, distinct: ["pipelineId"],
  });
  return ev.map((e) => e.pipelineId);
}

export async function getDevis6Volet2Data(): Promise<Devis6Volet2> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["devis6Volet"], equals: 2 }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null }, statut: "devis_recus" } },
    select: {
      createdAt: true, pipelineId: true,
      pipeline: { select: { copro: { select: { nom: true, adresse: true, buildingId: true, primeActuelle: true, contactCsEmail: true, csMembersData: true, csMembersSyncedAt: true } }, devisRecus: { where: { recommande: true }, select: { assureur: true, primeTTC: true }, take: 1 } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const rows: Devis6Volet2Row[] = [];
  for (const e of ev) {
    if (seen.has(e.pipelineId)) continue;
    seen.add(e.pipelineId);
    const c = e.pipeline!.copro;
    const reco = e.pipeline!.devisRecus[0] ?? null;
    const prime = c.primeActuelle;
    rows.push({
      pipelineId: e.pipelineId, nom: c.nom, adresse: c.adresse, passedAt: e.createdAt.toISOString(), buildingId: c.buildingId,
      csMembers: parseCsMembers(c.csMembersData), csMembersSyncedAt: c.csMembersSyncedAt?.toISOString() ?? null, contactCsEmail: c.contactCsEmail,
      recoAssureur: reco?.assureur ?? null, recoPrime: reco?.primeTTC ?? null, primeActuelle: prime,
      economie: reco && prime != null ? Math.round(prime - reco.primeTTC) : null,
    });
  }
  return {
    count: rows.length, avecMembres: rows.filter((r) => r.csMembers.length > 0).length,
    materaConfigure: !!process.env.MATERA_API_TOKEN, rows,
  };
}

// Récupère les membres du CS (Matera, role=council) pour les dossiers du volet 2
// et les met en cache sur la copro. Renvoie un résumé + une éventuelle raison
// d'échec (token Matera absent → materaConfigure=false).
export async function fetchCsMembersVolet2(): Promise<{ processed: number; withMembers: number; totalMembers: number; materaConfigure: boolean; error?: string }> {
  if (!process.env.MATERA_API_TOKEN) return { processed: 0, withMembers: 0, totalMembers: 0, materaConfigure: false, error: "MATERA_API_TOKEN non configuré côté serveur." };
  const { getCouncilMembers } = await import("@/lib/matera");
  const ids = await getVolet2PipelineIds();
  const ps = await prisma.insurancePipeline.findMany({ where: { id: { in: ids } }, select: { coproId: true, copro: { select: { buildingId: true } } } });
  let withMembers = 0, totalMembers = 0;
  for (const p of ps) {
    if (!p.copro.buildingId) continue;
    try {
      const members = await getCouncilMembers(p.copro.buildingId);
      await prisma.copro.update({ where: { id: p.coproId }, data: { csMembersData: JSON.stringify(members), csMembersSyncedAt: new Date() } });
      if (members.length) { withMembers++; totalMembers += members.length; }
    } catch { /* immeuble sans accès / erreur ponctuelle → on continue */ }
  }
  return { processed: ps.length, withMembers, totalMembers, materaConfigure: true };
}

// ─── Volet 3 : suivi des propositions envoyées au CS ─────────────────────────
// Une proposition est réellement « envoyée » UNIQUEMENT quand un mail de reco a
// été émis (event recoType=reco_sent, avec conversationId Front). Le simple
// passage de statut envoye_cs ne compte PAS (peut être un changement manuel).
// « recus » = réponses du CS → à venir (détection non branchée). « sansReponse10j »
// = mail envoyé depuis ≥ 10 jours.
const FRONT_CONV = (cid: string | null) => (cid ? `https://app.frontapp.com/open/${cid}` : null);
export type Devis6SuiviRow = { pipelineId: string; nom: string; adresse: string | null; sentAt: string; jours: number; to: string | null; convUrl: string | null };
export type Devis6Suivi = { envoyees: number; recus: number; sansReponse10j: number; rows: Devis6SuiviRow[] };

export async function getDevis6Volet3Data(nowMs: number): Promise<Devis6Suivi> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["recoType"], equals: "reco_sent" }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null } } },
    select: { createdAt: true, metadata: true, pipelineId: true, pipeline: { select: { copro: { select: { nom: true, adresse: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const byPipe = new Map<string, { pipelineId: string; nom: string; adresse: string | null; sentAt: Date; to: string | null; cid: string | null }>();
  for (const e of ev) {
    const m = (e.metadata ?? {}) as { to?: string; conversationId?: string };
    const g = byPipe.get(e.pipelineId);
    if (!g) byPipe.set(e.pipelineId, { pipelineId: e.pipelineId, nom: e.pipeline?.copro.nom ?? "?", adresse: e.pipeline?.copro.adresse ?? null, sentAt: e.createdAt, to: m.to ?? null, cid: m.conversationId ?? null });
    else if (e.createdAt < g.sentAt) { g.sentAt = e.createdAt; g.to = m.to ?? g.to; g.cid = m.conversationId ?? g.cid; }
  }
  const rows: Devis6SuiviRow[] = [...byPipe.values()].map((g) => ({
    pipelineId: g.pipelineId, nom: g.nom, adresse: g.adresse, sentAt: g.sentAt.toISOString(),
    jours: Math.floor((nowMs - g.sentAt.getTime()) / 86400000), to: g.to, convUrl: FRONT_CONV(g.cid),
  })).sort((a, b) => b.jours - a.jours);
  return { envoyees: rows.length, recus: 0, sansReponse10j: rows.filter((r) => r.jours >= 10).length, rows };
}
