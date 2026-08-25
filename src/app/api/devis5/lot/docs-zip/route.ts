import { NextRequest, NextResponse } from "next/server";
import { Archiver } from "archiver";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

const sanitize = (s: string) => s.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim();
const extOf = (p: string) => { const m = p.match(/\.[a-z0-9]{2,5}$/i); return m ? m[0] : ".pdf"; };

// POST /api/devis5/lot/docs-zip { lotId } — ZIP (streaming) de tous les RS +
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

  const archive = new Archiver("zip", { zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", () => { /* fichiers manquants tolérés */ });
      archive.on("error", (err) => { try { controller.error(err); } catch { /* déjà fermé */ } });
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
    },
  });

  const d = lot.createdAt;
  const fname = `Docs_RS_Contrats_Matera_${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}.zip`;
  return new NextResponse(stream, {
    status: 200,
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
