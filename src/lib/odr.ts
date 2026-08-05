// Automatisation 2 — ODR (Ordre de Remplacement).
// Récupère les copros en « ODR en cours » (statut odr_en_cours) groupées par
// assureur partenaire, génère la lettre ODR (template Matera) remplie avec la
// liste des contrats, en PDF, et en CSV pour l'export. L'envoi effectif via Front
// et le passage en « ODR envoyées » sont gérés par la route /api/odr/send.

import { PDFDocument, StandardFonts, PDFFont, PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { matchPartner } from "@/lib/front-insurance";

export const ODR_PARTNERS = [
  { key: "AXA", label: "AXA" },
  { key: "GENERALI", label: "Generali" },
  { key: "SADA", label: "SADA" },
  { key: "MILA", label: "Mila" },
] as const;

export type OdrPartnerKey = (typeof ODR_PARTNERS)[number]["key"];

export function isOdrPartnerKey(v: string): v is OdrPartnerKey {
  return ODR_PARTNERS.some((p) => p.key === v);
}
export function partnerLabel(key: OdrPartnerKey): string {
  return ODR_PARTNERS.find((p) => p.key === key)?.label ?? key;
}

export type OdrDossier = { pipelineId: string; nom: string; numeroContrat: string | null };

export type OdrPartnerBucket = {
  key: OdrPartnerKey;
  label: string;
  ready: OdrDossier[]; // avec n° de contrat → envoyables
  missingNum: OdrDossier[]; // bien en ODR mais SANS n° → à compléter avant envoi
  flagged: OdrDossier[]; // « Possible faux ODR » / « Probable Wakam » → revue manuelle
};

// Marqueur odrPartenaire (majuscule) prioritaire ; sinon on retombe sur matchPartner
// (dérivé de l'assureur, minuscule) pour ne pas perdre un dossier partenaire.
function normPartner(marker: string | null, assureur: string | null): OdrPartnerKey | null {
  const m = (marker || "").toUpperCase();
  if (isOdrPartnerKey(m)) return m;
  const fb = matchPartner(assureur);
  return fb ? (fb.toUpperCase() as OdrPartnerKey) : null;
}

// Source de vérité serveur : les ODR « pas encore envoyés » = statut odr_en_cours,
// copro active, groupés par assureur, et scindés prêts / sans-n° / flaggés.
export async function getOdrByPartner(): Promise<OdrPartnerBucket[]> {
  const rows = await prisma.insurancePipeline.findMany({
    where: { statut: "odr_en_cours", copro: { archivedAt: null } },
    select: {
      id: true,
      odrPartenaire: true,
      copro: { select: { nom: true, numeroContrat: true, assureurActuel: true } },
      events: { where: { type: "note_ajoutee" }, select: { description: true } },
    },
    orderBy: { copro: { nom: "asc" } },
  });

  const buckets = new Map<OdrPartnerKey, OdrPartnerBucket>();
  for (const p of ODR_PARTNERS) buckets.set(p.key, { key: p.key, label: p.label, ready: [], missingNum: [], flagged: [] });

  for (const r of rows) {
    const key = normPartner(r.odrPartenaire, r.copro.assureurActuel);
    if (!key) continue; // non-partenaire : ne devrait plus être en odr_en_cours
    const b = buckets.get(key)!;
    const d: OdrDossier = {
      pipelineId: r.id,
      nom: r.copro.nom,
      numeroContrat: (r.copro.numeroContrat || "").trim() || null,
    };
    const flagged = r.events.some((e) => /faux\s*odr|wakam/i.test(e.description || ""));
    if (flagged) b.flagged.push(d);
    else if (d.numeroContrat) b.ready.push(d);
    else b.missingNum.push(d);
  }

  return ODR_PARTNERS.map((p) => buckets.get(p.key)!);
}

// ---- Template ODR (texte affiché dans l'admin + corps du mail de repli) ----

export const ODR_TEMPLATE_TEXT = `Matera
8 cité Paradis, 75010 Paris

Ordre de Remplacement

Je soussigné Monsieur Raphaël Di Meglio, en qualité de représentant, vous informe de ma volonté de résilier les contrats suivants à la prochaine échéance :

Adresse : {{adresse}}
Numéro de contrat : {{numero_contrat}}

Je vous informe d'autre part que je mandate le cabinet de courtage d'assurance :
Matera
8 cité Paradis, 75010 Paris

D'établir les nouveaux contrats applicables à leurs prochaines échéances selon les instructions qu'il vous soumettra.

Fait à Paris le Date : {{date}}
Lu et approuvé`;

export function frenchDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// Lettre ODR remplie en texte (corps du mail de repli mailto + base du PDF).
export function fillOdrLetterText(dossiers: OdrDossier[], dateStr: string): string {
  const lignes = dossiers
    .map((d) => `Adresse : ${d.nom}\nNuméro de contrat : ${d.numeroContrat ?? ""}`)
    .join("\n\n");
  return `Matera
8 cité Paradis, 75010 Paris

Ordre de Remplacement

Je soussigné Monsieur Raphaël Di Meglio, en qualité de représentant, vous informe de ma volonté de résilier les contrats suivants à la prochaine échéance :

${lignes}

Je vous informe d'autre part que je mandate le cabinet de courtage d'assurance :
Matera
8 cité Paradis, 75010 Paris

D'établir les nouveaux contrats applicables à leurs prochaines échéances selon les instructions qu'il vous soumettra.

Fait à Paris le Date : ${dateStr}
Lu et approuvé`;
}

// WinAnsi (StandardFonts) ne gère pas les guillemets/apostrophes typographiques ni
// les caractères hors Latin-1 → on assainit pour éviter un throw à l'embed.
function sanitize(s: string): string {
  return (s || "")
    .normalize("NFC")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/ /g, " ")
    // retire tout ce qui reste hors Latin-1 (garde les accents FR 0xC0-0xFF)
    .replace(/[^\x09\x0A\x20-\xFF]/g, "");
}

