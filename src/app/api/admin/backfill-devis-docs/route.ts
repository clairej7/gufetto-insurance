import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { MILA_STANDARD_DOCS, MILA_STANDARD_SOURCE_MSG_ID, AXA_STANDARD_DOCS, AXA_STANDARD_SOURCE_MSG_ID, StandardDoc } from "@/lib/devis-standard-docs";

// POST /api/admin/backfill-devis-docs (admin, one-shot, idempotent)
// Stocke une fois, aux chemins globaux Supabase, les documents STANDARD joints aux
// propositions au CS : CG + IPID Mila (depuis un mail Mila) et CG AXA (depuis un mail
// d'émission de contrat AXA). Réexécutable sans créer de doublon (upsert).
// NB : PAS de backfill « devis_axa » — dans les mails d'Achille, le « Contrat MRI.pdf »
// est le contrat ACTUEL ré-échoé (pas l'offre AXA). Le devis AXA = uniquement le
// ProjetConditionsParticulieres déjà capturé en devis_axa.
const FRONT = "https://api2.frontapp.com";
const TOKEN = process.env.FRONT_API_TOKEN;

type Att = { id?: string; filename?: string; url?: string; content_type?: string };
const fget = async (p: string) => { const r = await fetch(`${FRONT}${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.json() : null; };
const dl = async (url: string) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };

async function storeStandardDocs(sb: ReturnType<typeof getSupabaseAdmin>, sourceMsgId: string, docs: StandardDoc[]): Promise<string[]> {
  const results: string[] = [];
  const msg = await fget(`/messages/${sourceMsgId}`);
  const atts = ((msg?.attachments ?? []) as Att[]).filter((a) => a.id && a.url);
  for (const std of docs) {
    const src = atts.find((a) => std.match.test(a.filename || ""));
    if (!src) { results.push(`${std.name}: source introuvable`); continue; }
    const buf = await dl(src.url!);
    if (!buf) { results.push(`${std.name}: download KO`); continue; }
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(std.storagePath, buf, { contentType: "application/pdf", upsert: true });
    results.push(`${std.name}: ${error ? "upload KO" : "OK"}`);
  }
  return results;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  if (!TOKEN) return NextResponse.json({ error: "FRONT_API_TOKEN manquant" }, { status: 500 });
  const sb = getSupabaseAdmin();

  const mila = await storeStandardDocs(sb, MILA_STANDARD_SOURCE_MSG_ID, MILA_STANDARD_DOCS);
  const axa = await storeStandardDocs(sb, AXA_STANDARD_SOURCE_MSG_ID, AXA_STANDARD_DOCS);

  return NextResponse.json({ success: true, mila, axa });
}
