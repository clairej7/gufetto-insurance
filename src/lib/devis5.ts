// Automatisation 5 « Demande de devis » — Volet 1 : centralise les dossiers
// concernés dans une base défilable.
//
// Périmètre : dossiers à l'étape « Demande de devis » (devis_demandes) ou
// « Comparaison des devis » (devis_recus), MAIS on EXCLUT ceux dont la
// comparaison/demande est déjà lancée = un devis a déjà été envoyé
// (event devisType=devis_sent). Objectif : ne lister que ce qu'il reste à traiter.

import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { captureDocsForPipeline, captureReplyDocs, isDevisFilename } from "@/lib/rs-docs";
import { fieldPresence, extractDevisInfoForPipeline, type DevisFieldKey } from "@/lib/devis-info";

export type Devis5Row = {
  pipelineId: string;
  nom: string;
  adresse: string | null;
  assureur: string | null;
  numeroContrat: string | null;
  prime: number | null;
  courtier: string | null;
  gestionnaire: string | null;
  hasRs: boolean;
  hasContrat: boolean;
};

// prets = RS + contrat présents ; docsManquants = au moins un des deux absent.
export type Devis5Data = { total: number; prets: number; docsManquants: number; rows: Devis5Row[] };

function gestLabel(nom: string | null, email: string | null): string | null {
  if (nom?.trim()) return nom.trim();
  if (!email) return null;
  return email.split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export async function getDevis5Volet1Data(): Promise<Devis5Data> {
  // Périmètre = étape « Demande de devis » (devis_demandes) uniquement, hors devis
  // déjà envoyé, hors exclus/archivés. La comparaison (devis_recus) est une étape à part.
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: "devis_demandes", coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null },
      AND: [
        { events: { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } } },
        // Dossiers déjà « passés au volet 2 » : sortent de la liste V1.
        { events: { none: { metadata: { path: ["devis5Volet"], equals: 2 } } } },
      ],
    },
    select: {
      id: true,
      copro: { select: { nom: true, adresse: true, assureurActuel: true, numeroContrat: true, primeActuelle: true, courtierActuel: true, gestionnaireNom: true, gestionnaireEmail: true } },
      documents: { select: { kind: true } },
    },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  const rows: Devis5Row[] = ps.map((p) => ({
    pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
    assureur: p.copro.assureurActuel, numeroContrat: p.copro.numeroContrat, prime: p.copro.primeActuelle,
    courtier: p.copro.courtierActuel, gestionnaire: gestLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail),
    hasRs: p.documents.some((d) => d.kind === "rs"), hasContrat: p.documents.some((d) => d.kind === "contrat_mri"),
  }));
  return {
    total: rows.length,
    prets: rows.filter((r) => r.hasRs && r.hasContrat).length,
    docsManquants: rows.filter((r) => !r.hasRs || !r.hasContrat).length,
    rows,
  };
}

// Ids des dossiers du Volet 1 ENCORE SANS documents (à charger), ordonnés. Ainsi
// « charger 5 » avance sur les restants au lieu de retraiter les mêmes.
async function getDevis5Volet1Ids(): Promise<string[]> {
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: { in: ["devis_demandes", "devis_recus"] }, coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null },
      // On garde les « devis déjà envoyé » : leurs PJ (RS/contrat) sont récupérables
      // depuis le mail sortant → captureDocsForPipeline sait les rapatrier.
      documents: { none: {} },
      docsCheckedAt: null, // déjà tenté sans résultat → hors file (évite la boucle)
    },
    select: { id: true },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  return ps.map((p) => p.id);
}

// Nb de dossiers du Volet 1 restant à charger (sans docs, jamais tentés).
export async function getDevis5DocsToLoad(): Promise<number> {
  return (await getDevis5Volet1Ids()).length;
}

// Dossiers du Volet 1 tentés mais SANS document trouvé (à traiter à la main).
export async function getDevis5NoDocs(): Promise<{ pipelineId: string; nom: string; adresse: string | null; checkedAt: string }[]> {
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: { in: ["devis_demandes", "devis_recus"] }, coproId: { notIn: await getExcludedCoproIds() }, copro: { archivedAt: null },
      documents: { none: {} },
      docsCheckedAt: { not: null },
    },
    select: { id: true, docsCheckedAt: true, copro: { select: { nom: true, adresse: true } } },
    orderBy: { docsCheckedAt: "desc" },
  });
  return ps.map((p) => ({ pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse, checkedAt: p.docsCheckedAt!.toISOString() }));
}

