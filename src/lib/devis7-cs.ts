// Automatisation 7 — Volet 2 « Suivi des réponses du CS ».
// Détecte les réponses du conseil syndical aux propositions transmises (Volet 1).
// Signal fiable : un message ENTRANT dont l'expéditeur est l'un des mails des
// membres du CS (ou contactCsEmail) du dossier — repéré via recherche Front par
// building_id sur les conversations Gufetto. Aucune écriture de statut auto :
// on stocke le verdict + l'extrait dans un event (devis7_cs_reply) et l'UI propose
// un « Statut CS » à VALIDER à la main.

import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const GUFETTO_TAG = "tag_23n286";
const FRONT_CONV_URL = (cid: string | null) => (cid ? `https://app.frontapp.com/open/${cid}` : null);

async function frontGet(path: string): Promise<Record<string, unknown> | null> {
  if (!FRONT_TOKEN) return null;
  try {
    const res = await fetch(`${FRONT_API_URL}${path}`, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

export type CsReplyKind = "accepte" | "refus" | "autre";
// Classe une réponse CS. Prudent : « accepte »/« refus » seulement sur signaux
// clairs, sinon « autre » (à lire à la main). Refus prioritaire (plus risqué).
export function classifyCsReply(body: string): CsReplyKind {
  const s = body.toLowerCase();
  const refus = /\brefus|pas favorable|défavorable|on ne (?:souhaite|veut) pas|ne souhaitons pas|on (?:garde|reste|conserve)|ne (?:change|changeons) pas|on ne donne pas suite|sans suite|on décline|nous déclinons|pas d'accord/i;
  const ok = /\b(?:accord|acceptons?|accepté|validé|valide|favorable|feu vert|nous validons|approuv|d'accord pour|c'est (?:ok|bon|validé)|on (?:valide|part|y va))/i;
  if (refus.test(s)) return "refus";
  if (ok.test(s)) return "accepte";
  return "autre";
}

type CsSel = { id: string; coproId: string; copro: { nom: string; adresse: string | null; buildingId: string; contactCsEmail: string | null; csMembersData: string | null } };
function csEmailsOf(c: CsSel["copro"]): Set<string> {
  const out = new Set<string>();
  if (c.contactCsEmail) c.contactCsEmail.split(/[;,]/).forEach((e) => { const t = e.trim().toLowerCase(); if (t.includes("@")) out.add(t); });
  try { const a = JSON.parse(c.csMembersData ?? "[]") as { email?: string }[]; a.forEach((m) => { if (m?.email) out.add(m.email.toLowerCase().trim()); }); } catch { /* ignore */ }
  return out;
}

// Dossiers auto 7 « proposition transmise » (event devis7_cs_sent) SANS statut CS
// encore décidé (pas d'event devis7_cs_statut) — ceux dont on attend la réponse.
async function csAwaitingPipelines(): Promise<CsSel[]> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      coproId: { notIn: excl }, copro: { archivedAt: null },
      events: { some: { metadata: { path: ["auto"], equals: "devis7_cs_sent" } } },
      NOT: { events: { some: { metadata: { path: ["auto"], equals: "devis7_cs_statut" } } } },
    },
    select: { id: true, coproId: true, copro: { select: { nom: true, adresse: true, buildingId: true, contactCsEmail: true, csMembersData: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return ps as CsSel[];
}

type FMsg = { id: string; is_inbound: boolean; created_at: number; blurb?: string; author?: { email?: string }; recipients?: { role: string; handle: string }[] };
const fromHandle = (m: FMsg) => ((m.recipients ?? []).find((r) => r.role === "from")?.handle || m.author?.email || "").toLowerCase();

// Scanne un lot : pour chaque dossier en attente, cherche dans Front (par
// building_id, convs Gufetto) un message entrant d'un membre du CS, classe et
// stocke le verdict dans un event devis7_cs_reply (écrase le précédent event).
export async function scanCsReplies(offset: number, limit: number): Promise<{ total: number; scanned: number; nextOffset: number; done: boolean; found: number; materaConfigure: boolean }> {
  const ps = await csAwaitingPipelines();
  const slice = ps.slice(offset, offset + limit);
  let found = 0;
  for (const p of slice) {
    const bid = p.copro.buildingId;
    const csEmails = csEmailsOf(p.copro);
    if (!bid || !csEmails.size) continue;
    const sd = await frontGet(`/conversations/search/${encodeURIComponent(`custom_field:"building_id=${bid}"`)}?limit=50`);
    const convs = (((sd?._results as unknown[]) ?? []) as { id: string; tags?: { id: string }[] }[]).filter((c) => (c.tags ?? []).some((t) => t.id === GUFETTO_TAG)).slice(0, 15);
    let best: { m: FMsg; cid: string } | null = null;
    for (const c of convs) {
      const list = await frontGet(`/conversations/${c.id}/messages?limit=20`);
      const msgs = ((list?._results as unknown[]) ?? []) as FMsg[];
      for (const m of msgs) {
        if (!m.is_inbound) continue;
        if (!csEmails.has(fromHandle(m))) continue; // expéditeur = membre du CS
        if (!best || m.created_at > best.m.created_at) best = { m, cid: c.id };
      }
    }
    // Efface l'ancien verdict pour ce dossier puis (ré)écrit le plus récent.
    await prisma.pipelineEvent.deleteMany({ where: { pipelineId: p.id, metadata: { path: ["auto"], equals: "devis7_cs_reply" } } });
    if (best) {
      const full = (await frontGet(`/messages/${best.m.id}`)) as { content?: string } | null;
      const body = stripHtml(full?.content || best.m.blurb || "").slice(0, 500);
      const kind = classifyCsReply(body);
      await prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "action_manuelle", description: `Réponse CS détectée (${kind})`, metadata: { auto: "devis7_cs_reply", kind, snippet: body.slice(0, 240), convId: best.cid, from: fromHandle(best.m), at: new Date(best.m.created_at * 1000).toISOString() }, createdBy: "auto:scan_cs" } });
      found++;
    }
  }
  const nextOffset = offset + slice.length;
  return { total: ps.length, scanned: slice.length, nextOffset, done: nextOffset >= ps.length, found, materaConfigure: !!FRONT_TOKEN };
}

export type CsReplyRow = { pipelineId: string; nom: string; adresse: string | null; replyKind: CsReplyKind | null; snippet: string | null; from: string | null; at: string | null; convUrl: string | null; proposedStatut: "accepte" | "refus" | null };
export type Devis7Volet2 = { total: number; awaiting: number; withReply: number; rows: CsReplyRow[]; lastScanAt: string | null };

// Table du Volet 2 : dossiers en attente + leur dernière réponse CS détectée.
export async function getDevis7Volet2(): Promise<Devis7Volet2> {
  const ps = await csAwaitingPipelines();
  const ids = ps.map((p) => p.id);
  const replies = await prisma.pipelineEvent.findMany({
    where: { pipelineId: { in: ids }, metadata: { path: ["auto"], equals: "devis7_cs_reply" } },
    select: { pipelineId: true, metadata: true, createdAt: true },
  });
  const byPipe = new Map<string, { metadata: unknown; createdAt: Date }>();
  for (const e of replies) byPipe.set(e.pipelineId, e);
  let withReply = 0;
  let lastScan: Date | null = null;
  const rows: CsReplyRow[] = ps.map((p) => {
    const ev = byPipe.get(p.id);
    const m = ev?.metadata as { kind?: CsReplyKind; snippet?: string; convId?: string; from?: string; at?: string } | undefined;
    if (ev) { withReply++; if (!lastScan || ev.createdAt > lastScan) lastScan = ev.createdAt; }
    const kind = m?.kind ?? null;
    return {
      pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
      replyKind: kind, snippet: m?.snippet ?? null, from: m?.from ?? null, at: m?.at ?? null,
      convUrl: FRONT_CONV_URL(m?.convId ?? null),
      proposedStatut: kind === "accepte" || kind === "refus" ? kind : null,
    };
  });
  // En tête : ceux avec une réponse détectée d'abord.
  rows.sort((a, b) => (b.replyKind ? 1 : 0) - (a.replyKind ? 1 : 0));
  return { total: ps.length, awaiting: ps.length, withReply, rows, lastScanAt: lastScan ? (lastScan as Date).toISOString() : null };
}

export type CsHistoryEntry = { pipelineId: string; nom: string; adresse: string | null; value: string; at: string; by: string };
// Historique des Statut CS validés (trace conservée même après disparition du dossier).
export async function getDevis7CsHistory(limit = 60): Promise<CsHistoryEntry[]> {
  const evs = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["auto"], equals: "devis7_cs_statut" } },
    select: { pipelineId: true, metadata: true, createdAt: true, createdBy: true, pipeline: { select: { copro: { select: { nom: true, adresse: true } } } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return evs.map((e) => ({
    pipelineId: e.pipelineId,
    nom: e.pipeline?.copro?.nom ?? "?",
    adresse: e.pipeline?.copro?.adresse ?? null,
    value: (e.metadata as { value?: string } | null)?.value ?? "?",
    at: e.createdAt.toISOString(),
    by: e.createdBy ?? "?",
  }));
}
