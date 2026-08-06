import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { applyGhcChunk } from "@/lib/ghc";

// POST /api/ghc/apply  { offset, limit, runId? }
// Applique UNE tranche de l'excel GHC (table GhcContract) sur les dossiers. Le client
// boucle les tranches (barre de progression). Réservé admin.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(Math.max(1, Number(body.limit) || 150), 400);
  const runId = (body.runId as string) || null;

  const r = await applyGhcChunk(actor, offset, limit, runId);

  if (r.done) {
    revalidatePath("/admin/automatisations");
    revalidatePath("/pipeline");
    revalidatePath("/tracking");
  }
  return NextResponse.json({ success: true, ...r });
}