// Chargement en masse des documents (RS / contrat MRI) depuis Front → Gufetto,
// par lots. Idempotent (les docs déjà stockés sont ignorés).
export async function loadDevis5Docs(offset: number, limit: number): Promise<{ total: number; processed: number; nextOffset: number; done: boolean; created: number; withDocs: number }> {
  const ids = await getDevis5Volet1Ids();
  const slice = ids.slice(offset, offset + limit);
  let created = 0, withDocs = 0;
  for (const id of slice) {
    const r = await captureDocsForPipeline(id, "auto:devis5_load");
    created += r.created;
    if (r.created > 0) withDocs++;
  }
  const nextOffset = offset + slice.length;
  return { total: ids.length, processed: slice.length, nextOffset, done: nextOffset >= ids.length, created, withDocs };
}

// ─── Passage au Volet 2 ──────────────────────────────────────────────────────
// Un dossier est « complet » = il a AU MOINS un doc RS ET un doc contrat MRI.
// « Passer au volet 2 » pose un marqueur (event devis5Volet=2) : le dossier
// quitte le Volet 1 et entre dans la file du Volet 2 (récupération des infos).

// Nb de dossiers complets encore en Volet 1 (= éligibles au passage).
export async function getDevis5CompletsCount(): Promise<number> {
  const excl = await getExcludedCoproIds();
  return prisma.insurancePipeline.count({
    where: {
      statut: "devis_demandes", coproId: { notIn: excl }, copro: { archivedAt: null },
      AND: [
        { events: { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } } },
        { events: { none: { metadata: { path: ["devis5Volet"], equals: 2 } } } },
        { documents: { some: { kind: "rs" } } },
        { documents: { some: { kind: "contrat_mri" } } },
      ],
    },
  });
}

// Pose le marqueur sur tous les dossiers complets encore en Volet 1.
export async function passDevis5CompletsToVolet2(actorEmail: string): Promise<{ passed: number }> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      statut: "devis_demandes", coproId: { notIn: excl }, copro: { archivedAt: null },
      AND: [
        { events: { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } } },
        { events: { none: { metadata: { path: ["devis5Volet"], equals: 2 } } } },
        { documents: { some: { kind: "rs" } } },
        { documents: { some: { kind: "contrat_mri" } } },
      ],
    },
    select: { id: true, copro: { select: { nom: true } } },
  });
  for (const p of ps) {
    await prisma.pipelineEvent.create({
      data: { pipelineId: p.id, type: "action_manuelle", description: `${p.copro.nom} — passage au volet 2 (RS + contrat complets)`, metadata: { devis5Volet: 2 }, createdBy: actorEmail },
    });
  }
  return { passed: ps.length };
}

export type Devis5Volet2Row = { pipelineId: string; nom: string; adresse: string | null; passedAt: string; present: Record<DevisFieldKey, boolean>; nb: number };
export type Devis5Volet2 = { count: number; complets: number; taux: number; toFill: number; rows: Devis5Volet2Row[] };

