import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { applyPerimeeRecovery } from "@/lib/perime";

// POST /api/perime/verify  { pipelineId }
// Automatisation 8 « clean avis d'échéance » — cherche dans Front une donnée plus
// récente (assureur / courtier / prime / échéance) pour ce dossier périmé. Si trouvé :
// remplit, aiguille le statut et retire la mention « donnée périmée ». Sinon : stand-by.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { pipelineId } = (await req.json().catch(() => ({}))) as { pipelineId?: string };
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const res = await applyPerimeeRecovery(pipelineId, session.user.email);
  return NextResponse.json({ success: true, ...res });
}
