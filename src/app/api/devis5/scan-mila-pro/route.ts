import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scanMilaDevisPro } from "@/lib/mila-devis";

// POST /api/devis5/scan-mila-pro { offset, limit } — rapatrie les devis Mila
// arrivés hors de notre fil (nouveaux mails « Votre devis Multirisque Immeuble »)
// dans l'inbox Gufetto + les rattache au dossier via building_id.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { offset = 0, limit = 20 } = await req.json().catch(() => ({}));
  const r = await scanMilaDevisPro(Number(offset) || 0, Number(limit) || 20);
  return NextResponse.json({ ok: true, ...r });
}