// Dossiers passés au Volet 2 (marqueur), avec état de complétion des 8 champs.
export async function getDevis5Volet2Data(): Promise<Devis5Volet2> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    // Exclut les dossiers dont la demande de devis a DÉJÀ été envoyée (event
    // devis_sent) : ils sont passés au suivi (Volet 4), ils n'ont plus rien à
    // faire au Volet 2 (préparation des infos).
    where: { metadata: { path: ["devis5Volet"], equals: 2 }, pipeline: { statut: "devis_demandes", coproId: { notIn: excl }, copro: { archivedAt: null }, events: { none: { metadata: { path: ["devisType"], equals: "devis_sent" } } } } },
    select: { createdAt: true, pipelineId: true, pipeline: { select: { copro: { select: { nom: true, adresse: true, primeActuelle: true, surfaceDeveloppee: true, periodeConstruction: true, natureOccupation: true, activitesAggravantes: true, caracteristiquesParticulieres: true, proportionInoccupee: true, protectionJuridique: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const rows: Devis5Volet2Row[] = [];
  for (const e of ev) {
    if (seen.has(e.pipelineId)) continue;
    seen.add(e.pipelineId);
    const c = e.pipeline!.copro;
    const present = fieldPresence(c);
    rows.push({ pipelineId: e.pipelineId, nom: c.nom, adresse: c.adresse, passedAt: e.createdAt.toISOString(), present, nb: Object.values(present).filter(Boolean).length });
  }
  const complets = rows.filter((r) => r.nb === 8).length;
  return { count: rows.length, complets, taux: rows.length ? Math.round((complets / rows.length) * 100) : 0, toFill: rows.filter((r) => r.nb < 8).length, rows };
}

// Ids des dossiers du Volet 2 encore incomplets (< 8 champs), à traiter en priorité.
async function getDevis5Volet2IncompletIds(): Promise<string[]> {
  return (await getDevis5Volet2Data()).rows.filter((r) => r.nb < 8).map((r) => r.pipelineId);
}

// Complète en masse les infos devis depuis les contrats MRI, par lots.
export async function extractDevis5Infos(actorEmail: string, offset: number, limit: number): Promise<{ total: number; processed: number; nextOffset: number; done: boolean; filled: number; dossiersTouches: number }> {
  const ids = await getDevis5Volet2IncompletIds();
  const slice = ids.slice(offset, offset + limit);
  let filled = 0, dossiersTouches = 0;
  for (const id of slice) {
    const r = await extractDevisInfoForPipeline(id, actorEmail);
    filled += r.filled.length;
    if (r.filled.length > 0) dossiersTouches++;
  }
  const nextOffset = offset + slice.length;
  return { total: ids.length, processed: slice.length, nextOffset, done: nextOffset >= ids.length, filled, dossiersTouches };
}

export async function logDevis5DocLoad(actorEmail: string, dossiers: number, created: number): Promise<void> {
  if (dossiers > 0) await prisma.docLoadLog.create({ data: { dossiers, created, actorEmail } });
}

export async function getDocLoadHistory(limit = 15): Promise<{ loadedAt: string; dossiers: number; created: number }[]> {
  const rows = await prisma.docLoadLog.findMany({ orderBy: { loadedAt: "desc" }, take: limit });
  return rows.map((r) => ({ loadedAt: r.loadedAt.toISOString(), dossiers: r.dossiers, created: r.created }));
}

// ─── Volet 4 : suivi des demandes de devis + détecteur de réponses ───────────
const FRONT_CONV = (cid: string | null) => (cid ? `https://app.frontapp.com/open/${cid}` : null);
const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
// Adresses des demandes de devis : le détecteur ne scanne QUE ces conversations.
const AXA_ADDR = "achille.leboeuf@axa.fr";
const MILA_ADDR = "souscription@mila.fr";
const scanEligible = (to: string | null | undefined) => {
  const t = (to || "").toLowerCase();
  return t.includes(AXA_ADDR) || t.includes(MILA_ADDR);
};

export type DevisReplyKind = "devis_obtenu" | "refus_assureur" | "traiter_manuel" | "pas_de_reponse" | "non_scanne";
export type Devis5Demande = {
  eventId: string; pipelineId: string; nom: string; adresse: string | null;
  assureur: string; to: string | null; sentAt: string; jours: number; convUrl: string | null; scanEligible: boolean;
  replyKind: DevisReplyKind; replyConfirmed: boolean; replySnippet: string | null; scanned: boolean;
};
export type Devis5Suivi = {
  envoyes: number; demandesTotal: number; devisObtenus: number; refus: number; aTraiter: number; pasReponse: number;
  sansReponse10j: number; pretsAuto6: number; lastScanAt: string | null; demandes: Devis5Demande[];
};

type DevisSentMeta = { assureur?: string; to?: string; conversationId?: string; replyKind?: DevisReplyKind; replyConfirmed?: boolean; replySnippet?: string; replyScanAt?: string };

// Suivi = une ligne par DEMANDE (dossier × assureur). Le statut de réponse est
// stocké dans l'event devis_sent lui-même (1 demande = 1 statut, pas de doublon).
export async function getDevis5Volet4Data(nowMs: number): Promise<Devis5Suivi> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    // Exclut : les dossiers ODR (jamais suivis en Auto 5) ET ceux déjà envoyés à
    // l'Auto 6 (marqueur auto6Ready) → le suivi + les compteurs ne reflètent que
    // les dossiers ENCORE à cette étape. Les envoyés basculent dans l'historique.
    where: { metadata: { path: ["devisType"], equals: "devis_sent" }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null }, statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] }, events: { none: { metadata: { path: ["auto6Ready"], equals: true } } } } },
    select: { id: true, createdAt: true, metadata: true, pipelineId: true, pipeline: { select: { copro: { select: { nom: true, adresse: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const pipes = new Set<string>();
  let lastScan: number | null = null;
  const demandes: Devis5Demande[] = ev.map((e) => {
    const m = (e.metadata ?? {}) as DevisSentMeta;
    pipes.add(e.pipelineId);
    if (m.replyScanAt) { const t = new Date(m.replyScanAt).getTime(); if (lastScan == null || t > lastScan) lastScan = t; }
    return {
      eventId: e.id, pipelineId: e.pipelineId, nom: e.pipeline?.copro.nom ?? "?", adresse: e.pipeline?.copro.adresse ?? null,
      assureur: (m.assureur ?? "?").toUpperCase(), to: m.to ?? null, sentAt: e.createdAt.toISOString(),
      jours: Math.floor((nowMs - e.createdAt.getTime()) / 86400000), convUrl: FRONT_CONV(m.conversationId ?? null),
      scanEligible: scanEligible(m.to), replyKind: (m.replyKind ?? "non_scanne") as DevisReplyKind,
      replyConfirmed: !!m.replyConfirmed, replySnippet: m.replySnippet ?? null, scanned: !!m.replyScanAt,
    };
  }).sort((a, b) => b.jours - a.jours);
  const cnt = (k: DevisReplyKind) => demandes.filter((d) => d.replyKind === k).length;
  const pretsAuto6 = (await getReadyForAuto6(nowMs)).length;
  return {
    envoyes: pipes.size, demandesTotal: demandes.length,
    devisObtenus: cnt("devis_obtenu"), refus: cnt("refus_assureur"), aTraiter: cnt("traiter_manuel"), pasReponse: cnt("pas_de_reponse"),
    sansReponse10j: demandes.filter((d) => (d.replyKind === "pas_de_reponse" || d.replyKind === "non_scanne") && d.jours >= 10).length,
    pretsAuto6, lastScanAt: lastScan ? new Date(lastScan).toISOString() : null, demandes,
  };
}

// Un dossier est « prêt pour l'Auto 6 » dès qu'AU MOINS UN devis a été reçu
// (sur ses demandes AXA / Mila). Les autres demandes (encore en attente, refus,
// sans réponse) n'empêchent plus le passage : on lance la comparaison dès le 1er devis.
// Renvoie les pipelines prêts PAS ENCORE envoyés à l'Auto 6 (sans marqueur auto6Ready).
async function getReadyForAuto6(nowMs: number): Promise<{ id: string; statut: string }[]> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["devisType"], equals: "devis_sent" }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null }, statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] } } },
    select: { createdAt: true, metadata: true, pipelineId: true, pipeline: { select: { statut: true } } },
  });
  const byPipe = new Map<string, { statut: string; demandes: { kind: DevisReplyKind; jours: number }[] }>();
  for (const e of ev) {
    const m = (e.metadata ?? {}) as DevisSentMeta;
    const g = byPipe.get(e.pipelineId) ?? { statut: e.pipeline?.statut ?? "?", demandes: [] };
    g.demandes.push({ kind: (m.replyKind ?? "non_scanne") as DevisReplyKind, jours: Math.floor((nowMs - e.createdAt.getTime()) / 86400000) });
    byPipe.set(e.pipelineId, g);
  }
  const ready = [...byPipe.entries()].filter(([, g]) => g.demandes.some((d) => d.kind === "devis_obtenu"));
  const readyIds = ready.map(([id]) => id);
  if (!readyIds.length) return [];
  const marked = new Set((await prisma.pipelineEvent.findMany({ where: { metadata: { path: ["auto6Ready"], equals: true }, pipelineId: { in: readyIds } }, select: { pipelineId: true }, distinct: ["pipelineId"] })).map((e) => e.pipelineId));
  return ready.filter(([id]) => !marked.has(id)).map(([id, g]) => ({ id, statut: g.statut }));
}

