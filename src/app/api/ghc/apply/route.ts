import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyGhcImport } from "@/lib/ghc";

// POST /api/ghc/apply  { label?, fileName? }
// Applique l'excel GHC (table GhcContract) sur les dossiers Gufetto. Réservé admin.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const n = await prisma.ghcImportRun.count();
  const label = (body.label as string) || `v${n + 1}`;
  const fileName = (body.fileName as string) || "[Matera x GHC] Cleaning contrats assurance.xlsx";

  const r = await applyGhcImport(actor, label, fileName);

  revalidatePath("/admin/automatisations");
  revalidatePath("/pipeline");
  revalidatePath("/tracking");
  return NextResponse.json({ success: true, ...r });
}
