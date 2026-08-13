// Automatisation 5 — récupération des DEVIS MILA arrivés hors de notre fil.
// Mila envoie ses devis dans de NOUVEAUX mails (« Votre devis Multirisque
// Immeuble … [QU-MRIIND-…] »), pas en réponse à notre demande, et pour TOUS les
// immeubles Matera (pas seulement nos dossiers). Front les route selon
// l'immeuble → hors de l'inbox Gufetto et sans notre marqueur.
//
// Pour ne PAS inonder l'inbox Gufetto de centaines de devis hors périmètre, on
// part de NOS dossiers en flux devis (devis_demandes / devis_recus) et on va
// chercher LEUR devis Mila via le building_id. Pour chacun trouvé :
//   - capture du PDF devis (devis_mila) dans le dossier ;
//   - rapatriement de la conversation dans l'inbox Gufetto + tag ;
//   - passage en « Comparaison des devis » si le dossier était en « Demande ».
// Idempotent : capture (frontAttachmentId unique) et avancement sont sûrs à rejouer.

import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";
import { captureReplyDocs } from "@/lib/rs-docs";
import { tagConversation } from "@/lib/front";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const GUFETTO_INBOX = process.env.FRONT_GUFETTO_INBOX || "inb_601dy";
const GUFETTO_TAG = "tag_23n286"; // gufetto_insurance
const MILA_SUBJECT = "votre devis multirisque immeuble";

type FrontConv = { id: string; subject?: string; status?: string; inboxes?: { id: string }[]; tags?: { id: string }[] };

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

// Conversations d'un immeuble (via le champ perso building_id).
async function convsForBuilding(buildingId: string): Promise<FrontConv[]> {
  const q = encodeURIComponent(`custom_field:"building_id=${buildingId}"`);
  const data = await frontGet<{ _results?: FrontConv[] }>(`/conversations/search/${q}?limit=100`);
  return data?._results ?? [];
}

async function moveToGufetto(cid: string, status: string | undefined): Promise<void> {
  if (!FRONT_TOKEN) return;
  const body: Record<string, unknown> = { inbox_id: GUFETTO_INBOX };
  if (status === "archived") body.status = "archived"; // un move seul rouvre → on préserve
  await fetch(`${FRONT_API_URL}/conversations/${cid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export type MilaScanResult = {
  total: number; scanned: number; nextOffset: number; done: boolean;
  trouves: number; docs: number; deplaces: number; avances: number;
};

// offset/limit portent sur NOS dossiers en flux devis (pas sur les mails Mila).
export async function scanMilaDevisPro(offset: number, limit: number): Promise<MilaScanResult> {
  if (!FRONT_TOKEN) return { total: 0, scanned: 0, nextOffset: offset, done: true, trouves: 0, docs: 0, deplaces: 0, avances: 0 };
  const excl = await getExcludedCoproIds();
  const pipelines = await prisma.insurancePipeline.findMany({
    where: { statut: { in: ["devis_demandes", "devis_recus"] }, coproId: { notIn: excl }, copro: { archivedAt: null, buildingId: { not: "" } } },
    select: { id: true, statut: true, copro: { select: { id: true, nom: true, adresse: true, buildingId: true } } },
    orderBy: { copro: { dateEcheance: "asc" } },
  });
  const slice = pipelines.slice(offset, offset + limit);

  let trouves = 0, docs = 0, deplaces = 0, avances = 0;
  for (const p of slice) {
    const bid = p.copro.buildingId;
    if (!bid) continue;
    const convs = await convsForBuilding(bid);
    // Le(s) mail(s) « Votre devis Multirisque Immeuble » de cet immeuble (Mila).
    const mila = convs.filter((c) => (c.subject || "").toLowerCase().startsWith(MILA_SUBJECT));
    if (!mila.length) continue;
    trouves++;

    for (const c of mila) {
      // Capture du PDF devis (par nom, type forcé devis_mila, sans IA). Idempotent.
      try {
        const list = await frontGet<{ _results?: { id: string; is_inbound?: boolean }[] }>(`/conversations/${c.id}/messages?limit=20`);
        const msgIds = (list?._results ?? []).filter((m) => m.is_inbound !== false).map((m) => m.id);
        if (msgIds.length) {
          const r = await captureReplyDocs({ pipelineId: p.id, coproId: p.copro.id, adresse: p.copro.adresse || p.copro.nom, msgIds, forceKind: "devis_mila", devisOnly: true, createdBy: "auto:mila_pro" });
          docs += r.created;
        }
      } catch { /* best-effort */ }
      // Rapatriement inbox Gufetto + tag (si pas déjà fait).
      const inGufettoOnly = (c.inboxes ?? []).length === 1 && (c.inboxes ?? [])[0]?.id === GUFETTO_INBOX;
      const tagged = (c.tags ?? []).some((t) => t.id === GUFETTO_TAG);
      if (!inGufettoOnly) { await moveToGufetto(c.id, c.status); deplaces++; }
      if (!tagged) await tagConversation(c.id, [GUFETTO_TAG]);
    }

    // Passage en « Comparaison des devis » si encore en « Demande de devis ».
    if (p.statut === "devis_demandes") {
      await prisma.$transaction([
        prisma.insurancePipeline.update({ where: { id: p.id }, data: { statut: "devis_recus" } }),
        prisma.pipelineEvent.create({ data: { pipelineId: p.id, type: "statut_change", ancienStatut: "devis_demandes", nouveauStatut: "devis_recus", description: "Devis Mila reçu (mail hors fil) — passage à la comparaison des devis", metadata: { devisObtenu: true, milaDevisPro: true }, createdBy: "auto:mila_pro" } }),
      ]);
      avances++;
    }
  }

  const nextOffset = offset + slice.length;
  return { total: pipelines.length, scanned: slice.length, nextOffset, done: nextOffset >= pipelines.length, trouves, docs, deplaces, avances };
}
