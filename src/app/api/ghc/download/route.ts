import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

// GET /api/ghc/download?run={id} — télécharge le .xlsx d'un run d'import GHC stocké
// (Supabase). Réservé admin. Les versions historiques statiques (v1/v2) sont servies
// directement depuis /public/ghc et ne passent pas par ici.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const runId = req.nextUrl.searchParams.get("run");
  if (!runId) return NextResponse.json({ error: "run requis" }, { status: 400 });

  const run = await prisma.ghcImportRun.findUnique({ where: { id: runId }, select: { fileName: true, label: true } });
  if (!run?.fileName || !run.fileName.startsWith("ghc-imports/")) {
    return NextResponse.json({ error: "Aucun fichier stocké pour cette version." }, { status: 404 });
  }

  const { data, error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(run.fileName);
  if (error || !data) return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 404 });

  const buf = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="GHC-${run.label ?? "import"}.xlsx"`,
    },
  });
}
