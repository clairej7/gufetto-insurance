import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseField(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return null;
}

// Maps Insurance Sales Status from Omni → PipelineStatut
function mapSalesStatus(status: string | null): string {
  if (!status) return "identifie";
  const s = status.toLowerCase().trim();
  if (s === "no action") return "identifie";
  if (s === "waiting claims history") return "rs_en_cours";
  if (s === "quote asked") return "devis_demandes";
  if (s === "quote received") return "devis_recus";
  if (s === "quote validated") return "envoye_cs";
  if (s === "contract signed") return "contrat_signe";
  if (s === "contract uploaded") return "resiliation_envoyee";
  if (s === "uninsurable") return "non_assurable";
  if (s === "refused") return "refuse";
  return "identifie";
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const copros = Array.isArray(body) ? body : [body];
  if (copros.length === 0) return NextResponse.json({ error: "Tableau vide" }, { status: 400 });

  let created = 0;
  let updated = 0;
  let pipelinesCreated = 0;
  const errors: string[] = [];

  for (const raw of copros) {
    try {
      // "Buildings Building ID" est le champ principal dans le JSON Omni.
      // Le champ "â« Commonholds Building ID" est le même avec un encodage corrompu —
      // on le détecte dynamiquement en cherchant la clé qui finit par "Commonholds Building ID".
      const corruptedKey = Object.keys(raw).find((k) =>
        k.replace(/[^\x20-\x7E]/g, "").trim() === "Commonholds Building ID"
      );
      const buildingId = String(
        parseField(raw, "Buildings Building ID", ...(corruptedKey ? [corruptedKey] : []), "building_id", "buildingId", "id") ?? ""
      );
      if (!buildingId) { errors.push(`Entrée sans building ID ignorée`); continue; }

      const salesStatus = parseField(raw, "Insurance Sales Status", "insurance_sales_status");

      const dateEcheanceRaw = parseField(
        raw,
        "Last known MRI Contract Termination Date",
        "Last Known MRI Contract Termination Date",
        "date_echeance",
        "dateEcheance",
        "echeance"
      );
      const dateDebutRaw = parseField(raw, "date_debut_contrat", "dateDebutContrat", "dateDebut");

      const data = {
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
        primeActuelle: parseField(raw, "prime_actuelle", "primeActuelle", "prime")
          ? Number(parseField(raw, "prime_actuelle", "primeActuelle", "prime"))
          : null,
        dateEcheance: dateEcheanceRaw ? new Date(dateEcheanceRaw) : null,
        dateDebutContrat: dateDebutRaw ? new Date(dateDebutRaw) : null,
        contactCsEmail: parseField(raw, "contact_cs_email", "contactCsEmail"),
        contactCsNom: parseField(raw, "contact_cs_nom", "contactCsNom"),
        contactCourtierEmail: parseField(raw, "contact_courtier_email", "contactCourtierEmail"),
        contactCourtierTel: parseField(raw, "contact_courtier_tel", "contactCourtierTel"),
        source: "omni" as const,
        syncedAt: new Date(),
      };

      const existing = await prisma.copro.findUnique({
        where: { buildingId },
        include: { pipelines: { where: { statut: { notIn: ["termine", "abandonne"] } } } },
      });

      if (!existing) {
        const newCopro = await prisma.copro.create({ data: { buildingId, ...data } });
        if (data.dateEcheance) {
          const statut = mapSalesStatus(salesStatus) as never;
          await prisma.insurancePipeline.create({
            data: { coproId: newCopro.id, statut, anneeEcheance: data.dateEcheance.getFullYear() },
          });
          pipelinesCreated++;
        }
        created++;
      } else {
        await prisma.copro.update({ where: { buildingId }, data });
        // Ne pas toucher au statut du pipeline existant — le CRM est la source de vérité
        if (existing.pipelines.length === 0 && data.dateEcheance) {
          const statut = mapSalesStatus(salesStatus) as never;
          await prisma.insurancePipeline.create({
            data: { coproId: existing.id, statut, anneeEcheance: data.dateEcheance.getFullYear() },
          });
          pipelinesCreated++;
        }
        updated++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({
    success: true,
    created,
    updated,
    pipelinesCreated,
    total: copros.length,
    errors: errors.length > 0 ? errors : undefined,
    syncedAt: new Date().toISOString(),
  });
}
