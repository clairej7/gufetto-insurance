import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const FRONT_CHANNEL_ID = process.env.FRONT_CHANNEL_ID;
const FRONT_AUTHOR_EMAIL = process.env.FRONT_AUTHOR_EMAIL || "bonjour@matera.eu";

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

  const htmlBody = body
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("") + hiddenRef;

  // Création du brouillon en multipart pour supporter les PJ
  const draftForm = new FormData();
  draftForm.append("author_id", `alt:email:${FRONT_AUTHOR_EMAIL}`);
  draftForm.append("to[]", to);
  draftForm.append("subject", subject);
  draftForm.append("body", htmlBody);
  draftForm.append("type", "email");

  for (const file of [contratFile, pvFile, devisFile]) {
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
    const tagRes = await fetch(`${FRONT_API_URL}/conversations/${conversationId}/tags`, {
      method: "POST",
      headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tag_ids: ["tag_23jeh2"] }),
    }).catch((e) => { console.error("[front/draft] tag fetch error:", e); return null; });
    if (tagRes) {
      const tagBody = await tagRes.text();
      console.log("[front/draft] tag response:", tagRes.status, tagBody);
    }
  }

  return NextResponse.json({ success: true, messageId: message.id, conversationId });
}