// ---- Génération PDF de la lettre ODR (multi-page, flow texte) ----

export async function renderOdrPdf(dossiers: OdrDossier[], dateStr: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28,
    H = 841.89,
    margin = 56,
    maxW = W - margin * 2;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - margin;

  const ensure = (space: number) => {
    if (y - space < margin) {
      page = pdf.addPage([W, H]);
      y = H - margin;
    }
  };

  const wrap = (text: string, f: PDFFont, size: number): string[] => {
    const out: string[] = [];
    for (const raw of text.split("\n")) {
      const words = raw.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        out.push("");
        continue;
      }
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) {
          out.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) out.push(line);
    }
    return out;
  };

  const draw = (
    text: string,
    opts: { b?: boolean; size?: number; lh?: number } = {},
  ) => {
    const size = opts.size ?? 11;
    const lh = opts.lh ?? 15;
    const f = opts.b ? bold : font;
    for (const ln of wrap(sanitize(text), f, size)) {
      ensure(lh);
      if (ln) page.drawText(ln, { x: margin, y: y - size, size, font: f });
      y -= lh;
    }
  };
  const gap = (h = 8) => {
    ensure(h);
    y -= h;
  };

  draw("Matera", { b: true, size: 12 });
  draw("8 cité Paradis, 75010 Paris", { size: 10 });
  gap(16);
  draw("Ordre de Remplacement", { b: true, size: 16 });
  gap(14);
  draw(
    "Je soussigné Monsieur Raphaël Di Meglio, en qualité de représentant, vous informe de ma volonté de résilier les contrats suivants à la prochaine échéance :",
  );
  gap(10);
  for (const d of dossiers) {
    draw(`Adresse : ${d.nom}`);
    draw(`Numéro de contrat : ${d.numeroContrat ?? ""}`);
    gap(8);
  }
  gap(6);
  draw("Je vous informe d'autre part que je mandate le cabinet de courtage d'assurance :");
  draw("Matera");
  draw("8 cité Paradis, 75010 Paris");
  gap(10);
  draw(
    "D'établir les nouveaux contrats applicables à leurs prochaines échéances selon les instructions qu'il vous soumettra.",
  );
  gap(20);
  draw(`Fait à Paris le Date : ${dateStr}`);
  gap(6);
  draw("Lu et approuvé");

  return pdf.save();
}

// ---- CSV export (adresse + n° de contrat), séparateur ; + BOM pour Excel FR ----

export function odrCsv(dossiers: OdrDossier[]): string {
  const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const header = `${esc("Adresse")};${esc("Numéro de contrat")}`;
  const lines = dossiers.map((d) => `${esc(d.nom)};${esc(d.numeroContrat ?? "")}`);
  return "﻿" + [header, ...lines].join("\r\n");
}
