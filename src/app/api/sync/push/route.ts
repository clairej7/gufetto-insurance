import { NextRequest, NextResponse } from "next/server";
import { syncCopros, type SyncCoproInput } from "@/lib/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseField(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return null;
}

// Webhook d'ingestion d'un export JSON Omni (scheduled query delivery).
// VOLONTAIREMENT SANS AUTH : Omni ne peut envoyer ni header ni secret, et les IP
// d'egress ne sont pas accessibles (décision Claire, 10/06/2026). Protections de
// fond conservées dans syncCopros : cliquet (statut des dossiers touchés jamais
// écrasé), verrou terminal, aucune suppression possible.
// Parse les alias de champs (dont la clé UTF-8 corrompue), puis délègue à syncCopros.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // DIAGNOSTIC TEMPORAIRE — à retirer une fois le format Omni confirmé.
  {
    const top = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
    const firstRow = Array.isArray(body) ? body[0] : top?.data ?? top?.rows ?? top?.results ?? body;
    console.log(
      "[sync/push][diag] type:", Array.isArray(body) ? `array(${(body as unknown[]).length})` : typeof body,
      "| topKeys:", top ? JSON.stringify(Object.keys(top).slice(0, 15)) : "-",
      "| firstRowKeys:", firstRow && typeof firstRow === "object" ? JSON.stringify(Object.keys(firstRow as object).slice(0, 30)) : `(${typeof firstRow})`
    );
  }

  // Omni envoie le contenu brut du fichier JSON : tableau direct, ou objet
  // enveloppant ({ data | rows | results: [...] }). On déballe les deux cas.
  const wrapped = body as Record<string, unknown> | null;
  const rawCopros: unknown[] = Array.isArray(body)
    ? body
    : wrapped && typeof wrapped === "object" && Array.isArray(wrapped.data ?? wrapped.rows ?? wrapped.results)
      ? (wrapped.data ?? wrapped.rows ?? wrapped.results) as unknown[]
      : [body];
  if (rawCopros.length === 0) return NextResponse.json({ error: "Tableau vide" }, { status: 400 });

  const records: SyncCoproInput[] = [];
  for (const item of rawCopros) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    // "Buildings Building ID" est le champ principal dans le JSON Omni. Le champ
    // "â« Commonholds Building ID" est le même avec un encodage corrompu — on le
    // détecte dynamiquement en cherchant la clé qui finit par "Commonholds Building ID".
    const corruptedKey = Object.keys(raw).find(
      (k) => k.replace(/[^\x20-\x7E]/g, "").trim() === "Commonholds Building ID"
    );
    const buildingId = String(
      parseField(raw, "Buildings Building ID", ...(corruptedKey ? [corruptedKey] : []), "building_id", "buildingId", "id") ?? ""
    );
    if (!buildingId) continue;

    const dateEcheanceRaw = parseField(
      raw,
      "Last known MRI Contract Termination Date",
      "Last Known MRI Contract Termination Date",
      "date_echeance",
      "dateEcheance",
      "echeance"
    );
    const dateDebutRaw = parseField(raw, "date_debut_contrat", "dateDebutContrat", "dateDebut");
    const primeRaw = parseField(raw, "prime_actuelle", "primeActuelle", "prime");

    records.push({
      buildingId,
      nom: String(parseField(raw, "Building Name", "nom", "name") ?? buildingId),
      adresse: parseField(raw, "adresse", "adress", "address"),
      gestionnaireEmail: parseField(raw, "Email", "gestionnaire_email", "gestionnaireEmail", "gestionnaire"),
      assureurActuel: parseField(
        raw,
        "Last Known MRI Supplier Name",
        "Last known MRI Supplier Name",
        "assureur_actuel",
        "assureurActuel",
        "assureur"
      ),
      numeroContrat: parseField(raw, "numero_contrat", "numeroContrat"),
      courtierActuel: parseField(raw, "courtier_actuel", "courtierActuel", "courtier"),
      primeActuelle: primeRaw != null ? Number(primeRaw) : null,
      dateEcheance: dateEcheanceRaw ? new Date(dateEcheanceRaw) : null,
      dateDebutContrat: dateDebutRaw ? new Date(dateDebutRaw) : null,
      contactCsEmail: parseField(raw, "contact_cs_email", "contactCsEmail"),
      contactCsNom: parseField(raw, "contact_cs_nom", "contactCsNom"),
      contactCourtierEmail: parseField(raw, "contact_courtier_email", "contactCourtierEmail"),
      contactCourtierTel: parseField(raw, "contact_courtier_tel", "contactCourtierTel"),
      salesStatus: parseField(raw, "Insurance Sales Status", "insurance_sales_status"),
    });
  }

  console.log("[sync/push][diag] lignes reçues:", rawCopros.length, "| lignes parsées (buildingId ok):", records.length);

  const result = await syncCopros(records);
  console.log("[sync/push][diag] résultat:", JSON.stringify(result));

  return NextResponse.json({
    success: true,
    ...result,
    syncedAt: new Date().toISOString(),
  });
}
