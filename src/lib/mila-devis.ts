// Automatisation 5 — récupération des DEVIS MILA « pro » arrivés hors de notre
// fil. Mila envoie ses devis dans de NOUVEAUX mails (sujet « Votre devis
// Multirisque Immeuble … [QU-MRIIND-…] »), pas en réponse à notre demande.
// Front les réconcilie via un building_id et les route selon l'immeuble → ils
// atterrissent un peu partout (CCR - Offre Pro, Tronc Commun, CSM…) au lieu de
// l'inbox Gufetto, et sans notre marqueur → jamais captés par le détecteur.
//
// Ce scan : cherche ces mails, les RAPATRIE dans l'inbox Gufetto + tag, et via
// le building_id RATTACHE le devis au dossier (capture du PDF devis_mila +
// passage en « Comparaison des devis »). Idempotent : un mail déjà tagué
// gufetto est ignoré (le tag est posé en DERNIER, une fois tout le reste fait).

import { prisma } from "@/lib/prisma";
import { captureReplyDocs } from "@/lib/rs-docs";
import { tagConversation } from "@/lib/front";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const GUFETTO_INBOX = process.env.FRONT_GUFETTO_INBOX || "inb_601dy";
const GUFETTO_TAG = "tag_23n286"; // gufetto_insurance
const MILA_SUBJECT = "votre devis multirisque immeuble"; // préfixe sujet Mila

type FrontConv = {
  id: string;
  subject?: string;
  status?: string;
  tags?: { id: string }[];
  custom_fields?: Record<string, unknown>;
};

async function frontGet<T>(path: string): Promise<T | null> {
  if (!FRONT_TOKEN) return null;
  const url = path.startsWith("http") ? path : `${FRONT_API_URL}${path}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
      if (r.ok) return (await r.json()) as T;
      if (r.status !== 429 && r.status < 500) return null;
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 400 * i));
  }
  return null;
}

// Recherche tous les mails « devis Mila » (sujet), toutes inboxes, dédupliqués.
type FrontSearchResp = { _results?: FrontConv[]; _pagination?: { next?: string | null } };
async function searchMilaDevis(): Promise<FrontConv[]> {
  const query = `"Votre devis Multirisque Immeuble"`;
  const byId = new Map<string, FrontConv>();
  let path: string | null = `/conversations/search/${encodeURIComponent(query)}?limit=100`;
  let guard = 0;
  while (path && guard < 8) {
    const data: FrontSearchResp | null = await frontGet<FrontSearchResp>(path);
    if (!data) break;
    for (const c of data._results ?? []) {
      if ((c.subject || "").toLowerCase().startsWith(MILA_SUBJECT)) byId.set(c.id, c);
    }
    path = data._pagination?.next ?? null;
    guard++;
  }
  return [...byId.values()];
}

function buildingIdOf(cf: Record<string, unknown> | undefined): string | null {
  const v = cf?.["building_id"];
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

// Déplace la conversation dans l'inbox Gufetto en préservant son statut
// (un move seul rouvre une conv archivée → on renvoie le statut d'origine).
async function moveToGufetto(cid: string, status: string | undefined): Promise<void> {
  if (!FRONT_TOKEN) return;
  const body: Record<string, unknown> = { inbox_id: GUFETTO_INBOX };
  if (status === "archived") body.status = "archived";
  await fetch(`${FRONT_API_URL}/conversations/${cid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export type MilaScanResult = {
  total: number; scanned: number; nextOffset: number; done: boolean;
  repatries: number; rattaches: number; docs: number; avances: number; sansCopro: number;
};

export async function scanMilaDevisPro(offset: number, limit: number): Promise<MilaScanResult> {
  if (!FRONT_TOKEN) return { total: 0, scanned: 0, nextOffset: offset, done: true, repatries: 0, rattaches: 0, docs: 0, avances: 0, sansCopro: 0 };
  const all = await searchMilaDevis();
  // À traiter = pas encore tagué gufetto (le tag est notre marqueur « fait »).
  const pending = all.filter((c) => !(c.tags ?? []).some((t) => t.id === GUFETTO_TAG));
  const slice = pending.slice(offset, offset + limit);

  let repatries = 0, rattaches = 0, docs = 0, avances = 0, sansCopro = 0;
  for (const c of slice) {
    // 1) Lecture fraîche (statut + custom fields fiables).
    const full = await frontGet<FrontConv>(`/conversations/${c.id}`);
    const status = full?.status ?? c.status;
    const bid = buildingIdOf(full?.custom_fields ?? c.custom_fields);

    // 2) Rapatriement inbox Gufetto (avant le tag).
    await moveToGufetto(c.id, status);
    repatries++;

    // 3) Rattachement dossier via building_id.
    if (bid) {
      const copro = await prisma.copro.findUnique({
        where: { buildingId: bid },
        select: { id: true, nom: true, adresse: true, pipelines: { select: { id: true, statut: true }, where: { copro: { archivedAt: null } } } },
      });
      const pipe = copro?.pipelines.find((p) => p.statut === "devis_demandes")
        ?? copro?.pipelines.find((p) => p.statut === "devis_recus")
        ?? copro?.pipelines[0];
      if (copro && pipe) {
        rattaches++;
        // Capture du PDF devis (par nom, type forcé devis_mila, sans IA).
        try {
          const list = await frontGet<{ _results?: { id: string; is_inbound?: boolean }[] }>(`/conversations/${c.id}/messages?limit=20`);
          const msgIds = (list?._results ?? []).filter((m) => m.is_inbound !== false).map((m) => m.id);
          if (msgIds.length) {
            const r = await captureReplyDocs({ pipelineId: pipe.id, coproId: copro.id, adresse: copro.adresse || copro.nom, msgIds, forceKind: "devis_mila", devisOnly: true, createdBy: "auto:mila_pro" });
            docs += r.created;
          }
        } catch { /* best-effort */ }
        // Passage en « Comparaison des devis » si encore en « Demande de devis ».
        if (pipe.statut === "devis_demandes") {
          await prisma.$transaction([
            prisma.insurancePipeline.update({ where: { id: pipe.id }, data: { statut: "devis_recus" } }),
            prisma.pipelineEvent.create({ data: { pipelineId: pipe.id, type: "statut_change", ancienStatut: "devis_demandes", nouveauStatut: "devis_recus", description: "Devis Mila reçu (mail hors fil) — passage à la comparaison des devis", metadata: { devisObtenu: true, milaDevisPro: true, conversationId: c.id }, createdBy: "auto:mila_pro" } }),
          ]);
          avances++;
        } else {
          await prisma.pipelineEvent.create({ data: { pipelineId: pipe.id, type: "action_manuelle", description: "Devis Mila reçu (mail hors fil) rattaché au dossier", metadata: { milaDevisPro: true, conversationId: c.id }, createdBy: "auto:mila_pro" } });
        }
      } else {
        sansCopro++;
      }
    } else {
      sansCopro++;
    }

    // 4) Tag gufetto EN DERNIER = marqueur « traité » (dédup des prochains scans).
    await tagConversation(c.id, [GUFETTO_TAG]);
  }

  const nextOffset = offset + slice.length;
  return { total: pending.length, scanned: slice.length, nextOffset, done: nextOffset >= pending.length, repatries, rattaches, docs, avances, sansCopro };
}
