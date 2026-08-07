import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { autofillCourtierMails } from "@/lib/courtier-audit";

// POST /api/courtier/autofill  { pipelineId? }
// Remplit le mail courtier via la base pour les dossiers « courtier valable mais
// sans mail » (match sûr). Ne remplace jamais un mail existant. Admin pour le
// batch global ; un dossier précis reste possible via pipelineId.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pipelineId: string | undefined = body?.pipelineId;
  if (!pipelineId && !session.user.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const res = await autofillCourtierMails(session.user.email!, pipelineId);
  return NextResponse.json({
    filled: res.filled,
    details: res.details,
    before: { counts: res.before.counts, total: res.before.total, fillable: res.before.fillable },
    after: { counts: res.after.counts, total: res.after.total, fillable: res.after.fillable },
  });
}
