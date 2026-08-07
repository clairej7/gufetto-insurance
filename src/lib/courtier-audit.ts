// Automatisation 3 — audit & auto-remplissage des mails courtier, UNIQUEMENT
// sur les dossiers à l'étape « Récupération du RS » (statut rs_en_cours).
//
// 3 buckets :
//   vert   = courtier valable + mail cohérent (ou RS déjà envoyée)
//   orange = courtier valable mais mail manquant ou incohérent (autre domaine)
//   rouge  = pas de courtier (vide) ou un ASSUREUR renseigné à la place
//
// Matching SOUPLE au-dessus de la base CourtierRef : variantes/fautes
// (VESPIEREN→Verspieren, ODELIM→Odealim, ALLIANZ IARD→Allianz…) rapprochées par
// tokens + tolérance d'1 faute. Les variantes d'une même entité → même mail.

import { prisma } from "@/lib/prisma";
import { normNom } from "@/lib/courtier-ref";

export const RS_STATUT = "rs_en_cours";

// Mots vides : n'entrent pas dans le rapprochement par marque.
const STOP = new Set([
  "assurance", "assurances", "assur", "cabinet", "sa", "sarl", "sas", "ei", "eirl",
  "groupe", "group", "mutuelle", "iard", "immobilier", "immo", "conseil", "conseils",
  "courtage", "courtier", "agence", "agent", "general", "generale", "generaux",
  "de", "du", "des", "et", "la", "le", "les", "france", "compagnie", "cie",
]);

// Porteurs (compagnies) hors base : renforce le garde-fou « assureur à la place
// du courtier ». On EXCLUT volontairement Allianz/GAN/MMA/SMABTP/CMAM qui sont
// gérés en base comme agents généraux = courtiers.
const CARRIER_EXTRA = new Set([
  "aviva", "areas", "zurich", "macif", "smacl", "april", "acheel", "gmf", "albingia",
  "msig", "wakam", "acte", "pacifica", "maaf", "thelem", "cfdp", "juridica", "gmfassurances",
]);

// Prénoms courants : évitent qu'un contact « Pierre-Jean … » matche « Saint Pierre ».
const FIRSTNAMES = new Set([
  "pierre", "jean", "marie", "paul", "jacques", "michel", "sophie", "vanessa", "coralie",
  "jorge", "arnaud", "franck", "stephane", "samira", "khalil", "godfroid", "choplet",
  "rebelo", "raymond", "bailly", "desbrieres", "khemiri", "frederic", "charlotte",
]);

function tokensOf(norm: string): string[] {
  return norm.split(" ").filter((t) => t && !STOP.has(t) && t.length >= 2);
}

const domainOf = (email: string) => (email.includes("@") ? email.split("@")[1].toLowerCase().trim() : "");

