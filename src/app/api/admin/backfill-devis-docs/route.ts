import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { MILA_STANDARD_DOCS, MILA_STANDARD_SOURCE_MSG_ID } from "@/lib/devis-standard-docs";

// POST /api/admin/backfill-devis-docs (admin, one-shot, idempotent)
// 1) AXA : pour chaque dossier ayant un doc `devis_axa` (le ProjetConditionsParticulieres
//    déjà capturé), re-fetch le mail d'Achille via frontMsgId et AJOUTE le « Contrat MRI »
//    en `devis_axa` (RS ré-échoé exclu ; dédup par attachmentId + nom de fichier).
// 2) Mila : télécharge une fois la CG + l'IPID standard depuis un mail Mila et les stocke
//    aux chemins globaux (Supabase). Réexécutable sans créer de doublon.
const FRONT = "https://api2.frontapp.com";
const TOKEN = process.env.FRONT_API_TOKEN;

type Att = { id?: string; filename?: string; url?: string; content_type?: string };
const isRealDoc = (a: Att) => {
  const ct = (a.content_type || "").toLowerCase(), fn = (a.filename || "").toLowerCase();
  if (/^image\d+\.(png|gif|jpe?g)$/.test(fn) || /logo|signature/.test(fn)) return false;
  return ct.includes("pdf") || /\.pdf$/.test(fn);
};
const isRS = (fn: string) => /(-\s?rs\.|(\b|_)rs\b|relev|sinistr|statistiq|[ée]tat\s+des\s+sinistres)/i.test(fn || "");
const subLabel = (fn: string) => /contrat/i.test(fn) ? "Contrat MRI" : /particuli|projet|conditions/i.test(fn) ? "Conditions particulières" : "doc";
const fget = async (p: string) => { const r = await fetch(`${FRONT}${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.json() : null; };
const dl = async (url: string) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };

export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  if (!TOKEN) return NextResponse.json({ error: "FRONT_API_TOKEN manquant" }, { status: 500 });
  const sb = getSupabaseAdmin();

  // ── 1) AXA : ajouter le Contrat MRI en devis_axa ────────────────────────────
  const axaDocs = await prisma.pipelineDocument.findMany({ where: { kind: "devis_axa", frontMsgId: { not: null } }, select: { pipelineId: true, coproId: true, frontMsgId: true } });
  const byPipe = new Map<string, { coproId: string; msgIds: Set<string> }>();
  for (const d of axaDocs) {
    const e = byPipe.get(d.pipelineId) ?? { coproId: d.coproId, msgIds: new Set<string>() };
    if (d.frontMsgId) e.msgIds.add(d.frontMsgId);
    byPipe.set(d.pipelineId, e);
  }
  let axaAdded = 0, axaErr = 0;
  for (const [pipelineId, { coproId, msgIds }] of byPipe) {
    const copro = await prisma.copro.findUnique({ where: { id: coproId }, select: { nom: true, adresse: true } });
    const adresse = copro?.adresse || copro?.nom || coproId;
    const existing = await prisma.pipelineDocument.findMany({ where: { pipelineId }, select: { frontAttachmentId: true, fileName: true } });
    const seen = new Set(existing.map((d) => d.frontAttachmentId).filter(Boolean) as string[]);
    const seenNames = new Set(existing.map((d) => (d.fileName || "").toLowerCase()));
    let part = await prisma.pipelineDocument.count({ where: { pipelineId, kind: "devis_axa" } });
    for (const msgId of msgIds) {
      const msg = await fget(`/messages/${msgId}`);
      const atts = ((msg?.attachments ?? []) as Att[]).filter((a) => a.id && a.url && isRealDoc(a) && !isRS(a.filename || ""));
      for (const a of atts) {
        if (seen.has(a.id!)) continue;
        const label = subLabel(a.filename || "");
        const fileName = `${adresse} - Devis AXA (${label})`;
        if (seenNames.has(fileName.toLowerCase())) { seen.add(a.id!); continue; }
        seen.add(a.id!); seenNames.add(fileName.toLowerCase());
        const buf = await dl(a.url!);
        if (!buf) { axaErr++; continue; }
        const storagePath = `insurance/${coproId}/${a.id}.pdf`;
        const { error } = await sb.storage.from(STORAGE_BUCKET).upload(storagePath, buf, { contentType: "application/pdf", upsert: true });
        if (error) { axaErr++; continue; }
        await prisma.pipelineDocument.create({ data: { pipelineId, coproId, kind: "devis_axa", part: ++part, storagePath, fileName, source: "front", frontAttachmentId: a.id!, frontMsgId: msgId, createdBy: "backfill:axa_devis_docs" } });
        axaAdded++;
      }
    }
  }

  // ── 2) Mila : stocker CG + IPID standard une fois ───────────────────────────
  const milaResults: string[] = [];
  const msg = await fget(`/messages/${MILA_STANDARD_SOURCE_MSG_ID}`);
  const milaAtts = ((msg?.attachments ?? []) as Att[]).filter((a) => a.id && a.url);
  for (const std of MILA_STANDARD_DOCS) {
    const src = milaAtts.find((a) => std.match.test(a.filename || ""));
    if (!src) { milaResults.push(`${std.name}: source introuvable`); continue; }
    const buf = await dl(src.url!);
    if (!buf) { milaResults.push(`${std.name}: download KO`); continue; }
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(std.storagePath, buf, { contentType: "application/pdf", upsert: true });
    milaResults.push(`${std.name}: ${error ? "upload KO" : "OK"}`);
  }

  return NextResponse.json({ success: true, axa: { pipelines: byPipe.size, added: axaAdded, errors: axaErr }, mila: milaResults });
}
