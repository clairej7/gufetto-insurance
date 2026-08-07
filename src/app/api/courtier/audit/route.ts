import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCourtierAudit, getRsBatchHistory, getRsBatchCount } from "@/lib/courtier-audit";

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
  // Global : compteurs + détail du bucket ORANGE (adresse/assureur/courtier/mail)
  // pour un contrôle visuel avant remplissage.
  const orange = audit.rows
    .filter((r) => r.bucket === "orange")
    .map((r) => ({
      pipelineId: r.pipelineId, nom: r.nom, adresse: r.adresse, assureur: r.assureur,
      courtier: r.courtier, refNom: r.refNom, mail: r.mail,
      fillable: r.fillable, fillEmail: r.fillEmail,
    }))
    // remplissables d'abord (ce qu'on s'apprête à écrire), puis les incohérents.
    .sort((a, b) => Number(b.fillable) - Number(a.fillable));
  // Échantillon clean pour l'auto 4 : TOUS les verts (courtier + mail), déjà-envoyés
  // inclus (l'auto 4 triera nouvel envoi vs relance via draft_sent).
  const ready = audit.rows
    .filter((r) => r.bucket === "vert")
    // mail nettoyé (domaine courtier uniquement) — c'est ce qui sera envoyé.
    .map((r) => ({ pipelineId: r.pipelineId, nom: r.nom, adresse: r.adresse, assureur: r.assureur, courtier: r.courtier, mail: r.cleanMail ?? r.mail, rsSent: r.rsSent }));
  const history = await getRsBatchHistory();
  // Total de l'étape (dossiers déjà envoyés à l'auto 4 inclus) vs. encore à vérifier.
  const stepTotal = audit.total + (await getRsBatchCount());
  return NextResponse.json({ counts: audit.counts, total: audit.total, stepTotal, fillable: audit.fillable, orange, ready, history });
}
