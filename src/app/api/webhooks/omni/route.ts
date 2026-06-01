import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Format attendu depuis Omni — à adapter selon le vrai payload
type OmniCoproPayload = {
  building_id: string;
  nom?: string;
  adresse?: string;
  gestionnaire_email?: string;
  assureur_actuel?: string;
  courtier_actuel?: string;
  prime_actuelle?: number;
  date_echeance?: string; // "YYYY-MM-DD"
  date_debut_contrat?: string;
  contact_cs_email?: string;
  contact_cs_nom?: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Accepte un objet unique ou un tableau
  const items: OmniCoproPayload[] = Array.isArray(body) ? body : [body];

  if (!items.length) {
    return NextResponse.json({ error: "Payload vide" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let pipelinesCreated = 0;
  const errors: string[] = [];

  for (const item of items) {
    if (!item.building_id) {
      errors.push(`Entrée ignorée : building_id manquant`);
      continue;
    }

    const data = {
      nom: item.nom || item.building_id,
      adresse: item.adresse ?? null,
      gestionnaireEmail: item.gestionnaire_email ?? null,
      assureurActuel: item.assureur_actuel ?? null,
      courtierActuel: item.courtier_actuel ?? null,
      primeActuelle: item.prime_actuelle ?? null,
      dateEcheance: item.date_echeance ? new Date(item.date_echeance) : null,
      dateDebutContrat: item.date_debut_contrat ? new Date(item.date_debut_contrat) : null,
      contactCsEmail: item.contact_cs_email ?? null,
      contactCsNom: item.contact_cs_nom ?? null,
      source: "omni" as const,
      syncedAt: new Date(),
    };

    const existing = await prisma.copro.findUnique({
      where: { buildingId: item.building_id },
      include: {
        pipelines: {
          where: { statut: { notIn: ["termine", "abandonne"] } },
        },
      },
    });

    if (!existing) {
      const newCopro = await prisma.copro.create({
        data: { buildingId: item.building_id, ...data },
      });
      // Crée un pipeline automatiquement
      if (data.dateEcheance) {
        await prisma.insurancePipeline.create({
          data: {
            coproId: newCopro.id,
            statut: "identifie",
            anneeEcheance: data.dateEcheance.getFullYear(),
          },
        });
        pipelinesCreated++;
      }
      created++;
    } else {
      await prisma.copro.update({
        where: { buildingId: item.building_id },
        data,
      });
      // Crée un pipeline si aucun actif
      if (existing.pipelines.length === 0 && data.dateEcheance) {
        await prisma.insurancePipeline.create({
          data: {
            coproId: existing.id,
            statut: "identifie",
            anneeEcheance: data.dateEcheance.getFullYear(),
          },
        });
        pipelinesCreated++;
      }
      updated++;
    }
  }

  return NextResponse.json({
    success: true,
    created,
    updated,
    pipelinesCreated,
    errors,
    total: items.length,
  });
}
