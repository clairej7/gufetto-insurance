import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { MILA_STANDARD_DOCS, MILA_STANDARD_SOURCE_MSG_ID } from "@/lib/devis-standard-docs";

// POST /api/admin/backfill-devis-docs (admin, one-shot, idempotent)
// Mila : télécharge une fois la CG + l'IPID standard depuis un mail Mila et les stocke
// aux chemins globaux (Supabase). Réexécutable sans créer de doublon.
// NB : PAS de backfill AXA — dans les mails d'Achille, le « Contrat MRI.pdf » est le
// contrat ACTUEL ré-échoé (pas l'offre AXA). Le devis AXA = uniquement le
// ProjetConditionsParticulieres déjà capturé en devis_axa. Ne rien ajouter côté AXA.
const FRONT = "https://api2.frontapp.com";
const TOKEN = process.env.FRONT_API_TOKEN;

type Att = { id?: string; filename?: string; url?: string; content_type?: string };
const fget = async (p: string) => { const r = await fetch(`${FRONT}${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? r.json() : null; };
const dl = async (url: string) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };

export async function POST() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  if (!TOKEN) return NextResponse.json({ error: "FRONT_API_TOKEN manquant" }, { status: 500 });
  const sb = getSupabaseAdmin();

  // ── Mila : stocker CG + IPID standard une fois ──────────────────────────────
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

  return NextResponse.json({ success: true, mila: milaResults });
}
