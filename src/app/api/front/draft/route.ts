import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";
import { resolveTeammateId, assignConversation, tagConversation, getSignatureHtml } from "@/lib/front";
import { auth } from "@/lib/auth";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const FRONT_CHANNEL_ID = process.env.FRONT_CHANNEL_ID;
const FRONT_AUTHOR_EMAIL = process.env.FRONT_AUTHOR_EMAIL || "bonjour@matera.eu";
// Le canal d'envoi est rattaché à l'inbox CSM : sans action, la conversation
// naît dans « CSM » (et la règle Front sur le tag ne fait que l'AJOUTER à
// Gufetto → elle apparaît dans les deux). On la déplace explicitement dans
// l'inbox « Assurance Pro - Gufetto » pour qu'elle n'atterrisse QUE là.
const FRONT_GUFETTO_INBOX_ID = process.env.FRONT_GUFETTO_INBOX || "inb_601dy";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const to = formData.get("to") as string;
  const subject = formData.get("subject") as string;
  const body = formData.get("body") as string;
  const contratFile = formData.get("contrat") as File | null;
  const pvFile = formData.get("pv") as File | null;
  const devisFile = formData.get("devis") as File | null;
  const signedPdfPath = formData.get("signedPdfPath") as string | null;
  const refTag = formData.get("refTag") as string | null; // format: "{pipelineId}:{type}"
  // pipelineId fourni en clair par les callers, ou dérivé du refTag (1re partie avant ":")
  const pipelineId = (formData.get("pipelineId") as string | null) || (refTag ? refTag.split(":")[0] : null);

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject et body sont requis" }, { status: 400 });
  }

  // Fallback mailto si Front pas encore configuré
  if (!FRONT_TOKEN || !FRONT_CHANNEL_ID) {
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return NextResponse.json({ success: true, fallback: true, mailtoUrl });
  }

  // Ref cachée pour identifier les réponses dans le webhook Front
  const hiddenRef = refTag
    ? `<span style="display:none;font-size:0;line-height:0;color:transparent">gufetto-ref:${refTag}</span>`
    : "";

  // Expéditeur = l'utilisateur connecté (Quentin, …), pas une adresse de service.
  // Sa signature Front est ajoutée en pied de mail.
  const session = await auth();
  const authorEmail = session?.user?.email || FRONT_AUTHOR_EMAIL;
  const signatureHtml = await getSignatureHtml(authorEmail);

  const htmlBody = body
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("") + (signatureHtml ? `<br>${signatureHtml}` : "") + hiddenRef;

  // Création du brouillon en multipart pour supporter les PJ
  const draftForm = new FormData();
  draftForm.append("author_id", `alt:email:${authorEmail}`);
  draftForm.append("to[]", to);
  draftForm.append("subject", subject);
  draftForm.append("body", htmlBody);
  draftForm.append("type", "email");

  // PJ supplémentaires (ex. RS partie 2, 2e contrat) — champ répétable "extra".
  const extraFiles = formData.getAll("extra").filter((f): f is File => f instanceof File);
  for (const file of [contratFile, pvFile, devisFile, ...extraFiles]) {
    if (!file) continue;
    const buf = await file.arrayBuffer();
    draftForm.append("attachments[]", new Blob([buf], { type: file.type }), file.name);
  }

  // PJ contrat signé depuis Supabase Storage (chemin direct)
  console.log("[front/draft] signedPdfPath reçu:", signedPdfPath);
  if (signedPdfPath) {
    const { data: pdfData, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(signedPdfPath);
    console.log("[front/draft] download Supabase:", { ok: !!pdfData, error: error?.message });
    if (!error && pdfData) {
      const buf = await pdfData.arrayBuffer();
      console.log("[front/draft] PDF size bytes:", buf.byteLength);
      draftForm.append("attachments[]", new Blob([buf], { type: "application/pdf" }), "contrat_signe_matera.pdf");
    }
  }

  const draftRes = await fetch(`${FRONT_API_URL}/channels/${FRONT_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
    body: draftForm,
  });

  if (!draftRes.ok) {
    const err = await draftRes.text();
    return NextResponse.json({ error: `Erreur Front API: ${err}` }, { status: 500 });
  }

  const message = await draftRes.json();
  // Extraire le conversationId depuis les liens Front
  const convUrl: string = message._links?.related?.conversation || message.conversation?.id || "";
  const conversationId: string = convUrl.startsWith("http") ? convUrl.split("/").pop() || "" : convUrl;

  // Tagger la conversation avec gufetto_insurance pour filtrer dans les Rules Front
  console.log("[front/draft] conversationId extrait:", conversationId);
  if (conversationId) {
    // 409 récurrent : la conv vient de naître et n'est pas encore rattachée à son
    // inbox. tagConversation réessaie avec un backoff jusqu'à ce qu'elle le soit.
    const tag = await tagConversation(conversationId, ["tag_23n286"]);
    console.log("[front/draft] tag response:", tag);

    // Assigner le ticket au gestionnaire de la copro (best-effort, ne bloque jamais l'envoi)
    if (pipelineId) {
      try {
        const pipeline = await prisma.insurancePipeline.findUnique({
          where: { id: pipelineId },
          select: { copro: { select: { gestionnaireEmail: true } } },
        });
        const gestionnaireEmail = pipeline?.copro?.gestionnaireEmail;
        if (gestionnaireEmail) {
          const teammateId = await resolveTeammateId(gestionnaireEmail);
          if (teammateId) {
            const ok = await assignConversation(conversationId, teammateId);
            console.log("[front/draft] assign:", { gestionnaireEmail, teammateId, ok });
          } else {
            console.warn("[front/draft] gestionnaire introuvable sur Front:", gestionnaireEmail);
          }
        }
      } catch (e) {
        console.error("[front/draft] assign error:", e);
      }
    }
    // Déplace dans l'inbox Gufetto ET passe en « resolved » (archived) dans le
    // MÊME PATCH — APRÈS le tag/assignation (qui remettent « open »). Un seul
    // appel atomique : le move seul rouvrirait la conversation. Une réponse du
    // destinataire la rouvrira. best-effort, ne bloque jamais l'envoi.
    await fetch(`${FRONT_API_URL}/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inbox_id: FRONT_GUFETTO_INBOX_ID, status: "archived" }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, messageId: message.id, conversationId });
}
