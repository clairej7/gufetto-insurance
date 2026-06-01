import { NextRequest, NextResponse } from "next/server";

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

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "to, subject et body sont requis" }, { status: 400 });
  }

  // Fallback mailto si Front pas encore configuré
  if (!FRONT_TOKEN || !FRONT_CHANNEL_ID) {
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return NextResponse.json({ success: true, fallback: true, mailtoUrl });
  }

  // Upload des pièces jointes
  const attachmentTokens: string[] = [];
  for (const [, file] of [["contrat", contratFile], ["pv", pvFile]] as [string, File | null][]) {
    if (!file) continue;
    const buf = await file.arrayBuffer();
    const uploadForm = new FormData();
    uploadForm.append("attachment", new Blob([buf], { type: file.type }), file.name);
    const uploadRes = await fetch(`${FRONT_API_URL}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
      body: uploadForm,
    });
    if (uploadRes.ok) {
      const uploadData = await uploadRes.json();
      if (uploadData.token) attachmentTokens.push(uploadData.token);
    }
  }

  // Création du brouillon dans Front
  const draftPayload: Record<string, unknown> = {
    author_id: `alt:email:${FRONT_AUTHOR_EMAIL}`,
    to: [to],
    subject,
    body,
    type: "email",
  };
  if (attachmentTokens.length > 0) draftPayload.attachment_tokens = attachmentTokens;

  const draftRes = await fetch(`${FRONT_API_URL}/channels/${FRONT_CHANNEL_ID}/drafts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FRONT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draftPayload),
  });

  if (!draftRes.ok) {
    const err = await draftRes.text();
    return NextResponse.json({ error: `Erreur Front API: ${err}` }, { status: 500 });
  }

  const draft = await draftRes.json();
  return NextResponse.json({ success: true, draftId: draft.id });
}
