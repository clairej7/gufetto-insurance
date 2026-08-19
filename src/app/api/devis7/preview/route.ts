import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDernierePrimePayeeFromFront } from "@/lib/front-insurance";
import { MILA_STANDARD_DOCS, AXA_STANDARD_DOCS } from "@/lib/devis-standard-docs";
import { resolvePrimeReference } from "@/lib/devis-prime";

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
      copro: { select: { nom: true, adresse: true, buildingId: true, contactCsNom: true, contactCsEmail: true, primeActuelle: true, gestionnaireNom: true, gestionnaireEmail: true, csMembersData: true } },
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

  // Pack de PJ à joindre au CS selon l'assureur recommandé :
  //  - AXA  : les docs devis_axa du dossier (Contrat MRI + Conditions particulières) ;
  //  - Mila : les docs devis_mila du dossier + CG/IPID standard globaux.
  const recoAssureur = recoRow?.assureur ?? "";
  let pack: { storagePath: string; name: string }[] = [];
  const docKind = /axa/i.test(recoAssureur) ? "devis_axa" : /mila/i.test(recoAssureur) ? "devis_mila" : null;
  if (docKind) {
    // Un seul devis dossier par assureur : on prend le PLUS RÉCENT (l'assureur
    // renvoie parfois son devis → plusieurs docs captés). C'est aussi celui que
    // l'étape de comparaison utilise (find = le plus récent) → cohérent avec le prix
    // affiché dans le mail. Éviter d'attacher les doublons/versions périmées au CS.
    const latest = await prisma.pipelineDocument.findFirst({ where: { pipelineId, kind: docKind }, orderBy: { createdAt: "desc" }, select: { storagePath: true, fileName: true } });
    if (latest) pack = [{ storagePath: latest.storagePath, name: latest.fileName }];
    const std = docKind === "devis_mila" ? MILA_STANDARD_DOCS : AXA_STANDARD_DOCS;
    pack = [...pack, ...std.map((s) => ({ storagePath: s.storagePath, name: s.name }))];
  }
  // Secours : aucun doc typé → le devis uploadé (devisRecus.pdfUrl).
  if (!pack.length && recoRow?.pdfUrl) pack = [{ storagePath: recoRow.pdfUrl, name: recoRow.pdfName ?? "Devis.pdf" }];

  // Base de comparaison = dernière prime payée (mail de demande de devis Front),
  // comme sur la fiche (resolvePrimeReference tranche entre elle et le contrat).
  let primePayee: number | null = null;
  try {
    const r = await getDernierePrimePayeeFromFront(p.copro.buildingId ?? "", p.id, [p.copro.adresse, p.copro.nom]);
    primePayee = r.montant ?? null;
  } catch { /* best-effort */ }

  // Fix 4 — si Front ne trouve pas la prime payée, on retombe sur primeActuelle du
  // dossier (souvent la vraie dernière prime, plus fiable que la prime du contrat
  // extraite, parfois trop basse → comparaison faussée, ex. SDC 70 Nanterre : contrat
  // 1 147 € vs prime réelle 1 491 €). resolvePrimeReference tranche ensuite.
  if (primePayee == null && typeof p.copro.primeActuelle === "number" && p.copro.primeActuelle > 0) {
    primePayee = p.copro.primeActuelle;
  }

  // Garde-fou base de prime : si contrat et prime payée divergent trop
  // (resolvePrimeReference → flag "bloque"), la comparaison affichée dans le mail
  // serait trompeuse (ex. contrat 638 € pourri vs 3 400 € réellement payés → le mail
  // annoncerait un surcoût au lieu d'une grosse économie). Dans ce cas on renvoie
  // le flag pour bloquer l'envoi côté modale, sans jamais retomber silencieusement
  // sur le contrat. Cf. src/lib/devis-prime.ts.
  const contratPrime = typeof contratActuel.primeTTC === "number" ? contratActuel.primeTTC : null;
  const primeRes = resolvePrimeReference(contratPrime, primePayee);
  const prime = { flag: primeRes.flag, value: primeRes.value, contrat: primeRes.contrat, primePayee: primeRes.primePayee, ratio: primeRes.ratio, source: primeRes.source };

  return NextResponse.json({
    success: true,
    copro: {
      nom: p.copro.nom, adresse: p.copro.adresse, contactCsNom: p.copro.contactCsNom,
      primeActuelle: p.copro.primeActuelle, primePayee,
      gestionnaireEmail: p.copro.gestionnaireEmail, gestionnaireNom: p.copro.gestionnaireNom,
    },
    contratActuel, devis,
    recommandeAssureur: recoRow?.assureur ?? null,
    csEmails,
    pack,
    prime,
    subject: "Matera - Renégociation de votre contrat MRI",
  });
}
