import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteDossierFromAuto } from "@/lib/rs4";

// POST /api/rs4/delete-dossier { pipelineId } — sort la copro de TOUTES les
// automatisations (exclusion définitive) + archive ses conversations Front.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { pipelineId } = await req.json().catch(() => ({}));
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });
  const r = await deleteDossierFromAuto(String(pipelineId), session.user.email!);
  if (!r.ok) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
  return NextResponse.json(r);
}