// Historique des envois vers l'Auto 6 (un event auto6Ready par dossier envoyé).
export type Auto6HistoryRow = { pipelineId: string; nom: string; adresse: string | null; sentAt: string };
export async function getDevis5Auto6History(): Promise<Auto6HistoryRow[]> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["auto6Ready"], equals: true }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null } } },
    select: { createdAt: true, pipelineId: true, pipeline: { select: { copro: { select: { nom: true, adresse: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const seen = new Set<string>();
  const rows: Auto6HistoryRow[] = [];
  for (const e of ev) {
    if (seen.has(e.pipelineId)) continue;
    seen.add(e.pipelineId);
    rows.push({ pipelineId: e.pipelineId, nom: e.pipeline?.copro.nom ?? "?", adresse: e.pipeline?.copro.adresse ?? null, sentAt: e.createdAt.toISOString() });
  }
  return rows;
}

// Envoie à l'Auto 6 (comparaison) les dossiers prêts : marqueur auto6Ready +
// garantit le statut devis_recus (déplace ceux encore en « demande de devis »).
export async function sendReadyToAuto6(actorEmail: string): Promise<{ sent: number }> {
  const ready = await getReadyForAuto6(Date.now());
  for (const p of ready) {
    if (p.statut === "devis_demandes") await prisma.insurancePipeline.update({ where: { id: p.id }, data: { statut: "devis_recus" } });
    await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: "Devis collectés — envoyé à l'automatisation 6 (comparaison des devis)", metadata: { auto6Ready: true }, createdBy: actorEmail } });
  }
  return { sent: ready.length };
}

// ── Détecteur de réponses (AXA/Mila) ──────────────────────────────────────
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const DEVIS_TXT = /devis|proposition (commerciale|tarifaire|d'?assurance)|tarification|cotisation propos|projet de contrat|offre (tarifaire|commerciale)|ci-?joint.*(devis|proposition|tarif|offre)/i;
// Refus d'assurer — patterns observés sur Front (surtout Mila / Pierre Quantin).
const REFUS_TXT = /(?:pas\s+en\s+mesure\s+d['’ ]assurer|ne\s+(?:pouvons|pourrons|sommes)\s+pas\s+(?:en\s+mesure\s+)?(?:d['’ ]assurer|donner\s+(?:une\s+)?suite|assurer|garantir|r[ée]pondre\s+favorablement)|ne\s+souhait\w+\s+pas\s+(?:assurer|donner\s+suite|poursuivre|retenir)|d[ée]clin\w+\s+(?:votre|le|la|l['’]|cette|toute|ce)|refus\w*\s+(?:d['’ ]assurer|de\s+garantir|votre\s+demande)|risque\s+(?:non|in)\s?assurable|non\s+assurable|zone\s+inondable\s+à\s+risque\s+tr[eè]s\s+[ée]lev[ée])/i;
function classifyDevisReply(body: string, hasDoc: boolean, hasInbound: boolean, bounce: boolean): DevisReplyKind {
  if (!hasInbound) return bounce ? "traiter_manuel" : "pas_de_reponse";
  if (REFUS_TXT.test(body)) return "refus_assureur";
  if (hasDoc) return "devis_obtenu";
  if (DEVIS_TXT.test(body)) return "devis_obtenu";
  return "traiter_manuel";
}
async function frontGetJson(path: string): Promise<Record<string, unknown> | null> {
  if (!FRONT_TOKEN) return null;
  const r = await fetch(`${FRONT_API_URL}${path}`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
  return r.ok ? r.json() : null;
}
const isFromMateraH = (from: string) => /@(?:[a-z0-9-]+\.)?matera\.eu$/i.test(from);

// Scanne un lot de demandes (AXA/Mila uniquement) et pose un statut. Ne touche
// PAS un statut déjà confirmé à la main. Lecture Front seule (aucun déplacement).
export async function scanDevisReplies(offset: number, limit: number): Promise<{ total: number; scanned: number; nextOffset: number; done: boolean; counts: Record<string, number> }> {
  const excl = await getExcludedCoproIds();
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["devisType"], equals: "devis_sent" }, pipeline: { coproId: { notIn: excl }, copro: { archivedAt: null }, statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] } } },
    select: { id: true, createdAt: true, metadata: true, pipelineId: true, pipeline: { select: { coproId: true, copro: { select: { nom: true, adresse: true } } } } }, orderBy: { createdAt: "asc" },
  });
  const eligible = ev.filter((e) => scanEligible((e.metadata as DevisSentMeta | null)?.to));
  const slice = eligible.slice(offset, offset + limit);
  const counts: Record<string, number> = {};
  const now = new Date();
  for (const e of slice) {
    const m = (e.metadata ?? {}) as DevisSentMeta;
    if (m.replyConfirmed) { counts[m.replyKind ?? "?"] = (counts[m.replyKind ?? "?"] ?? 0) + 1; continue; }
    const cid = m.conversationId;
    const setMeta = (patch: Partial<DevisSentMeta>) => prisma.pipelineEvent.update({ where: { id: e.id }, data: { metadata: { ...m, ...patch, replyScanAt: now.toISOString() } as object } });
    if (!cid) { await setMeta({ replyKind: "non_scanne" }); counts["non_scanne"] = (counts["non_scanne"] ?? 0) + 1; continue; }
    const sentMs = e.createdAt.getTime();
    const list = await frontGetJson(`/conversations/${cid}/messages?limit=20`);
    const results = ((list?._results as unknown[]) ?? []) as { id: string; is_inbound: boolean; created_at: number; error_type?: string; blurb?: string; author?: { email?: string }; recipients?: { role: string; handle: string }[] }[];
    const bounce = results.some((x) => !x.is_inbound && x.error_type);
    const inbound = results.filter((x) => {
      const from = (x.recipients ?? []).find((r) => r.role === "from")?.handle || x.author?.email || "";
      return x.is_inbound && x.created_at * 1000 > sentMs && !isFromMateraH(from);
    }).sort((a, b) => a.created_at - b.created_at);
    // Lecture des messages entrants (corps + PJ) : on distingue un VRAI devis
    // (fichier « Projet/Conditions particulières/… ») des RS/contrats que
    // l'assureur nous a simplement re-transmis.
    const fulls: { id: string; content?: string; blurb?: string; attachments?: { content_type?: string; filename?: string }[] }[] = [];
    for (const x of inbound) { const full = (await frontGetJson(`/messages/${x.id}`)) as { content?: string; attachments?: { content_type?: string; filename?: string }[] } | null; fulls.push({ id: x.id, content: full?.content, blurb: x.blurb, attachments: full?.attachments }); }
    const allAtts = fulls.flatMap((f) => f.attachments ?? []);
    const hasDevisDoc = allAtts.some((a) => isDevisFilename(a.filename || ""));
    const lastF = fulls[fulls.length - 1];
    const body = stripHtml(lastF?.content || lastF?.blurb || "").slice(0, 500);
    const snippet = body.slice(0, 160);
    const kind = classifyDevisReply(body, hasDevisDoc, inbound.length > 0, bounce);
    await setMeta({ replyKind: kind, replySnippet: snippet || (bounce ? "Échec de remise (bounce)" : undefined) });
    // Devis réel présent → on capture UNIQUEMENT le fichier devis (par nom),
    // type forcé selon l'assureur (Devis AXA / Devis Mila), sans IA. Best-effort.
    if (kind === "devis_obtenu" && hasDevisDoc) {
      try {
        const forceKind = (m.to || "").toLowerCase().includes("souscription@mila.fr") ? "devis_mila" : "devis_axa";
        const cp = e.pipeline?.copro;
        if (e.pipeline?.coproId && cp) {
          await captureReplyDocs({ pipelineId: e.pipelineId, coproId: e.pipeline.coproId, adresse: cp.adresse || cp.nom, msgIds: inbound.map((x) => x.id), forceKind, devisOnly: true, createdBy: "auto:scan_devis" });
        }
      } catch { /* capture best-effort */ }
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const nextOffset = offset + slice.length;
  return { total: eligible.length, scanned: slice.length, nextOffset, done: nextOffset >= eligible.length, counts };
}

// Confirme (ou corrige) le statut d'une demande via le menu déroulant.
export async function confirmDevisReply(eventId: string, kind: DevisReplyKind, actorEmail: string): Promise<{ ok: boolean; moved?: boolean }> {
  const e = await prisma.pipelineEvent.findUnique({ where: { id: eventId }, select: { metadata: true, pipelineId: true, pipeline: { select: { statut: true } } } });
  if (!e) return { ok: false };
  const base = (e.metadata ?? {}) as DevisSentMeta;
  await prisma.pipelineEvent.update({ where: { id: eventId }, data: { metadata: { ...base, replyKind: kind, replyConfirmed: true, replyConfirmedBy: actorEmail, replyConfirmedAt: new Date().toISOString() } as object } });
  // « Devis obtenu » validé → passage AUTO en « Comparaison des devis » (comme la
  // détection « RS reçu »), même si on attend encore l'autre assureur.
  let moved = false;
  if (kind === "devis_obtenu" && e.pipeline?.statut === "devis_demandes") {
    await prisma.$transaction([
      prisma.insurancePipeline.update({ where: { id: e.pipelineId }, data: { statut: "devis_recus" } }),
      prisma.pipelineEvent.create({ data: { pipelineId: e.pipelineId, type: "statut_change", ancienStatut: "devis_demandes", nouveauStatut: "devis_recus", description: "Devis obtenu (détecteur) — passage à la comparaison des devis", metadata: { devisObtenu: true }, createdBy: actorEmail } }),
    ]);
    moved = true;
  }
  return { ok: true, moved };
}

// ─── Graphe « Flux des demandes de devis — par jour » ────────────────────────
// Miroir du graphe RS, côté devis. Par jour et PAR DOSSIER :
//   - sent  = dossiers dont la 1re demande de devis (mail à un assureur) est partie
//             ce jour-là (event devisType=devis_sent).
//   - recus = dossiers ayant leur 1er devis « acté » ce jour-là (1er doc devis_axa/
//             devis_mila ou 1er DevisRecu enregistré). Note : c'est la date
//             d'enregistrement dans Gufetto, pas la date d'arrivée sur Front.
// IMPORTANT : mêmes filtres que les cartes du dashboard pour que les TOTAUX
// coïncident — demandes = devisDemandes (hors ODR + archivés), reçus =
// getDevisRecusStats (docs devis + DevisRecu, hors ODR). Live (aucun cache).
export type DevisFlowDay = { date: string; label: string; sent: number; recus: number };
export async function getDevisFlowDaily(): Promise<{ rows: DevisFlowDay[]; demandesTotal: number; recusTotal: number }> {
  const [sentEv, devisDocs, devisRecus] = await Promise.all([
    // Demandes : hors statuts ODR ET archivés (cohérent avec la carte « demandes envoyées »).
    prisma.pipelineEvent.findMany({ where: { metadata: { path: ["devisType"], equals: "devis_sent" }, pipeline: { statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] }, copro: { archivedAt: null } } }, select: { pipelineId: true, createdAt: true } }),
    // Reçus : docs devis + DevisRecu, hors statuts ODR (cohérent avec getDevisRecusStats).
    prisma.pipelineDocument.findMany({ where: { kind: { in: ["devis_axa", "devis_mila"] }, pipeline: { statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] } } }, select: { pipelineId: true, createdAt: true } }),
    prisma.devisRecu.findMany({ where: { pipeline: { statut: { notIn: ["odr_en_cours", "odr_envoye", "odr_accepte", "odr_en_vigueur"] } } }, select: { pipelineId: true, createdAt: true } }),
  ]);

  // 1er jour d'envoi et 1er jour de réception, par dossier (min des createdAt).
  const firstSent = new Map<string, Date>();
  for (const e of sentEv) { const cur = firstSent.get(e.pipelineId); if (!cur || e.createdAt < cur) firstSent.set(e.pipelineId, e.createdAt); }
  const firstRecu = new Map<string, Date>();
  for (const e of [...devisDocs, ...devisRecus]) { const cur = firstRecu.get(e.pipelineId); if (!cur || e.createdAt < cur) firstRecu.set(e.pipelineId, e.createdAt); }

  const dayKey = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d); // YYYY-MM-DD
  const sentBy = new Map<string, number>(); const recuBy = new Map<string, number>();
  for (const d of firstSent.values()) sentBy.set(dayKey(d), (sentBy.get(dayKey(d)) ?? 0) + 1);
  for (const d of firstRecu.values()) recuBy.set(dayKey(d), (recuBy.get(dayKey(d)) ?? 0) + 1);

  const all = [...sentBy.keys(), ...recuBy.keys()].sort();
  if (!all.length) return { rows: [], demandesTotal: 0, recusTotal: 0 };
  const start = new Date(all[0] + "T12:00:00Z");
  const end = new Date(dayKey(new Date()) + "T12:00:00Z");
  const rows: DevisFlowDay[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    rows.push({ date: k, label: `${k.slice(8, 10)}/${k.slice(5, 7)}`, sent: sentBy.get(k) ?? 0, recus: recuBy.get(k) ?? 0 });
  }
  return { rows, demandesTotal: firstSent.size, recusTotal: firstRecu.size };
}
