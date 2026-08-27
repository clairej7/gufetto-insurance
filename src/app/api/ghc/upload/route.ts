import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { parseGhcXlsx, replaceGhcContracts } from "@/lib/ghc";

// POST /api/ghc/upload (multipart: file) — importe un nouvel excel GHC en self-service.
// Parse le .xlsx (mêmes colonnes que le script), REMPLACE GhcContract, stocke le fichier
// (Supabase) et enregistre le run d'import (téléchargeable depuis l'historique). Réservé admin.
// N'APPLIQUE PAS aux dossiers : c'est le bouton « Appliquer » qui le fait ensuite.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Fichier .xlsx requis" }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: "Format attendu : .xlsx" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows;
  try {
    rows = await parseGhcXlsx(buffer);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Excel illisible" }, { status: 400 });
  }
  if (rows.length < 100) {
    return NextResponse.json({ error: `Seulement ${rows.length} lignes lues — fichier suspect, import annulé.` }, { status: 400 });
  }

  // Stockage du fichier brut (téléchargement ultérieur depuis l'historique).
  const storagePath = `ghc-imports/${Date.now()}.xlsx`;
  const { error: upErr } = await getSupabaseAdmin().storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
  if (upErr) return NextResponse.json({ error: `Stockage échoué : ${upErr.message}` }, { status: 500 });

  let res;
  try {
    res = await replaceGhcContracts(rows, storagePath, actor);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import annulé" }, { status: 400 });
  }

  revalidatePath("/admin/automatisations");
  return NextResponse.json({ success: true, ...res });
}
