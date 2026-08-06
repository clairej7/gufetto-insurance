// Automatisation 2 — ODR (Ordre de Remplacement).
// Récupère les copros en « ODR en cours » (statut odr_en_cours) groupées par
// assureur partenaire, génère la lettre ODR (template Matera) remplie avec la
// liste des contrats, en PDF, et en CSV pour l'export. L'envoi effectif via Front
// et le passage en « ODR envoyées » sont gérés par la route /api/odr/send.

import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, PDFFont, PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { matchPartner } from "@/lib/front-insurance";
import { ODR_SENT_DOCS, OdrSentRecord } from "@/lib/odr-sent-data";

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

// Dossiers qui iront dans la lettre : les prêts, + éventuellement les ex-flaggés
// (auto 1) qui portent un n° de contrat — ceux-ci ont été re-vérifiés via la passe
// Matera, donc réintégrables sur demande (case « inclure les flaggés »).
export function letterDossiers(bucket: OdrPartnerBucket, includeFlagged: boolean): OdrDossier[] {
  const extra = includeFlagged ? bucket.flagged.filter((d) => d.numeroContrat) : [];
  return [...bucket.ready, ...extra];
}

// ---- Contrôle anti-doublon (ODR à envoyer vs ODR déjà envoyés) ----

export type { OdrSentRecord } from "@/lib/odr-sent-data";

const STREET_GENERIC = new Set([
  "rue", "avenue", "av", "bd", "boulevard", "allee", "allees", "impasse", "place", "chemin",
  "cours", "quai", "route", "passage", "villa", "square", "sente", "sentier", "voie", "ter",
  "bis", "chaussee", "residence", "sdc", "asl", "copropriete", "immeuble", "batiment", "bat",
]);

function deburr(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// n° de contrat : parts normalisées (gère les multi-n° "A / B / C"), longueur ≥ 5.
function contractParts(num: string | null): string[] {
  if (!num) return [];
  return num
    .split(/[\/,;·]+/)
    .map((p) => p.replace(/[^a-z0-9]/gi, "").toUpperCase())
    .filter((p) => p.length >= 5);
}
function numMatch(a: string | null, b: string | null): boolean {
  const pa = contractParts(a);
  const pb = new Set(contractParts(b));
  return pa.some((p) => pb.has(p));
}

// adresse : n° de voie (1–4 chiffres, hors code postal) + mots significatifs.
function addrTokens(s: string): { nums: Set<string>; words: Set<string> } {
  const d = deburr(s).replace(/[^a-z0-9]+/g, " ");
  const nums = new Set((d.match(/\b\d{1,4}\b/g) ?? []));
  const words = new Set(
    d.split(" ").filter((w) => w.length >= 4 && !STREET_GENERIC.has(w) && !/^\d+$/.test(w)),
  );
  return { nums, words };
}
function addrMatch(a: string, b: string): boolean {
  const ta = addrTokens(a);
  const tb = addrTokens(b);
  const numHit = [...ta.nums].some((n) => tb.nums.has(n));
  const wordHit = [...ta.words].some((w) => tb.words.has(w));
  return numHit && wordHit;
}

// Ensemble « déjà envoyé » d'un assureur = docs fournis + dossiers déjà passés en
// ODR envoyé/accepté/en vigueur dans Gufetto (union, dédupliquée grossièrement).
export async function getOdrSent(partner: OdrPartnerKey): Promise<OdrSentRecord[]> {
  const dbSent = await prisma.insurancePipeline.findMany({
    where: { statut: { in: ["odr_envoye", "odr_accepte", "odr_en_vigueur"] }, odrPartenaire: partner },
    select: { copro: { select: { nom: true, numeroContrat: true } } },
  });
  const fromDb: OdrSentRecord[] = dbSent.map((d) => ({
    adresse: d.copro.nom,
    numeroContrat: (d.copro.numeroContrat || "").trim(),
  }));
  return [...ODR_SENT_DOCS[partner], ...fromDb];
}

export type OdrDuplicate = {
  pipelineId: string;
  nom: string;
  numeroContrat: string | null;
  against: string; // l'ODR déjà envoyé qui matche
  by: "numero" | "adresse";
};

// Compare les ODR à envoyer (en cours, prêts [+ flaggés si demandé]) aux déjà-envoyés.
export async function findOdrDuplicates(
  partner: OdrPartnerKey,
  includeFlagged: boolean,
): Promise<{ candidates: number; sentCount: number; duplicates: OdrDuplicate[] }> {
  const bucket = (await getOdrByPartner()).find((b) => b.key === partner)!;
  const candidates = letterDossiers(bucket, includeFlagged);
  const sent = await getOdrSent(partner);

  const duplicates: OdrDuplicate[] = [];
  for (const c of candidates) {
    for (const s of sent) {
      if (numMatch(c.numeroContrat, s.numeroContrat)) {
        duplicates.push({ pipelineId: c.pipelineId, nom: c.nom, numeroContrat: c.numeroContrat, against: s.adresse || s.numeroContrat, by: "numero" });
        break;
      }
      if (c.nom && s.adresse && addrMatch(c.nom, s.adresse)) {
        duplicates.push({ pipelineId: c.pipelineId, nom: c.nom, numeroContrat: c.numeroContrat, against: s.adresse, by: "adresse" });
        break;
      }
    }
  }
  return { candidates: candidates.length, sentCount: sent.length, duplicates };
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

  // Bloc signature + cachet Matera (fidèle au template docx). Best-effort : si les
  // fichiers manquent, on n'ajoute rien plutôt que de casser la génération.
  try {
    const sigBuf = fs.readFileSync(path.join(process.cwd(), "public/odr/odr_signature.png"));
    const cachetBuf = fs.readFileSync(path.join(process.cwd(), "public/odr/odr_cachet.png"));
    const sig = await pdf.embedPng(sigBuf);
    const cachet = await pdf.embedPng(cachetBuf);
    const sigW = 140,
      sigH = (sig.height / sig.width) * sigW;
    const cachetW = 130,
      cachetH = (cachet.height / cachet.width) * cachetW;
    const blockH = Math.max(sigH, cachetH);
    gap(12);
    ensure(blockH);
    const top = y;
    page.drawImage(sig, { x: margin, y: top - sigH, width: sigW, height: sigH });
    page.drawImage(cachet, { x: margin + sigW + 24, y: top - cachetH, width: cachetW, height: cachetH });
    y = top - blockH;
  } catch {
    // pas d'images embarquées → lettre sans cachet
  }

  return pdf.save();
}

// ---- CSV export (adresse + n° de contrat), séparateur ; + BOM pour Excel FR ----

export function odrCsv(dossiers: OdrDossier[]): string {
  const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const header = `${esc("Adresse")};${esc("Numéro de contrat")}`;
  const lines = dossiers.map((d) => `${esc(d.nom)};${esc(d.numeroContrat ?? "")}`);
  return "﻿" + [header, ...lines].join("\r\n");
}
