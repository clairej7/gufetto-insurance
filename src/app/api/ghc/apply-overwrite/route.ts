import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { applyGhcOverwriteChunk } from "@/lib/ghc-overwrite";

// POST /api/ghc/apply-overwrite { offset, limit }
// Mode ÉCRASEMENT : applique GhcContract sur les dossiers en corrigeant aussi les divergences
// (garde-fous : Matera/Wakam/placeholder/échéance-plus-ancienne/ODR-assureur-protégé/morts).
// Le client boucle les tranches. Réservé admin.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;
  const body = await req.json().catch(() => ({}));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(Math.max(1, Number(body.limit) || 120), 300);

  const r = await applyGhcOverwriteChunk(actor, offset, limit);
  if (r.done) {
    revalidatePath("/admin/automatisations");
    revalidatePath("/pipeline");
    revalidatePath("/tracking");
  }
  return NextResponse.json({ success: true, ...r });
}
