import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import JSZip from "jszip";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { runDevis6Compare } from "@/lib/devis6-compare";
import manifest from "@/data/import-devis-axa.json";

export const maxDuration = 300;

type Entry = { file: string; pipelineId: string; coproId: string; coproNom: string; adresse: string; statut: string; action: string };
const MANIFEST = manifest as Entry[];
const base = (p: string) => p.split("/").pop() || p;

// GET — prévisualisation : manifest + statut ACTUEL + doc déjà présent ? (aucune écriture)
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const ids = MANIFEST.map((m) => m.pipelineId);
  const pipes = await prisma.insurancePipeline.findMany({ where: { id: { in: ids } }, select: { id: true, statut: true, documents: { where: { kind: "devis_axa" }, select: { id: true } } } });
  const byId = new Map(pipes.map((p) => [p.id, p]));
  const rows = MANIFEST.map((m) => {
    const p = byId.get(m.pipelineId);
    return { file: m.file, coproNom: m.coproNom, action: m.action, statutManifest: m.statut, statutActuel: p?.statut ?? "INTROUVABLE", docDejaPresent: (p?.documents.length ?? 0) > 0 };
  });
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.action] = (a[r.action] || 0) + 1), a), {});
  return NextResponse.json({ success: true, total: rows.length, counts, rows });
}

// POST — exécution : upload du zip, pour chaque devis → doc devis_axa + move/regen/skip.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email ?? "import-devis-axa";

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Zip requis (champ 'file')" }, { status: 400 });

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
  catch { return NextResponse.json({ error: "Zip illisible" }, { status: 400 }); }

  // index des fichiers du zip par nom de base
  const zipByBase = new Map<string, JSZip.JSZipObject>();
  zip.forEach((path, obj) => { if (!obj.dir && path.toLowerCase().endsWith(".pdf")) zipByBase.set(base(path), obj); });

  const report: { file: string; copro: string; docStored: boolean; stepMoved: boolean; compared: boolean; note: string }[] = [];
  let stored = 0, moved = 0, compared = 0, errors = 0;

  for (const m of MANIFEST) {
    const line = { file: m.file, copro: m.coproNom, docStored: false, stepMoved: false, compared: false, note: "" };
    try {
      const entry = zipByBase.get(base(m.file));
      if (!entry) { line.note = "PDF absent du zip"; errors++; report.push(line); continue; }

      const pipe = await prisma.insurancePipeline.findUnique({ where: { id: m.pipelineId }, select: { statut: true, documents: { where: { kind: "devis_axa" }, select: { id: true } } } });
      if (!pipe) { line.note = "dossier introuvable"; errors++; report.push(line); continue; }

      // 1) Stocker le doc devis_axa (idempotent : on ne double pas si déjà présent)
      if (pipe.documents.length > 0) {
        line.note = "doc devis_axa déjà présent (non ré-uploadé)";
      } else {
        const buf = Buffer.from(await entry.async("arraybuffer"));
        const storagePath = `insurance/${m.coproId}/devis-axa-${crypto.randomUUID()}.pdf`;
        const { error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(storagePath, buf, { contentType: "application/pdf", upsert: true });
        if (error) { line.note = `upload Supabase KO: ${error.message}`; errors++; report.push(line); continue; }
        await prisma.pipelineDocument.create({ data: { pipelineId: m.pipelineId, coproId: m.coproId, kind: "devis_axa", storagePath, fileName: `${m.adresse} - Devis AXA`, source: "manuel", createdBy: actor } });
        line.docStored = true; stored++;
      }

      // 2) Étape / comparaison selon l'action
      if (m.action === "move") {
        if (pipe.statut === "devis_demandes") {
          await prisma.$transaction([
            prisma.insurancePipeline.update({ where: { id: m.pipelineId }, data: { statut: "devis_recus" } }),
            prisma.pipelineEvent.create({ data: { pipelineId: m.pipelineId, type: "statut_change", ancienStatut: "devis_demandes", nouveauStatut: "devis_recus", description: "Devis AXA reçu (import en masse) — passage à la comparaison des devis", metadata: { auto: "import_devis_axa" }, createdBy: actor } }),
          ]);
          line.stepMoved = true; moved++;
        } else { line.note = (line.note ? line.note + " · " : "") + `statut ${pipe.statut} (pas devis_demandes) → étape inchangée`; }
      } else if (m.action === "regen") {
        const r = await runDevis6Compare(m.pipelineId, actor);
        if (r.ok) { line.compared = true; compared++; line.note = (line.note ? line.note + " · " : "") + `comparaison régénérée (${r.devis.length} devis)`; }
        else { line.note = (line.note ? line.note + " · " : "") + `regen KO: ${r.error}`; errors++; }
      } else if (m.action === "skip") {
        line.note = (line.note ? line.note + " · " : "") + "envoyé au CS → doc seul, aucune autre action";
      }
      report.push(line);
    } catch (e) {
      line.note = `erreur: ${e instanceof Error ? e.message : String(e)}`; errors++; report.push(line);
    }
  }

  return NextResponse.json({ success: true, summary: { total: MANIFEST.length, docsStored: stored, stepsMoved: moved, compared, errors }, report });
}
