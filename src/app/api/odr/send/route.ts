import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tagConversation } from "@/lib/front";
import { getOdrByPartner, isOdrPartnerKey, renderOdrPdf, fillOdrLetterText, frenchDate, partnerLabel } from "@/lib/odr";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const FRONT_CHANNEL_ID = process.env.FRONT_CHANNEL_ID;
const FRONT_AUTHOR_EMAIL = process.env.FRONT_AUTHOR_EMAIL || "bonjour@matera.eu";

// POST /api/odr/send  { partner, to, subject? }
// Envoie UNE lettre ODR (PDF joint) à l'assureur avec la liste de ses copros en
// « ODR en cours » (prêtes = avec n°), puis passe ces dossiers en « ODR envoyées ».
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const partner: string = body.partner || "";
  const to: string = (body.to || "").trim();
  if (!isOdrPartnerKey(partner)) return NextResponse.json({ error: "partner invalide" }, { status: 400 });
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ error: "Destinataire (email) invalide" }, { status: 400 });

  // Source de vérité serveur : on renvoie les ODR prêts de l'assureur (jamais la liste du client).
  const bucket = (await getOdrByPartner()).find((b) => b.key === partner)!;
  const dossiers = bucket.ready;
  if (dossiers.length === 0) return NextResponse.json({ error: "Aucun dossier prêt à envoyer pour cet assureur" }, { status: 400 });

  const dateStr = frenchDate(new Date());
  const count = dossiers.length;
  const subject: string = (body.subject || "").trim() || `Ordre de Remplacement — Matera (${count} contrat${count > 1 ? "s" : ""})`;
  const coverText = `Bonjour,

Veuillez trouver ci-joint l'ordre de remplacement de Matera concernant ${count} contrat${count > 1 ? "s" : ""}, à résilier à leur prochaine échéance. Matera est mandaté comme nouveau cabinet de courtage pour l'établissement des nouveaux contrats.

Bien cordialement,
Matera
8 cité Paradis, 75010 Paris`;

  const pdf = await renderOdrPdf(dossiers, dateStr);
  const refTag = `odr:${partner}`;

  let conversationId = "";
  let fallback = false;
  let mailtoUrl: string | undefined;

  if (!FRONT_TOKEN || !FRONT_CHANNEL_ID) {
    // Repli dev : pas d'env Front → mailto (sans PJ) + on renvoie le texte de la lettre.
    fallback = true;
    mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(coverText)}`;
  } else {
    const hiddenRef = `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${refTag}</span>`;
    const htmlBody =
      coverText
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .split(/\n\n+/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("") + hiddenRef;

    const form = new FormData();
    form.append("author_id", `alt:email:${FRONT_AUTHOR_EMAIL}`);
    form.append("to[]", to);
    form.append("subject", subject);
    form.append("body", htmlBody);
    form.append("type", "email");
    form.append("attachments[]", new Blob([Buffer.from(pdf)], { type: "application/pdf" }), `ODR_${partner}_Matera.pdf`);

    const res = await fetch(`${FRONT_API_URL}/channels/${FRONT_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Erreur Front API: ${err}` }, { status: 500 });
    }
    const message = await res.json();
    const convUrl: string = message._links?.related?.conversation || message.conversation?.id || "";
    conversationId = convUrl.startsWith("http") ? convUrl.split("/").pop() || "" : convUrl;
    if (conversationId) await tagConversation(conversationId, ["tag_23n286"]);
  }

  // Passage en « ODR envoyées » de tous les dossiers de la lettre (+ trace).
  const label = partnerLabel(partner);
  await prisma.$transaction(
    dossiers.flatMap((d) => [
      prisma.insurancePipeline.update({
        where: { id: d.pipelineId },
        data: { statut: "odr_envoye", odrPartenaire: partner },
      }),
      prisma.pipelineEvent.create({
        data: {
          pipelineId: d.pipelineId,
          type: "statut_change",
          ancienStatut: "odr_en_cours",
          nouveauStatut: "odr_envoye",
          description: `Ordre de remplacement envoyé à ${label} (${to})${fallback ? " [mailto]" : ""}`,
          metadata: { odr: true, partner, to, subject, conversationId: conversationId || null, fallback },
          createdBy: actor,
        },
      }),
    ]),
  );

  return NextResponse.json({ success: true, sent: count, partner, conversationId, fallback, mailtoUrl });
}
