import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PipelineStatut } from "@/generated/prisma/client";

type OmniCoproPayload = {
  building_id?: string;
  "Building ID"?: string;
  nom?: string;
  "Building Name"?: string;
  adresse?: string;
  gestionnaire_email?: string;
  "Email"?: string;
  assureur_actuel?: string;
  "Last Known MRI Supplier Name"?: string;
  courtier_actuel?: string;
  prime_actuelle?: number;
  date_echeance?: string;
  "Last known MRI Contract Termination Date"?: string;
  date_debut_contrat?: string;
  contact_cs_email?: string;
  contact_cs_nom?: string;
  "Insurance Sales Status"?: string;
};

function normalizeItem(item: OmniCoproPayload) {
  const buildingId = item.building_id || item["Building ID"] || "";
  const nom = item.nom || item["Building Name"] || buildingId;
  const gestionnaireEmail = item.gestionnaire_email || item["Email"] || null;
  const assureurActuel = item.assureur_actuel || item["Last Known MRI Supplier Name"] || null;
  const dateEcheanceStr = item.date_echeance || item["Last known MRI Contract Termination Date"] || null;
  const insuranceSalesStatus = item["Insurance Sales Status"] || null;
  return { buildingId, nom, gestionnaireEmail, assureurActuel, dateEcheanceStr, insuranceSalesStatus };
}

function mapStatut(salesStatus: string | null): PipelineStatut {
  switch (salesStatus) {
    case "Waiting Claims History": return "rs_en_cours";
    case "Quote Asked": return "devis_demandes";
    case "Quote Received": return "devis_recus";
    case "Quote Validated": return "envoye_cs";
    case "Contract Signed": return "contrat_signe";
    case "Contract Uploaded": return "contrat_signe";
    case "Refused":
    case "Uninsurable": return "abandonne";
    default: return "identifie";
  }
}

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
    const { buildingId, nom, gestionnaireEmail, assureurActuel, dateEcheanceStr, insuranceSalesStatus } = normalizeItem(item);

    if (!buildingId) {
      errors.push(`Entrée ignorée : Building ID manquant`);
      continue;
    }

    const dateEcheance = dateEcheanceStr ? new Date(dateEcheanceStr) : null;

    const data = {
      nom,
      adresse: item.adresse ?? null,
      gestionnaireEmail,
      assureurActuel,
      courtierActuel: item.courtier_actuel ?? null,
      primeActuelle: item.prime_actuelle ?? null,
      dateEcheance,
      dateDebutContrat: item.date_debut_contrat ? new Date(item.date_debut_contrat) : null,
      contactCsEmail: item.contact_cs_email ?? null,
      contactCsNom: item.contact_cs_nom ?? null,
      source: "omni" as const,
      syncedAt: new Date(),
    };

    const statut = mapStatut(insuranceSalesStatus);

    const existing = await prisma.copro.findUnique({
      where: { buildingId },
      include: {
        pipelines: {
          where: { statut: { notIn: ["termine", "abandonne"] } },
        },
      },
    });

    if (!existing) {
      const newCopro = await prisma.copro.create({
        data: { buildingId, ...data },
      });
      if (dateEcheance) {
        await prisma.insurancePipeline.create({
          data: {
            coproId: newCopro.id,
            statut,
            anneeEcheance: dateEcheance.getFullYear(),
          },
        });
        pipelinesCreated++;
      }
      created++;
    } else {
      await prisma.copro.update({
        where: { buildingId },
        data,
      });
      // Ne touche pas au statut du pipeline existant (géré par le gestionnaire)
      if (existing.pipelines.length === 0 && dateEcheance) {
        await prisma.insurancePipeline.create({
          data: {
            coproId: existing.id,
            statut,
            anneeEcheance: dateEcheance.getFullYear(),
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
