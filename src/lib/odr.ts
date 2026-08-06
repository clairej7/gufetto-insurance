// Automatisation 2 — ODR (Ordre de Remplacement).
// Récupère les copros en « ODR en cours » (statut odr_en_cours) groupées par
// assureur partenaire, génère la lettre ODR (template Matera) remplie avec la
// liste des contrats, en PDF, et en CSV pour l'export. L'envoi effectif via Front
// et le passage en « ODR envoyées » sont gérés par la route /api/odr/send.

import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, PDFFont, PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { matchPartner, extractInsuranceInfoFromFront } from "@/lib/front-insurance";
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

// Flaggé = note « faux ODR » / « Wakam » (auto 1) NON encore levée. La vérif des
// dossiers peut poser une note « flag levé » qui neutralise le marqueur.
function isFlagged(events: { description: string | null }[]): boolean {
  const notes = events.map((e) => e.description || "");
  return notes.some((d) => /faux\s*odr|wakam/i.test(d)) && !notes.some((d) => /flag lev|odr confirm/i.test(d));
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
    const flagged = isFlagged(r.events);
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

// n° de contrat : parts normalisées, longueur ≥ 5. On ne découpe QUE sur de vrais
// séparateurs multi-contrats (« , » « ; » « · » ou « / » entouré d'espaces). Un
// slash COLLÉ fait partie du n° (police à base commune : "AT069324/0192" et
// "AT069324/0875" sont 2 contrats distincts → ne PAS les fusionner).
function contractParts(num: string | null): string[] {
  if (!num) return [];
  return num
    .split(/\s*[,;·]\s*|\s+\/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/gi, "").toUpperCase())
    .filter((p) => p.length >= 5);
}
function numMatch(a: string | null, b: string | null): boolean {
  const pa = contractParts(a);
  const pb = new Set(contractParts(b));
  return pa.some((p) => pb.has(p));
}

