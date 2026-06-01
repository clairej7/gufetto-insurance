import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHmac } from "crypto";

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${expected}` === signature;
}

type DuomoEvent = {
  building_id: string;
  event: "insurance_contract_updated" | "building_updated";
  data: {
    assureur?: string;
    courtier?: string;
    prime?: number;
    date_echeance?: string;
    date_debut_contrat?: string;
    gestionnaire_email?: string;
    contact_cs_email?: string;
    contact_cs_nom?: string;
    adresse?: string;
    nom?: string;
  };
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-duomo-signature") || "";
  const secret = process.env.DUOMO_WEBHOOK_SECRET || "";

  if (secret && !verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: DuomoEvent;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.building_id) {
    return NextResponse.json({ error: "building_id requis" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    source: "duomo",
    syncedAt: new Date(),
  };

  if (payload.data.nom) updateData.nom = payload.data.nom;
  if (payload.data.adresse) updateData.adresse = payload.data.adresse;
  if (payload.data.gestionnaire_email) updateData.gestionnaireEmail = payload.data.gestionnaire_email;
  if (payload.data.assureur) updateData.assureurActuel = payload.data.assureur;
  if (payload.data.courtier) updateData.courtierActuel = payload.data.courtier;
  if (payload.data.prime !== undefined) updateData.primeActuelle = payload.data.prime;
  if (payload.data.date_echeance) updateData.dateEcheance = new Date(payload.data.date_echeance);
  if (payload.data.date_debut_contrat) updateData.dateDebutContrat = new Date(payload.data.date_debut_contrat);
  if (payload.data.contact_cs_email) updateData.contactCsEmail = payload.data.contact_cs_email;
  if (payload.data.contact_cs_nom) updateData.contactCsNom = payload.data.contact_cs_nom;

  const existing = await prisma.copro.findUnique({
    where: { buildingId: payload.building_id },
  });

  if (!existing) {
    // Only create if we have the minimum required info
    if (!payload.data.nom) {
      return NextResponse.json({ error: "Copro inconnue et nom manquant" }, { status: 404 });
    }
    await prisma.copro.create({
      data: { buildingId: payload.building_id, nom: payload.data.nom, ...updateData } as Parameters<typeof prisma.copro.create>[0]["data"],
    });
  } else {
    await prisma.copro.update({
      where: { buildingId: payload.building_id },
      data: updateData as Parameters<typeof prisma.copro.update>[0]["data"],
    });
  }

  return NextResponse.json({ success: true });
}
