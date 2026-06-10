import { NextRequest, NextResponse } from "next/server";
import { fetchCoprosFromOmni } from "@/lib/omni";
import { syncCopros, type SyncCoproInput } from "@/lib/sync";

// Sync nocturne depuis l'API Omni. Fusionne les faits immeuble sans jamais
// écraser le workflow CRM (statut touché par un humain, tâches, événements).
// Logique commune dans src/lib/sync.ts.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const copros = await fetchCoprosFromOmni();

    const records: SyncCoproInput[] = copros.map((c) => ({
      buildingId: c.building_id,
      nom: c.nom,
      adresse: c.adresse ?? null,
      gestionnaireEmail: c.gestionnaire_email ?? null,
      assureurActuel: c.assureur_actuel ?? null,
      courtierActuel: c.courtier_actuel ?? null,
      primeActuelle: c.prime_actuelle ?? null,
      dateEcheance: c.date_echeance ? new Date(c.date_echeance) : null,
      dateDebutContrat: c.date_debut_contrat ? new Date(c.date_debut_contrat) : null,
      contactCsEmail: c.contact_cs_email ?? null,
      contactCsNom: c.contact_cs_nom ?? null,
      // L'API Omni ne remonte pas (encore) de statut de vente → on ne touche pas
      // au statut des pipelines existants. archiveAbsent reste désactivé car la
      // requête Omni est filtrée (échéance < 8 mois) : absence ≠ immeuble perdu.
    }));

    const result = await syncCopros(records, { archiveAbsent: false });

    return NextResponse.json({
      success: true,
      ...result,
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
