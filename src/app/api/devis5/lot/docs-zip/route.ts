import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import * as archiverNs from "archiver";
import { auth } from "@/lib/auth";

// archiver est exporté en CommonJS (`export =`) → on caste le module en fonction.
const createArchive = archiverNs as unknown as (format: string, options?: archiverNs.ArchiverOptions) => archiverNs.Archiver;
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

export const maxDuration = 300; // laisser le temps de zipper ~200 PDF

const sanitize = (s: string) => s.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim();
const extOf = (p: string) => { const m = p.match(/\.[a-z0-9]{2,5}$/i); return m ? m[0] : ".pdf"; };

// POST /api/devis5/lot/docs-zip { lotId } — ZIP en streaming de tous les RS +
// contrats MRI des dossiers du lot, un sous-dossier par copro, noms Gufetto conservés.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { lotId } = await req.json().catch(() => ({}));
  if (!lotId) return NextResponse.json({ error: "lotId requis" }, { status: 400 });

  const lot = await prisma.devis5Lot.findUnique({ where: { id: lotId } });
  if (!lot) return NextResponse.json({ error: "lot introuvable" }, { status: 404 });
  let ids: string[] = [];
  try { ids = JSON.parse(lot.pipelineIds) as string[]; } catch { ids = []; }

  const docs = await prisma.pipelineDocument.findMany({
    where: { pipelineId: { in: ids }, kind: { in: ["rs", "contrat_mri"] } },
    select: { fileName: true, storagePath: true, kind: true, part: true, pipeline: { select: { copro: { select: { nom: true } } } } },
    orderBy: [{ kind: "asc" }, { part: "asc" }],
  });
  if (!docs.length) return NextResponse.json({ error: "aucun document" }, { status: 404 });

  // Chemins dans le zip : <copro>/<fileName>.<ext>, dédupliqués par dossier.
  const used = new Set<string>();
  const entries = docs.map((d) => {
    const folder = sanitize(d.pipeline.copro.nom || "Sans nom");
    const base = sanitize(d.fileName || d.kind);
    const ext = extOf(d.storagePath);
    let name = `${folder}/${base}${ext}`;
    let i = 2;
    while (used.has(name)) { name = `${folder}/${base} (${i})${ext}`; i++; }
    used.add(name);
    return { storagePath: d.storagePath, name };
  });

  const archive = createArchive("zip", { zlib: { level: 6 } });
  archive.on("error", () => { try { archive.destroy(); } catch { /* noop */ } });

  (async () => {
    const sb = getSupabaseAdmin();
    for (const e of entries) {
      try {
        const { data, error } = await sb.storage.from(STORAGE_BUCKET).download(e.storagePath);
        if (error || !data) continue;
        archive.append(Buffer.from(await data.arrayBuffer()), { name: e.name });
      } catch { /* on saute ce fichier */ }
    }
    archive.finalize().catch(() => {});
  })();

  const webStream = Readable.toWeb(archive as unknown as Readable) as unknown as ReadableStream;
  const d = lot.createdAt;
  const fname = `Docs_RS_Contrats_Matera_${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}.zip`;
  return new NextResponse(webStream, {
    status: 200,
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
