import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyValidationToken } from "@/lib/devis6-token";
import { postToDevisChannel } from "@/lib/devis6-slack";

// POST /api/valider-devis { token, reponse: "valide"|"refus", comment? }
// PUBLIC (gated by signed token) — réponse du gestionnaire à la proposition de
// devis. Journalise la réponse (→ colonne Statut de l'auto 6) + renvoie l'info
// dans le canal Slack. Ne change PAS l'étape du dossier (l'envoi CS reste manuel).
export async function POST(req: NextRequest) {
  const { token, reponse, comment } = (await req.json().catch(() => ({}))) as { token?: string; reponse?: string; comment?: string };
  const pipelineId = token ? verifyValidationToken(token) : null;
  if (!pipelineId) return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 401 });
  if (reponse !== "valide" && reponse !== "refus") return NextResponse.json({ error: "Réponse invalide" }, { status: 400 });

  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { id: true, statut: true, copro: { select: { nom: true, adresse: true, gestionnaireNom: true } } },
  });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  const cleanComment = (comment ?? "").toString().slice(0, 1000).trim();
  await prisma.pipelineEvent.create({
    data: {
      pipelineId, type: "action_manuelle",
      description: `Réponse gestionnaire : ${reponse === "valide" ? "transmission au CS confirmée" : "ne pas envoyer"}${cleanComment ? ` — « ${cleanComment} »` : ""}`,
      metadata: { auto: "devis6_gestio_response", reponse, comment: cleanComment || null },
      createdBy: "gestionnaire:validation",
    },
  });

  // NB : la validation gestionnaire NE déplace PLUS automatiquement le dossier vers
  // l'auto 7. Le passage se fait par lot via le bouton « Envoyer les X dossiers
  // prêts à l'automatisation 7 » (/api/devis6/send-to-auto7). Ici on ne fait
  // qu'enregistrer la réponse (→ statut « Validé ! » dans l'auto 6).

  // Retour dans le canal Slack (best-effort) pour boucler côté Quentin.
  const who = p.copro.gestionnaireNom || "Le gestionnaire";
  const dossier = p.copro.adresse || p.copro.nom;
  const head = reponse === "valide"
    ? `✅ *${who}* a *confirmé* la transmission au CS — ${dossier}`
    : `🚫 *${who}* a demandé de *ne pas envoyer* — ${dossier}`;
  await postToDevisChannel(cleanComment ? `${head}\n💬 _${cleanComment}_` : head).catch(() => {});

  return NextResponse.json({ success: true });
}
