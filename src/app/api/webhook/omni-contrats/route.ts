import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { syncContrats, type ContratRow } from "@/lib/contrat-sync";
import { startRun, finishRun } from "@/lib/sync-run";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseField(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return null;
}

// Découpe une cellule "a@x.fr, b@y.fr" en liste propre.
function splitList(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Webhook d'ingestion de l'export Omni "contrats" (scheduled query delivery).
// Format : POST /api/webhook/omni-contrats avec body = [...] ou {data: [...]}
// Un même Building ID peut apparaître sur plusieurs lignes (courtier + assureur) :
// la fusion est gérée par syncContrats. Comme /api/webhook/omni, endpoint ouvert
// (Omni ne peut envoyer ni header ni secret) et ne créant jamais de copro.

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown;

  let lines: unknown[] = [];
  if (Array.isArray(body)) {
    lines = body;
  } else if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    lines = (Array.isArray(obj.data) ? obj.data : null) ||
            (Array.isArray(obj.rows) ? obj.rows : null) ||
            (Array.isArray(obj.results) ? obj.results : null) ||
            [];
  }

  if (!lines.length) {
    return NextResponse.json({ buildings: 0, updated: 0, lockedManual: 0, conflictsResolved: 0, conflicts: 0, conflictIds: [], notFound: 0, notFoundIds: [], totalRows: 0 });
  }

  const rows: ContratRow[] = lines
    .map((line) => {
      if (typeof line !== "object" || !line) return null;
      const r = line as Record<string, unknown>;

      const buildingId = parseField(r, "buildingId", "Building ID", "Buildings Building ID");
      if (!buildingId) return null;

      const supplierName = parseField(r, "Name", "Supplier Name", "supplierName");
      const brokerName = parseField(r, "Broker Name", "brokerName");
      const contractName = parseField(r, "Contract Name", "contractName");
      const refNumber = parseField(r, "Ref Number", "refNumber");
      const terminationDate = parseField(r, "Last known MRI Contract Termination Date", "terminationDate");
      const yearlyValue = parseField(r, "Yearly Value", "yearlyValue");
      const parsedValue = yearlyValue !== null ? Number(String(yearlyValue).replace(",", ".")) : null;

      return {
        buildingId: String(buildingId),
        supplierName: supplierName ? String(supplierName) : null,
        brokerName: brokerName ? String(brokerName) : null,
        contractName: contractName ? String(contractName) : null,
        refNumber: refNumber ? String(refNumber) : null,
        terminationDate: terminationDate ? new Date(String(terminationDate)) : null,
        yearlyValue: parsedValue !== null && !Number.isNaN(parsedValue) ? parsedValue : null,
        emails: splitList(parseField(r, "Email Addresses", "emails")),
        phones: splitList(parseField(r, "Phone Number", "phones")),
      };
    })
    .filter(Boolean) as ContratRow[];

  // Réponse immédiate (202) + traitement en arrière-plan : voir /api/webhook/omni.
  const runId = await startRun("omni-contrats", rows.length);

  after(async () => {
    console.log(`[webhook/omni-contrats] Processing ${rows.length} rows`);
    try {
      const result = await syncContrats(rows);
      await finishRun(runId, { ok: true, result });
      console.log(`[webhook/omni-contrats] Done`, result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishRun(runId, { ok: false, error: msg });
      console.error(`[webhook/omni-contrats] Failed:`, e);
    }
  });

  return NextResponse.json({ received: rows.length, runId }, { status: 202 });
}
