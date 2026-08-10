import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addManualDoc } from "@/lib/rs-docs";

// POST /api/rs4/upload-doc (multipart: file, pipelineId) — ajout manuel d'un doc
// (depuis le Drive). Typé auto par contenu, stocké dans Gufetto (Supabase).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const pipelineId = form.get("pipelineId") as string | null;
  if (!file || !pipelineId) return NextResponse.json({ error: "file et pipelineId requis" }, { status: 400 });
  const p = await prisma.insurancePipeline.findUnique({ where: { id: pipelineId }, select: { coproId: true, copro: { select: { nom: true, adresse: true } } } });
  if (!p) return NextResponse.json({ error: "dossier introuvable" }, { status: 404 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await addManualDoc({ pipelineId, coproId: p.coproId, adresse: p.copro.adresse || p.copro.nom, buffer, filename: file.name, createdBy: session.user.email ?? "manuel" });
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Échec de l'upload" }, { status: 500 });
  return NextResponse.json(r);
}
