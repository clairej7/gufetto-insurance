import { NextRequest, NextResponse } from "next/server";
import { syncCopros, type SyncCoproInput } from "@/lib/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseField(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return null;
}

// Webhook d'ingestion d'un export JSON Omni (scheduled query delivery).
// Format : POST /api/webhook/omni avec body = {data: [...]}

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;

  // Parsing robuste du payload :
  // - Si body est un tableau, l'utiliser directement
  // - Sinon chercher body.data, body.rows, body.results
  let buildings: unknown[] = [];
  if (Array.isArray(body)) {
    buildings = body;
  } else if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    buildings = (Array.isArray(obj.data) ? obj.data : null) ||
                (Array.isArray(obj.rows) ? obj.rows : null) ||
                (Array.isArray(obj.results) ? obj.results : null) ||
                [];
  }

  if (!buildings.length) {
    return NextResponse.json({ created: 0, updated: 0, statutsKeptCrm: 0, statutsUpdatedFromOmni: 0 });
  }

  // Parser chaque ligne
  const inputs: SyncCoproInput[] = buildings
    .map((row) => {
      if (typeof row !== "object" || !row) return null;
      const r = row as Record<string, unknown>;

      const buildingId = parseField(r, "buildingId", "Building ID", "Buildings Building ID");
      if (!buildingId) return null;

      const nom = parseField(r, "nom", "Building Name") || "Immeuble sans nom";
      const adresse = parseField(r, "adresse", "Address") || null;
      const gestionnaireEmail = parseField(r, "gestionnaireEmail", "Email") || null;
      const assureurActuel = parseField(r, "assureurActuel", "Last Known MRI Supplier Name") || null;
      const courtierActuel = parseField(r, "courtierActuel") || null;
      const dateEcheance = parseField(r, "dateEcheance", "Last known MRI Contract Termination Date");
      const dateDebutContrat = parseField(r, "dateDebutContrat") || null;
      const contactCsEmail = parseField(r, "contactCsEmail") || null;
      const contactCsNom = parseField(r, "contactCsNom") || null;
      const pmAssignee = parseField(r, "PM Assignee Name - Pro") || null;

      const statut = parseField(r, "statut", "Insurance Sales Status");

      return {
        buildingId: String(buildingId),
        nom: String(nom),
        adresse: adresse ? String(adresse) : null,
        gestionnaireEmail: gestionnaireEmail ? String(gestionnaireEmail) : null,
        assureurActuel: assureurActuel ? String(assureurActuel) : null,
        courtierActuel: courtierActuel ? String(courtierActuel) : null,
        dateEcheance: dateEcheance ? new Date(String(dateEcheance)) : null,
        dateDebutContrat: dateDebutContrat ? new Date(String(dateDebutContrat)) : null,
        contactCsEmail: contactCsEmail ? String(contactCsEmail) : null,
        contactCsNom: contactCsNom ? String(contactCsNom) : null,
        pmAssignee: pmAssignee ? String(pmAssignee) : null,
        statut: statut ? String(statut) : null,
      };
    })
    .filter(Boolean) as SyncCoproInput[];

  console.log(`[webhook/omni] Processing ${inputs.length} buildings`);

  const result = await syncCopros(inputs);

  return NextResponse.json(result);
}
