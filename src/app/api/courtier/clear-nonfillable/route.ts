import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clearNonFillableCourtiers } from "@/lib/courtier-audit";

// POST /api/courtier/clear-nonfillable  { pipelineId? }
// Bascule les dossiers orange NON remplissables (courtier hors base) en « sans
// courtier » (vide courtierActuel, garde le nom en event, pose le cliquet).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pipelineId: string | undefined = body?.pipelineId;
  if (!pipelineId && !session.user.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const res = await clearNonFillableCourtiers(session.user.email!, pipelineId);
  return NextResponse.json({
    cleared: res.cleared,
    details: res.details,
    after: { counts: res.after.counts, total: res.after.total, fillable: res.after.fillable },
  });
}
