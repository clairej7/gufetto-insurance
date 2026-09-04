import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import JSZip from "jszip";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { runDevis6Compare } from "@/lib/devis6-compare";
import { buildCoproMatcher } from "@/lib/devis-match";

export const maxDuration = 300;

const base = (p: string) => (p.split("/").pop() || p).replace(/\.pdf$/i, "");

// Historique des imports — stocké dans AutomationExclusion (kind "devis5_import",
// value = timestamp ISO, payload JSON dans label).
const HIST_KIND = "devis5_import";
type ImportSummary = { total: number; rattaches: number; docsStored: number; stepsMoved: number; compared: number; nonRattaches: number; errors: number };
export type ImportHistoryRow = ImportSummary & { at: string; by: string | null };

async function getImportHistory(): Promise<ImportHistoryRow[]> {
  const recs = await prisma.automationExclusion.findMany({ where: { kind: HIST_KIND }, orderBy: { value: "desc" }, take: 30 });
  const out: ImportHistoryRow[] = [];
  for (const r of recs) {
    try { const p = JSON.parse(r.label ?? "{}"); out.push({ at: r.value, total: p.total ?? 0, rattaches: p.rattaches ?? 0, docsStored: p.docsStored ?? 0, stepsMoved: p.stepsMoved ?? 0, compared: p.compared ?? 0, nonRattaches: p.nonRattaches ?? 0, errors: p.errors ?? 0, by: p.by ?? null }); } catch { /* skip */ }
  }
  return out;
}

// GET — historique seul (pour le menu déroulant).
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  return NextResponse.json({ success: true, history: await getImportHistory() });
}

// POST — dépôt d'un zip de devis AXA (PDF nommés par adresse). Chaque devis :
// rattaché à sa copro (par adresse) → doc `devis_axa` + avancement selon l'étape.
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

  const pdfs: { name: string; obj: JSZip.JSZipObject }[] = [];
  zip.forEach((path, obj) => { if (!obj.dir && path.toLowerCase().endsWith(".pdf")) pdfs.push({ name: base(path), obj }); });
  if (!pdfs.length) return NextResponse.json({ error: "Aucun PDF dans le zip" }, { status: 400 });

  const matcher = await buildCoproMatcher();
  const report: { file: string; copro: string; docStored: boolean; stepMoved: boolean; compared: boolean; note: string }[] = [];
  const s: ImportSummary = { total: pdfs.length, rattaches: 0, docsStored: 0, stepsMoved: 0, compared: 0, nonRattaches: 0, errors: 0 };

  for (const { name, obj } of pdfs) {
    const line = { file: name, copro: "—", docStored: false, stepMoved: false, compared: false, note: "" };
    try {
      const { match, reason } = matcher(name);
      if (!match || !match.pipelineId) {
        s.nonRattaches++;
        line.note = reason === "ambigu" ? "plusieurs copros possibles → à rattacher à la main" : reason === "aucun" ? "aucune copro trouvée → à rattacher à la main" : "copro sans dossier";
        report.push(line); continue;
      }
      s.rattaches++; line.copro = match.coproNom;
      const pipelineId = match.pipelineId;

      // 1) Doc devis_axa (idempotent)
      const existing = await prisma.pipelineDocument.count({ where: { pipelineId, kind: "devis_axa" } });
      if (existing > 0) {
        line.note = "doc devis_axa déjà présent";
      } else {
        const buf = Buffer.from(await obj.async("arraybuffer"));
        const storagePath = `insurance/${match.coproId}/devis-axa-${crypto.randomUUID()}.pdf`;
        const { error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(storagePath, buf, { contentType: "application/pdf", upsert: true });
        if (error) { line.note = `upload Supabase KO: ${error.message}`; s.errors++; report.push(line); continue; }
        await prisma.pipelineDocument.create({ data: { pipelineId, coproId: match.coproId, kind: "devis_axa", storagePath, fileName: `${match.adresse} - Devis AXA`, source: "manuel", createdBy: actor } });
        line.docStored = true; s.docsStored++;
      }

      // 2) Avancement selon l'étape actuelle
      if (match.statut === "devis_demandes") {
        await prisma.$transaction([
          prisma.insurancePipeline.update({ where: { id: pipelineId }, data: { statut: "devis_recus" } }),
          prisma.pipelineEvent.create({ data: { pipelineId, type: "statut_change", ancienStatut: "devis_demandes", nouveauStatut: "devis_recus", description: "Devis AXA reçu (import en masse) — passage à la comparaison des devis", metadata: { auto: "import_devis_axa" }, createdBy: actor } }),
        ]);
        line.stepMoved = true; s.stepsMoved++;
      } else if (match.statut === "devis_recus") {
        const r = await runDevis6Compare(pipelineId, actor);
        if (r.ok) { line.compared = true; s.compared++; line.note = (line.note ? line.note + " · " : "") + `comparaison régénérée (${r.devis.length} devis)`; }
        else { line.note = (line.note ? line.note + " · " : "") + `regen KO: ${r.error}`; s.errors++; }
      } else {
        line.note = (line.note ? line.note + " · " : "") + `étape « ${match.statut} » → doc seul`;
      }
      report.push(line);
    } catch (e) {
      line.note = `erreur: ${e instanceof Error ? e.message : String(e)}`; s.errors++; report.push(line);
    }
  }

  await prisma.automationExclusion.create({ data: { kind: HIST_KIND, value: new Date().toISOString(), label: JSON.stringify({ ...s, by: actor }), createdBy: actor } });
  return NextResponse.json({ success: true, summary: s, report });
}
