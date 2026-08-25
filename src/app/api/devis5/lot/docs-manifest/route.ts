import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

const sanitize = (s: string) => s.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim();
const extOf = (p: string) => { const m = p.match(/\.[a-z0-9]{2,5}$/i); return m ? m[0] : ".pdf"; };

// POST /api/devis5/lot/docs-manifest { lotId }
// Renvoie la liste des RS + contrats MRI du lot, chacun avec une URL SIGNÉE
// Supabase (téléchargement direct par le navigateur → pas de proxy serveur).
// Le zip est construit côté client (JSZip) avec barre de progression.
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
  const byPath = new Map<string, string>(); // storagePath -> zip name
  for (const d of docs) {
    const folder = sanitize(d.pipeline.copro.nom || "Sans nom");
    const base = sanitize(d.fileName || d.kind);
    const ext = extOf(d.storagePath);
    let name = `${folder}/${base}${ext}`;
    let i = 2;
    while (used.has(name)) { name = `${folder}/${base} (${i})${ext}`; i++; }
    used.add(name);
    byPath.set(d.storagePath, name);
  }

  const paths = [...byPath.keys()];
  const { data, error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return NextResponse.json({ error: "signature URLs échouée" }, { status: 500 });

  const files = data
    .filter((s) => s.signedUrl && s.path)
    .map((s) => ({ name: byPath.get(s.path as string) ?? (s.path as string), url: s.signedUrl as string }));

  const d = lot.createdAt;
  const zipName = `Docs_RS_Contrats_Matera_${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}.zip`;
  return NextResponse.json({ files, zipName });
}