// Adresse : on ISOLE la partie voie (tout ce qui précède le code postal) pour ne
// PAS matcher sur la ville (ex. « Paris » présent partout → faux positifs). Clé =
// 1er n° de voie + mots de rue distinctifs. Match = même n° ET un mot de rue commun.
function streetPart(s: string): string {
  const d = deburr(s);
  const cp = d.match(/\b\d{5}\b/); // code postal → coupe la ville qui suit
  return (cp ? d.slice(0, cp.index) : d).replace(/[^a-z0-9]+/g, " ");
}
function addrKey(s: string): { num: string | null; words: Set<string> } {
  const st = streetPart(s);
  const num = (st.match(/\b\d{1,4}\b/) ?? [null])[0]; // 1er n° = n° de voie
  const words = new Set(
    st.split(" ").filter((w) => w.length >= 4 && !STREET_GENERIC.has(w) && !/^\d+$/.test(w)),
  );
  return { num, words };
}
function addrMatch(a: string, b: string): boolean {
  const x = addrKey(a);
  const y = addrKey(b);
  if (!x.num || !y.num || x.num !== y.num) return false; // même n° de voie exigé
  return [...x.words].some((w) => y.words.has(w)); // + au moins un mot de rue commun
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
  // Dédup entre docs et base : la base ODR provient en grande partie du traitement
  // de ces mêmes docs → sans ça, l'overlap est double-compté. On garde les docs
  // (adresses complètes) en priorité, puis les dossiers base absents des docs.
  const kept: OdrSentRecord[] = [];
  for (const r of [...ODR_SENT_DOCS[partner], ...fromDb]) {
    const dup = kept.some((k) => numMatch(r.numeroContrat, k.numeroContrat) || addrMatch(r.adresse, k.adresse));
    if (!dup) kept.push(r);
  }
  return kept;
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

  // Dossiers dont le doublon a été ignoré manuellement (bouton « Garder ») → exclus.
  const overridden = new Set(
    (
      await prisma.pipelineEvent.findMany({
        where: { pipelineId: { in: candidates.map((c) => c.pipelineId) }, type: "note_ajoutee", description: { contains: "Doublon ignoré manuellement" } },
        select: { pipelineId: true },
      })
    ).map((e) => e.pipelineId),
  );

  const duplicates: OdrDuplicate[] = [];
  for (const c of candidates) {
    if (overridden.has(c.pipelineId)) continue;
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

// ---- Contrôle de cohérence des dossiers (avant preview/envoi) ----

// Partenaire évoqué par le PRÉFIXE du n° de contrat (signal fort). null = ambigu
// (numérique → AXA/SwissLife/… non tranchable ici, donc on ne conclut pas).
function impliedPartnerFromNum(num: string | null): OdrPartnerKey | null {
  const C = (num || "").toUpperCase().replace(/\s+/g, "");
  if (/^1[HP]/.test(C)) return "SADA";
  if (/^A[RMTUN]/.test(C) || C.includes("2264AA")) return "GENERALI";
  return null;
}

export type OdrIssue = {
  pipelineId: string;
  nom: string;
  numeroContrat: string | null;
  assureur: string | null;
  issues: string[];
};

// Règles de cohérence d'UN dossier : assureur cohérent avec le partenaire et
// préfixe de n° non contradictoire.
function coherenceIssues(partner: OdrPartnerKey, assureur: string, num: string): string[] {
  const iss: string[] = [];
  const ass = (assureur || "").trim();
  if (!ass) {
    iss.push("assureur non renseigné");
  } else {
    const ap = matchPartner(ass); // "axa" | "generali" | "sada" | "mila" | null
    if (ap && ap.toUpperCase() !== partner) iss.push(`assureur « ${ass} » correspond à ${ap.toUpperCase()}, pas ${partner}`);
    else if (!ap) iss.push(`assureur « ${ass} » non reconnu comme ${partner} (courtier ?)`);
  }
  const ip = impliedPartnerFromNum(num);
  if (ip && ip !== partner) iss.push(`n° « ${num} » évoque ${ip}`);
  return iss;
}

// Repasse de vérification des dossiers d'un assureur : pour CHAQUE dossier (avec n°)
// on fait une RE-LECTURE FRONT indépendante (comme l'automatisation 1) + le contrôle
// de cohérence data (assureur ↔ partenaire, préfixe n°). Un désaccord Front ou une
// incohérence data = problème listé (bloquant). Pour les FLAGGÉS confirmés OK, on
// LÈVE le flag → ils repassent en dossiers normaux.
//
// Coûteux (1 appel Front/dossier) → traité par TRANCHE (offset/limit) : l'appelant
// boucle avec une progression. La liste des candidats (odr_en_cours + n°, triée par
// nom) est stable pendant la passe (lever un flag ne change pas l'appartenance).
export async function verifyOdrDossiers(
  partner: OdrPartnerKey,
  actorEmail: string,
  offset = 0,
  limit = 1000,
): Promise<{ total: number; count: number; unflagged: number; issues: OdrIssue[]; done: boolean }> {
  const rows = await prisma.insurancePipeline.findMany({
    where: { statut: "odr_en_cours", odrPartenaire: partner, copro: { archivedAt: null } },
    select: {
      id: true,
      copro: { select: { nom: true, numeroContrat: true, assureurActuel: true, buildingId: true } },
      events: { where: { type: "note_ajoutee" }, select: { description: true } },
    },
    orderBy: { copro: { nom: "asc" } },
  });
  const withNum = rows.filter((r) => (r.copro.numeroContrat || "").trim());
  const total = withNum.length;
  const slice = withNum.slice(offset, offset + limit);

  const issues: OdrIssue[] = [];
  let unflagged = 0;
  for (const r of slice) {
    const num = (r.copro.numeroContrat || "").trim();
    // Override : dossier confirmé manuellement (bouton « Garder ») → on ne le
    // re-signale plus, quels que soient Front et la cohérence data.
    if (r.events.some((e) => /confirm[ée]\s*manuellement/i.test(e.description || ""))) continue;
    const ass = (r.copro.assureurActuel || "").trim();
    const iss = coherenceIssues(partner, ass, num);

    // Re-lecture Front indépendante (best-effort : une panne Front = non concluant,
    // on ne bloque pas là-dessus ; seul un DÉSACCORD net Front compte).
    try {
      const info = await extractInsuranceInfoFromFront(r.copro.buildingId);
      if (info.partnerKey && info.partnerKey.toUpperCase() !== partner) {
        iss.push(`Front indique ${info.partnerKey.toUpperCase()} (≠ ${partner})`);
      }
    } catch {
      // Front indisponible pour ce dossier → non concluant, on continue.
    }

    if (iss.length) {
      issues.push({ pipelineId: r.id, nom: r.copro.nom, numeroContrat: num, assureur: ass || null, issues: iss });
      continue; // problème → on ne lève PAS le flag
    }
    // Confirmé OK : si encore flaggé, on lève le flag (data confirmée = vrai ODR).
    if (isFlagged(r.events)) {
      await prisma.pipelineEvent.create({
        data: {
          pipelineId: r.id,
          type: "note_ajoutee",
          description: "ODR confirmé (re-vérifié Front) — flag « faux ODR / Wakam » levé",
          createdBy: actorEmail,
        },
      });
      unflagged++;
    }
  }
  return { total, count: slice.length, unflagged, issues, done: offset + slice.length >= total };
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
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Date pour nom de fichier : jj_mm_aaaa.
export function frenchDateFile(d: Date): string {
  return frenchDate(d).replace(/\//g, "_");
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
    opts: { b?: boolean; size?: number; lh?: number; align?: "left" | "center" | "right" } = {},
  ) => {
    const size = opts.size ?? 11;
    const lh = opts.lh ?? 15;
    const f = opts.b ? bold : font;
    const align = opts.align ?? "left";
    for (const ln of wrap(sanitize(text), f, size)) {
      ensure(lh);
      if (ln) {
        const w = f.widthOfTextAtSize(ln, size);
        const x = align === "center" ? (W - w) / 2 : align === "right" ? W - margin - w : margin;
        page.drawText(ln, { x, y: y - size, size, font: f });
      }
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
  draw("Ordre de Remplacement", { b: true, size: 16, align: "center" });
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
  // Bloc de clôture aligné à DROITE, sur 2 lignes (comme les templates envoyés).
  draw(`Fait à Paris le Date : ${dateStr}`, { align: "right" });
  gap(6);
  draw("Lu et approuvé", { align: "right" });

  // Signature en bas à GAUCHE + tampon Matera en bas à DROITE (fidèle au template).
  // Best-effort : si les fichiers manquent, on n'ajoute rien plutôt que de casser.
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
    page.drawImage(cachet, { x: W - margin - cachetW, y: top - cachetH, width: cachetW, height: cachetH });
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
