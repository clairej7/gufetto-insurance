import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/devis7/preview?pipelineId=… (admin)
// Assemble les données nécessaires à la prévisualisation du mail au CS (auto 7) :
// contrat actuel + devis reçus (pour /api/devis/recommend), mails des membres du
// CS (pré-remplissage destinataires), et le PDF du devis recommandé (pièce jointe).
// Lecture seule.
type CsMember = { name: string; email: string };
const parseJson = <T,>(raw: string | null): T | null => { if (!raw) return null; try { return JSON.parse(raw) as T; } catch { return null; } };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const pipelineId = req.nextUrl.searchParams.get("pipelineId");
  if (!pipelineId) return NextResponse.json({ error: "pipelineId requis" }, { status: 400 });

  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, contactCsNom: true, contactCsEmail: true, primeActuelle: true, gestionnaireNom: true, gestionnaireEmail: true, csMembersData: true } },
      devisRecus: { orderBy: { primeTTC: "asc" }, select: { assureur: true, primeTTC: true, data: true, pdfUrl: true, pdfName: true, recommande: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });

  const contratActuel = parseJson<Record<string, unknown>>(p.contratActuelData) ?? {};
  const devis = p.devisRecus.map((d) => ({ assureur: d.assureur, primeTTC: d.primeTTC, data: parseJson<Record<string, unknown>>(d.data) ?? {} }));
  // Devis recommandé : celui marqué, sinon le moins cher (1er par tri prime asc).
  const recoRow = p.devisRecus.find((d) => d.recommande) ?? p.devisRecus[0] ?? null;

  const members = (parseJson<CsMember[]>(p.copro.csMembersData) ?? []).filter((m) => m?.email);
  const csEmails = members.map((m) => m.email).join("; ");

  return NextResponse.json({
    success: true,
    copro: {
      nom: p.copro.nom, adresse: p.copro.adresse, contactCsNom: p.copro.contactCsNom,
      primeActuelle: p.copro.primeActuelle, primePayee: null,
      gestionnaireEmail: p.copro.gestionnaireEmail, gestionnaireNom: p.copro.gestionnaireNom,
    },
    contratActuel, devis,
    recommandeAssureur: recoRow?.assureur ?? null,
    csEmails,
    recoPdfPath: recoRow?.pdfUrl ?? null,
    recoPdfName: recoRow?.pdfName ?? null,
    subject: "Matera - Renégociation de votre contrat MRI",
  });
}