// Distance de Levenshtein bornée (retourne >max dès dépassement).
function lev(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let best = i;
    const cur = [i, ...new Array(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    if (best > max) return max + 1;
  }
  return prev[b.length];
}

// Deux tokens « se ressemblent » : égaux, l'un contient l'autre (≥4), ou 1 faute (≥4).
function tokenMatch(q: string, t: string): boolean {
  if (q === t) return true;
  if (q.length >= 4 && t.length >= 4 && (q.includes(t) || t.includes(q))) return true;
  if (q.length >= 4 && t.length >= 4 && lev(q, t, 1) <= 1) return true;
  return false;
}

export type CourtierRefLite = { id: string; nom: string; type: string; email: string | null; emailsAll: string | null };
type IndexEntry = { ref: CourtierRefLite; tokens: string[] };
export type CourtierIndex = { entries: IndexEntry[]; byDomain: Map<string, CourtierRefLite> };

export function buildCourtierIndex(base: CourtierRefLite[]): CourtierIndex {
  const entries: IndexEntry[] = base.map((ref) => ({ ref, tokens: tokensOf(normNom(ref.nom)) }));
  const byDomain = new Map<string, CourtierRefLite>();
  for (const ref of base) {
    for (const em of (ref.emailsAll ?? ref.email ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
      const d = domainOf(em);
      if (d) byDomain.set(d, ref);
    }
  }
  return { entries, byDomain };
}

export type Resolution =
  | { kind: "courtier"; ref: CourtierRefLite | null; label: string; confident: boolean }
  | { kind: "assureur"; ref: CourtierRefLite | null; label: string }
  | { kind: "self"; label: string }
  | { kind: "none" };

// Rapproche une valeur du champ courtier avec la base (souple).
export function resolveCourtier(raw: string | null | undefined, idx: CourtierIndex): Resolution {
  const v = (raw ?? "").trim();
  if (!v) return { kind: "none" };
  const norm = normNom(v);
  if (norm.includes("matera")) return { kind: "self", label: v }; // ex-assureur (Wakam) / syndic

  // 1) match exact sur le nom normalisé.
  const exact = idx.entries.find((e) => e.ref.nom && normNom(e.ref.nom) === norm);
  if (exact) return exact.ref.type === "assureur" ? { kind: "assureur", ref: exact.ref, label: exact.ref.nom } : { kind: "courtier", ref: exact.ref, label: exact.ref.nom, confident: true };

  // 2) match par tokens de marque. On préfère un courtier à un assureur à score égal
  //    (on lit le CHAMP courtier). Score = somme des longueurs de tokens matchés.
  const qtokens = tokensOf(norm);
  let best: IndexEntry | null = null;
  let bestScore = 0;
  let bestMatched = 0;
  let bestSolidExact = false;
  for (const e of idx.entries) {
    let score = 0;
    let matched = 0;
    let solidExact = false; // un token de marque identique (≥4) = signal fort
    for (const t of e.tokens) {
      if (FIRSTNAMES.has(t) && e.tokens.length > 1) continue;
      const exact = qtokens.includes(t);
      const fuzzy = !exact && qtokens.some((x) => tokenMatch(x, t));
      if (!exact && !fuzzy) continue;
      // un token de marque identique compte fort même s'il est court (AXA, GAN, SADA…).
      score += exact ? Math.max(t.length, 4) : t.length;
      matched++;
      if (exact && t.length >= 4) solidExact = true;
    }
    if (score > bestScore || (score === bestScore && best && e.ref.type === "courtier" && best.ref.type === "assureur")) {
      best = e; bestScore = score; bestMatched = matched; bestSolidExact = solidExact;
    }
  }
  if (best && bestScore >= 4) {
    // « confident » (pour l'écriture) : match multi-tokens, token de marque exact, ou score fort.
    const confident = bestMatched >= 2 || bestSolidExact || bestScore >= 6;
    return best.ref.type === "assureur"
      ? { kind: "assureur", ref: best.ref, label: best.ref.nom }
      : { kind: "courtier", ref: best.ref, label: best.ref.nom, confident };
  }

  // 3) porteur hors base → garde-fou assureur.
  if (qtokens.some((t) => CARRIER_EXTRA.has(t) || [...CARRIER_EXTRA].some((c) => c.length >= 4 && t.length >= 4 && lev(t, c, 1) <= 1))) {
    return { kind: "assureur", ref: null, label: v };
  }

  // 4) nom inconnu, non-porteur → courtier hors base (valable mais non remplissable).
  return { kind: "courtier", ref: null, label: v, confident: false };
}

export type Bucket = "vert" | "orange" | "rouge";
export type CourtierAuditRow = {
  pipelineId: string; nom: string; buildingId: string; adresse: string | null;
  courtier: string | null; mail: string | null; assureur: string | null;
  bucket: Bucket; reason: string;
  refNom: string | null; horsBase: boolean;
  fillable: boolean; fillEmail: string | null;
  rsSent: boolean;
};

const GENERIC_DOM = new Set(["gmail.com", "orange.fr", "wanadoo.fr", "free.fr", "hotmail.fr", "hotmail.com", "outlook.fr", "outlook.com", "yahoo.fr", "yahoo.com", "laposte.net", "sfr.fr", "live.fr"]);

// Groupes de courtiers : domaines interchangeables (même maison). Ex. Odealim
// rachète Assurcopro/Assurgérance → un mail @odealim pour Assurcopro = cohérent.
const DOMAIN_GROUPS: string[][] = [
  ["odealim.com", "odealim.fr", "assurcopro.fr", "assurcopro.com", "assurgerance.com"],
];
const GROUP_OF = new Map<string, Set<string>>();
for (const g of DOMAIN_GROUPS) { const s = new Set(g); for (const d of g) GROUP_OF.set(d, s); }
function expandDomains(doms: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const d of doms) { out.add(d); const g = GROUP_OF.get(d); if (g) for (const x of g) out.add(x); }
  return out;
}

// Le champ mail peut contenir PLUSIEURS adresses (séparées par , ou ;).
function splitEmails(field: string): string[] {
  return field.split(/[;,]/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}
const hasValidEmail = (field: string) => splitEmails(field).length > 0;

// Le mail est-il cohérent avec le courtier résolu ? Règle (remarque Quentin) :
// si AU MOINS UN des mails a le bon domaine → on garde (cohérent). Multi-mails
// où figure une adresse de compagnie À CÔTÉ du bon cabinet = OK.
function mailCoherent(field: string, res: Resolution, idx: CourtierIndex): boolean {
  const domains = splitEmails(field).map(domainOf).filter(Boolean);
  if (!domains.length) return false;
  if (res.kind === "courtier" && res.ref) {
    const doms = expandDomains((res.ref.emailsAll ?? res.ref.email ?? "").split(";").map((s) => domainOf(s.trim())).filter(Boolean));
    if (domains.some((d) => doms.has(d))) return true; // le bon cabinet (ou son groupe) est présent
    if (domains.every((d) => GENERIC_DOM.has(d))) return true; // seulement du générique → toléré
    return false; // que d'autres cabinets/compagnies → incohérent
  }
  // courtier hors base : cohérent si au moins un mail n'appartient PAS à une compagnie connue.
  return domains.some((d) => { const o = idx.byDomain.get(d); return GENERIC_DOM.has(d) || !o || o.type !== "assureur"; });
}

export function classify(
  row: { pipelineId: string; courtier: string | null; mail: string | null; assureur: string | null; rsSent: boolean; nom: string; buildingId: string; adresse: string | null },
  idx: CourtierIndex,
): CourtierAuditRow {
  const res = resolveCourtier(row.courtier, idx);
  const mail = row.mail?.trim() || null;
  const base = { pipelineId: row.pipelineId, nom: row.nom, buildingId: row.buildingId, adresse: row.adresse ?? null, courtier: row.courtier ?? null, mail, assureur: row.assureur ?? null, rsSent: row.rsSent, refNom: res.kind === "courtier" || res.kind === "assureur" ? (res.ref?.nom ?? null) : null, horsBase: res.kind === "courtier" && !res.ref };

  // Remarque 3 : RS déjà envoyée → vert d'office.
  if (row.rsSent) return { ...base, bucket: "vert", reason: "RS déjà envoyée", fillable: false, fillEmail: null };

  if (res.kind === "none") return { ...base, bucket: "rouge", reason: "aucun courtier renseigné", fillable: false, fillEmail: null };
  if (res.kind === "self") return { ...base, bucket: "rouge", reason: `« ${res.label} » (ex-assureur / syndic — pas un courtier tiers)`, fillable: false, fillEmail: null };
  if (res.kind === "assureur") return { ...base, bucket: "rouge", reason: `assureur renseigné à la place du courtier (${res.label})`, fillable: false, fillEmail: null };

  // res.kind === "courtier" (valable). On peut remplir depuis la base si : courtier
  // connu en base, avec un mail, et match sûr. Vrai pour un mail manquant ET pour
  // un mail incohérent (mail d'assureur/autre cabinet → à ÉCRASER par le mail type).
  const fillEmail = res.ref?.email ?? null;
  const canFill = !!fillEmail && res.confident;

  if (mail && hasValidEmail(mail)) {
    if (mailCoherent(mail, res, idx)) return { ...base, bucket: "vert", reason: res.ref ? `courtier + mail cohérent (${res.ref.nom})` : "courtier (hors base) + mail", fillable: false, fillEmail: null };
    return {
      ...base, bucket: "orange",
      reason: canFill ? `mail d'un autre domaine → à remplacer par le mail courtier (${res.ref!.nom})` : "mail présent mais incohérent (autre domaine/cabinet) — hors base",
      fillable: canFill, fillEmail,
    };
  }
  // courtier valable sans mail → remplissable si en base + mail dispo + match sûr.
  return {
    ...base, bucket: "orange",
    reason: canFill ? `sans mail — remplissable via base (${res.ref!.nom})` : res.ref ? `sans mail — base sans mail ou match incertain (${res.ref.nom})` : "sans mail — courtier hors base",
    fillable: canFill, fillEmail,
  };
}

async function loadRsDossiers() {
  const [pipelines, rs, base] = await Promise.all([
    prisma.insurancePipeline.findMany({
      where: { statut: RS_STATUT, copro: { archivedAt: null } },
      select: { id: true, copro: { select: { nom: true, buildingId: true, adresse: true, courtierActuel: true, contactCourtierEmail: true, assureurActuel: true } } },
    }),
    prisma.pipelineEvent.findMany({ where: { metadata: { path: ["rsType"], equals: "draft_sent" } }, select: { pipelineId: true }, distinct: ["pipelineId"] }),
    prisma.courtierRef.findMany({ select: { id: true, nom: true, type: true, email: true, emailsAll: true } }),
  ]);
  const rsSet = new Set(rs.map((r) => r.pipelineId));
  const idx = buildCourtierIndex(base);
  return { pipelines, rsSet, idx };
}

export type CourtierAudit = { counts: Record<Bucket, number>; total: number; fillable: number; rows: CourtierAuditRow[] };

function summarize(rows: CourtierAuditRow[]): CourtierAudit {
  const counts: Record<Bucket, number> = { vert: 0, orange: 0, rouge: 0 };
  let fillable = 0;
  for (const r of rows) { counts[r.bucket]++; if (r.fillable) fillable++; }
  return { counts, total: rows.length, fillable, rows };
}

// Audit global sur l'étape RS (lecture seule).
export async function getCourtierAudit(pipelineId?: string): Promise<CourtierAudit> {
  const { pipelines, rsSet, idx } = await loadRsDossiers();
  const scope = pipelineId ? pipelines.filter((p) => p.id === pipelineId) : pipelines;
  const rows = scope.map((p) => classify({ pipelineId: p.id, courtier: p.copro.courtierActuel, mail: p.copro.contactCourtierEmail, assureur: p.copro.assureurActuel, rsSent: rsSet.has(p.id), nom: p.copro.nom, buildingId: p.copro.buildingId, adresse: p.copro.adresse }, idx));
  return summarize(rows);
}

// Auto-remplit les mails courtier manquants (uniquement bucket orange remplissable).
// Ne remplace JAMAIS un mail existant. Pose le cliquet contrat + trace un event.
export async function autofillCourtierMails(actorEmail: string, pipelineId?: string): Promise<{ filled: number; before: CourtierAudit; after: CourtierAudit; details: { pipelineId: string; nom: string; email: string }[] }> {
  const before = await getCourtierAudit(pipelineId);
  const targets = before.rows.filter((r) => r.fillable && r.fillEmail);
  const details: { pipelineId: string; nom: string; email: string }[] = [];
  for (const t of targets) {
    const cur = await prisma.insurancePipeline.findUnique({ where: { id: t.pipelineId }, select: { copro: { select: { id: true, contactCourtierEmail: true } } } });
    if (!cur) continue;
    const prevMail = (cur.copro.contactCourtierEmail ?? "").trim();
    // sécurité : si le mail cible est déjà en place, ne rien faire.
    if (prevMail && prevMail.toLowerCase() === t.fillEmail!.toLowerCase()) continue;
    await prisma.copro.update({ where: { id: cur.copro.id }, data: { contactCourtierEmail: t.fillEmail!, contratVerrouilleLe: new Date() } });
    const desc = prevMail
      ? `Mail courtier remplacé (mail d'un autre domaine → mail type courtier) : « ${prevMail} » → ${t.fillEmail} (${t.refNom})`
      : `Mail courtier rempli via la base : ${t.fillEmail} (${t.refNom})`;
    await prisma.pipelineEvent.create({
      data: { pipelineId: t.pipelineId, type: "action_manuelle", description: desc, metadata: { auto: "courtier_mail_fill", email: t.fillEmail, refNom: t.refNom, previous: prevMail || null }, createdBy: actorEmail },
    });
    details.push({ pipelineId: t.pipelineId, nom: t.nom, email: t.fillEmail! });
  }
  const after = await getCourtierAudit(pipelineId);
  return { filled: details.length, before, after, details };
}
