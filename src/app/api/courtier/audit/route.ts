import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCourtierAudit } from "@/lib/courtier-audit";

// GET /api/courtier/audit[?pipelineId=]
// Sans pipelineId (admin) : audit global de l'étape « Récupération du RS ».
// Avec pipelineId : classification d'un seul dossier (pour la fiche).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const pipelineId = req.nextUrl.searchParams.get("pipelineId") ?? undefined;
  if (!pipelineId && !session.user.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });

  const audit = await getCourtierAudit(pipelineId);
  if (pipelineId) {
    return NextResponse.json({ row: audit.rows[0] ?? null });
  }
  // Global : compteurs + aperçu des remplissables et des incohérents (léger).
  const fillableList = audit.rows
    .filter((r) => r.fillable)
    .map((r) => ({ pipelineId: r.pipelineId, nom: r.nom, courtier: r.courtier, refNom: r.refNom, email: r.fillEmail }));
  const incoherents = audit.rows
    .filter((r) => r.bucket === "orange" && r.mail)
    .map((r) => ({ nom: r.nom, courtier: r.courtier, mail: r.mail, refNom: r.refNom }))
    .slice(0, 60);
  return NextResponse.json({ counts: audit.counts, total: audit.total, fillable: audit.fillable, fillableList, incoherents });
}
