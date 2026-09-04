import { NextRequest, NextResponse } from "next/server";
import { verifyOdrWeekToken, getOdrAcceptesSemaine, setPrevenirCs } from "@/lib/odr-suivi";

// POST /api/odr-suivi/prevenir  { token, pipelineId, on }
// Appelé par la page publique tokenisée « Suivi des ODR acceptés ». Le token de
// semaine EST l'autorisation ; on vérifie en plus que le dossier appartient bien à
// la semaine du token (empêche de flagger un dossier arbitraire).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; pipelineId?: string; on?: boolean };
  const weekIso = body.token ? verifyOdrWeekToken(body.token) : null;
  if (!weekIso) return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 401 });
  if (!body.pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const rows = await getOdrAcceptesSemaine(new Date(weekIso));
  if (!rows.some((r) => r.pipelineId === body.pipelineId)) {
    return NextResponse.json({ error: "Dossier hors de cette semaine" }, { status: 400 });
  }
  await setPrevenirCs(body.pipelineId, body.on !== false, "gestionnaire (lien Slack)");
  return NextResponse.json({ success: true });
}
