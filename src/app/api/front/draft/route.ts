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

  const htmlBody = body
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");

  // Création du brouillon en multipart pour supporter les PJ
  const draftForm = new FormData();
  draftForm.append("author_id", `alt:email:${FRONT_AUTHOR_EMAIL}`);
  draftForm.append("to[]", to);
  draftForm.append("subject", subject);
  draftForm.append("body", htmlBody);
  draftForm.append("type", "email");

  for (const file of [contratFile, pvFile]) {
    if (!file) continue;
    const buf = await file.arrayBuffer();
    draftForm.append("attachments[]", new Blob([buf], { type: file.type }), file.name);
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
  return NextResponse.json({ success: true, messageId: message.id });
}
