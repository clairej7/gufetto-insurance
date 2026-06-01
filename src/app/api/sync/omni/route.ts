import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCoprosFromOmni } from "@/lib/omni";

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const copros = await fetchCoprosFromOmni();

    let created = 0;
    let updated = 0;
    let pipelinesCreated = 0;

    for (const copro of copros) {
      const data = {
        nom: copro.nom,
        adresse: copro.adresse ?? null,
        gestionnaireEmail: copro.gestionnaire_email ?? null,
        assureurActuel: copro.assureur_actuel ?? null,
        courtierActuel: copro.courtier_actuel ?? null,
        primeActuelle: copro.prime_actuelle ?? null,
        dateEcheance: copro.date_echeance ? new Date(copro.date_echeance) : null,
        dateDebutContrat: copro.date_debut_contrat ? new Date(copro.date_debut_contrat) : null,
        contactCsEmail: copro.contact_cs_email ?? null,
        contactCsNom: copro.contact_cs_nom ?? null,
        source: "omni" as const,
        syncedAt: new Date(),
      };

      const existing = await prisma.copro.findUnique({
        where: { buildingId: copro.building_id },
        include: { pipelines: { where: { statut: { notIn: ["termine", "abandonne"] } } } },
      });

      if (!existing) {
        const newCopro = await prisma.copro.create({
          data: { buildingId: copro.building_id, ...data },
        });

        // Auto-create pipeline at identifie
        if (data.dateEcheance) {
          const year = data.dateEcheance.getFullYear();
          await prisma.insurancePipeline.create({
            data: {
              coproId: newCopro.id,
              statut: "identifie",
              anneeEcheance: year,
            },
          });
          pipelinesCreated++;
        }
        created++;
      } else {
        await prisma.copro.update({
          where: { buildingId: copro.building_id },
          data,
        });

        // If no active pipeline, create one
        if (existing.pipelines.length === 0 && data.dateEcheance) {
          const year = data.dateEcheance.getFullYear();
          await prisma.insurancePipeline.create({
            data: {
              coproId: existing.id,
              statut: "identifie",
              anneeEcheance: year,
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
      total: copros.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[sync/omni]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
