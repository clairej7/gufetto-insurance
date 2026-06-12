import { NextRequest, NextResponse } from "next/server";
import { syncInfosCopro, type InfosCoproRow } from "@/lib/infos-copro-sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseField(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return null;
}

// Nombre robuste : tolère les séparateurs de milliers (espaces, espaces
// insécables) et la virgule décimale ("2 467", "6922,72").
function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Webhook d'ingestion de l'export Omni "infos copropriétés" (scheduled query).
// Format : POST /api/webhook/omni-infos-copro avec body = [...] ou {data: [...]}
// Une ligne par building. Comme les autres webhooks Omni : endpoint ouvert,
// ne crée jamais de copro, n'écrase pas les champs non fournis, respecte le
// cliquet contratVerrouilleLe.

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
    return NextResponse.json({ buildings: 0, updated: 0, lockedManual: 0, notFound: 0, notFoundIds: [] });
  }

  const rows: InfosCoproRow[] = lines
    .map((line) => {
      if (typeof line !== "object" || !line) return null;
      const r = line as Record<string, unknown>;

      const buildingId = parseField(r, "buildingId", "Building ID", "Buildings Building ID");
      if (!buildingId) return null;

      const duomoUrl = parseField(r, "Admin Building Link", "duomoUrl");

      return {
        buildingId: String(buildingId),
        surface: parseNumber(parseField(r, "Surface In Squared Meters", "surface")),
        constructionYear: parseNumber(parseField(r, "Construction Year", "constructionYear")),
        duomoUrl: duomoUrl ? String(duomoUrl) : null,
      };
    })
    .filter(Boolean) as InfosCoproRow[];

  console.log(`[webhook/omni-infos-copro] Processing ${rows.length} rows`);

  const result = await syncInfosCopro(rows);

  return NextResponse.json(result);
}
