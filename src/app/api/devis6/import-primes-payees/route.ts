import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCoproMatcher } from "@/lib/devis-match";

export const maxDuration = 120;

// Parse une valeur de cellule en montant € (nombre, ou "2 292,36 €" FR).
function toMontant(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v > 0 ? v : null;
  if (v && typeof v === "object" && "result" in v && typeof (v as { result: unknown }).result === "number") return toMontant((v as { result: number }).result);
  if (v && typeof v === "object" && "text" in v) return toMontant((v as { text: unknown }).text);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.,]/g, "").replace(/\s/g, "");
    // format FR : virgule décimale, point = séparateur milliers
    const n = parseFloat(cleaned.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "");
  if (typeof v === "object" && "richText" in v) return ((v as { richText: { text: string }[] }).richText || []).map((r) => r.text).join("");
  return String(v);
}

const ADDR_RE = /adresse|copropri|immeuble|situation|risque|lieu|sdc/i;
const PRIME_RE = /(derni.{0,6}prime|prime.{0,10}(pay|actuel|derni|dp)|prime\s*pay|cotisation.{0,10}(actuel|pay)|montant.{0,6}pay|\bdp\b)/i;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email ?? "import-primes";

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Fichier Excel requis" }, { status: 400 });

  let ws: ExcelJS.Worksheet | undefined;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    ws = wb.worksheets[0];
  } catch { return NextResponse.json({ error: "Excel illisible" }, { status: 400 }); }
  if (!ws) return NextResponse.json({ error: "Aucune feuille dans le fichier" }, { status: 400 });

  // Détection des colonnes depuis la ligne d'en-tête (1re ligne non vide).
  let headerRow = 1;
  for (let i = 1; i <= Math.min(5, ws.rowCount); i++) { if (ws.getRow(i).cellCount > 1) { headerRow = i; break; } }
  const headers: { col: number; text: string }[] = [];
  ws.getRow(headerRow).eachCell((cell, col) => headers.push({ col, text: cellText(cell.value).trim() }));
  const addrCol = headers.find((h) => ADDR_RE.test(h.text))?.col;
  const primeCol = headers.find((h) => PRIME_RE.test(h.text))?.col;

  if (!addrCol || !primeCol) {
    return NextResponse.json({
      error: "Colonnes non détectées",
      detail: `Colonne adresse ${addrCol ? "OK" : "INTROUVABLE"}, colonne « dernière prime payée » ${primeCol ? "OK" : "INTROUVABLE"}.`,
      headers: headers.map((h) => h.text),
    }, { status: 422 });
  }

  const matcher = await buildCoproMatcher();
  const report: { address: string; copro: string; statut: string | null; prime: number | null; applied: boolean; note: string }[] = [];
  let applied = 0, unmatched = 0, noPrime = 0;

  for (let i = headerRow + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const address = cellText(row.getCell(addrCol).value).trim();
    if (!address) continue;
    const prime = toMontant(row.getCell(primeCol).value);
    const line = { address, copro: "—", statut: null as string | null, prime, applied: false, note: "" };
    if (prime == null) { noPrime++; line.note = "prime illisible/vide"; report.push(line); continue; }

    const { match, reason } = matcher(address);
    if (!match || !match.pipelineId) { unmatched++; line.note = reason === "ambigu" ? "copro ambiguë" : "copro introuvable"; report.push(line); continue; }
    line.copro = match.coproNom; line.statut = match.statut;

    await prisma.pipelineEvent.create({
      data: { pipelineId: match.pipelineId, type: "action_manuelle", description: `Dernière prime payée importée (lot Excel devis) : ${prime.toLocaleString("fr-FR")} €`, metadata: { auto: "prime_payee_import", montant: prime, source: "excel" }, createdBy: actor },
    });
    line.applied = true; applied++;
    report.push(line);
  }

  return NextResponse.json({
    success: true,
    summary: { total: report.length, applied, unmatched, noPrime, addrHeader: headers.find((h) => h.col === addrCol)?.text, primeHeader: headers.find((h) => h.col === primeCol)?.text },
    report,
  });
}
