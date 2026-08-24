// Automatisation 5 — Volet 2 « Récupération des infos devis ».
// Assistant de complétion des 8 champs exigés par les assureurs pour chiffrer.
// Source principale : le contrat MRI (lecture Anthropic). Politique de sûreté :
// on ne REMPLIT QUE les champs vides — jamais d'écrasement d'une saisie existante.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Les 8 champs (mêmes clés que le modèle Copro / le formulaire d'envoi) ──
export const DEVIS_FIELDS = [
  { key: "prime", label: "Prime", copro: "primeActuelle" },
  { key: "surface", label: "Surface", copro: "surfaceDeveloppee" },
  { key: "periode", label: "Construction", copro: "periodeConstruction" },
  { key: "nature", label: "Nature", copro: "natureOccupation" },
  { key: "activites", label: "Activités", copro: "activitesAggravantes" },
  { key: "caracteristiques", label: "Caractéristiques", copro: "caracteristiquesParticulieres" },
  { key: "proportion", label: "Inoccupé", copro: "proportionInoccupee" },
  { key: "pj", label: "Protection juri.", copro: "protectionJuridique" },
] as const;
export type DevisFieldKey = (typeof DEVIS_FIELDS)[number]["key"];

// Valeurs autorisées (= listes du formulaire de demande de devis). Source unique
// dans le module client-safe devis5-columns, ré-exportée ici pour compat.
import { PERIODES, NATURES, PROPORTIONS, ACTIVITES, CARACTERISTIQUES } from "@/lib/devis5-columns";
export { PERIODES, NATURES, PROPORTIONS, ACTIVITES, CARACTERISTIQUES };

export type CoproInfoFields = {
  primeActuelle: number | null; surfaceDeveloppee: number | null; periodeConstruction: string | null;
  natureOccupation: string | null; activitesAggravantes: string | null; caracteristiquesParticulieres: string | null;
  proportionInoccupee: string | null; protectionJuridique: string | null;
};

// Un champ « array » (activités / caractéristiques) est présent s'il parse ≥ 1 valeur.
function hasArray(v: string | null): boolean {
  if (!v) return false;
  try { const a = JSON.parse(v); return Array.isArray(a) && a.length > 0; } catch { return v.trim() !== ""; }
}

// État de complétion des 8 champs pour une copro.
export function fieldPresence(c: CoproInfoFields): Record<DevisFieldKey, boolean> {
  return {
    prime: c.primeActuelle != null,
    surface: c.surfaceDeveloppee != null,
    periode: !!c.periodeConstruction,
    nature: !!c.natureOccupation,
    activites: hasArray(c.activitesAggravantes),
    caracteristiques: hasArray(c.caracteristiquesParticulieres),
    proportion: !!c.proportionInoccupee,
    pj: c.protectionJuridique === "oui" || c.protectionJuridique === "non",
  };
}
export function countPresent(c: CoproInfoFields): number {
  return Object.values(fieldPresence(c)).filter(Boolean).length;
}

// ── Extraction Anthropic depuis le contrat MRI ────────────────────────────────
type Extracted = Partial<{ prime: number; surface: number; periode: string; nature: string; activites: string[]; caracteristiques: string[]; proportion: string; pj: "oui" | "non" }>;

async function extractFromPdf(pdf: Buffer): Promise<Extracted> {
  if (!process.env.ANTHROPIC_API_KEY) return {};
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text:
`Tu lis un contrat d'assurance multirisque immeuble (MRI). Extrais UNIQUEMENT les informations RÉELLEMENT présentes dans le document. N'invente rien : si une information n'est pas clairement indiquée, OMETS la clé (ne mets pas de valeur par défaut).

Réponds UNIQUEMENT un objet JSON sans markdown, avec seulement les clés trouvées, parmi :
- "prime": number — prime/cotisation annuelle TTC en euros (nombre seul).
- "surface": number — surface développée / superficie totale en m² (nombre seul).
- "periode": une valeur EXACTE parmi ${JSON.stringify(PERIODES)} (période/année de construction de l'immeuble).
- "nature": une valeur EXACTE parmi ${JSON.stringify(NATURES)} ("habitation" si usage d'habitation, "mixte" si habitation + commerces/bureaux, "professionnelle" si uniquement professionnel).
- "activites": tableau de valeurs EXACTES parmi ${JSON.stringify(ACTIVITES)} (activités commerciales aggravantes présentes dans l'immeuble ; ["Aucune"] si le contrat indique explicitement aucune).
- "caracteristiques": tableau de valeurs EXACTES parmi ${JSON.stringify(CARACTERISTIQUES)} (["Aucune"] si explicitement aucune).
- "proportion": une valeur EXACTE parmi ${JSON.stringify(PROPORTIONS)} (proportion de locaux inoccupés/vacants).
- "pj": "oui" ou "non" — présence d'une garantie Protection Juridique au contrat.` },
        ],
      }],
    });
    const c = resp.content.find((b) => b.type === "text");
    if (!c || c.type !== "text") return {};
    const raw = c.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(raw) as Extracted;
  } catch { return {}; }
}

// Ne garde que les valeurs valides (whitelist) → aucune donnée hors-liste écrite.
function sanitize(e: Extracted): Extracted {
  const out: Extracted = {};
  if (typeof e.prime === "number" && e.prime > 0) out.prime = Math.round(e.prime);
  if (typeof e.surface === "number" && e.surface > 0) out.surface = Math.round(e.surface);
  if (e.periode && PERIODES.includes(e.periode)) out.periode = e.periode;
  if (e.nature && NATURES.includes(e.nature)) out.nature = e.nature;
  if (e.proportion && PROPORTIONS.includes(e.proportion)) out.proportion = e.proportion;
  if (e.pj === "oui" || e.pj === "non") out.pj = e.pj;
  if (Array.isArray(e.activites)) { const a = e.activites.filter((x) => ACTIVITES.includes(x)); if (a.length) out.activites = a; }
  if (Array.isArray(e.caracteristiques)) { const a = e.caracteristiques.filter((x) => CARACTERISTIQUES.includes(x)); if (a.length) out.caracteristiques = a; }
  return out;
}

async function downloadStored(path: string): Promise<Buffer | null> {
  const { data, error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// Complète les infos d'UN dossier depuis son contrat MRI. Ne remplit que les
// champs vides du modèle Copro. Retourne les champs effectivement remplis.
export async function extractDevisInfoForPipeline(pipelineId: string, actorEmail: string): Promise<{ ok: boolean; filled: DevisFieldKey[]; reason?: string }> {
  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { coproId: true, copro: { select: { primeActuelle: true, surfaceDeveloppee: true, periodeConstruction: true, natureOccupation: true, activitesAggravantes: true, caracteristiquesParticulieres: true, proportionInoccupee: true, protectionJuridique: true } },
      documents: { where: { kind: "contrat_mri" }, orderBy: { createdAt: "desc" }, select: { storagePath: true }, take: 1 } },
  });
  if (!p) return { ok: false, filled: [], reason: "introuvable" };
  if (!p.documents.length) return { ok: false, filled: [], reason: "pas de contrat MRI" };
  const pdf = await downloadStored(p.documents[0].storagePath);
  if (!pdf) return { ok: false, filled: [], reason: "PDF illisible" };

  const e = sanitize(await extractFromPdf(pdf));
  const c = p.copro;
  const data: Record<string, unknown> = {};
  const filled: DevisFieldKey[] = [];
  // N'écrit QUE si le champ est vide côté Copro (jamais d'écrasement).
  if (e.prime != null && c.primeActuelle == null) { data.primeActuelle = e.prime; filled.push("prime"); }
  if (e.surface != null && c.surfaceDeveloppee == null) { data.surfaceDeveloppee = e.surface; filled.push("surface"); }
  if (e.periode && !c.periodeConstruction) { data.periodeConstruction = e.periode; filled.push("periode"); }
  if (e.nature && !c.natureOccupation) { data.natureOccupation = e.nature; filled.push("nature"); }
  if (e.proportion && !c.proportionInoccupee) { data.proportionInoccupee = e.proportion; filled.push("proportion"); }
  if (e.pj && !c.protectionJuridique) { data.protectionJuridique = e.pj; filled.push("pj"); }
  if (e.activites && !hasArray(c.activitesAggravantes)) { data.activitesAggravantes = JSON.stringify(e.activites); filled.push("activites"); }
  if (e.caracteristiques && !hasArray(c.caracteristiquesParticulieres)) { data.caracteristiquesParticulieres = JSON.stringify(e.caracteristiques); filled.push("caracteristiques"); }

  if (filled.length) {
    await prisma.copro.update({ where: { id: p.coproId }, data });
    await prisma.pipelineEvent.create({ data: { pipelineId, type: "action_manuelle", description: `Infos devis complétées depuis le contrat MRI : ${filled.join(", ")}`, metadata: { devis5Info: filled }, createdBy: actorEmail } });
  }
  return { ok: true, filled };
}

// ── Extraction AVEC CONFIANCE par champ (pour le tableau Excel Auto 5) ────────
// Chaque champ : { value, sure }. sure=true => l'info est EXPLICITEMENT et
// LISIBLEMENT indiquée dans le contrat (→ vert). sure=false => déduite, ambiguë
// ou peu lisible (→ orange). Champ absent du JSON => information manquante (→ rouge).
export type ConfVal<T> = { value: T; sure: boolean };
export type DevisConfident = {
  adresse?: ConfVal<string>;
  prime?: ConfVal<number>;
  surface?: ConfVal<number>;
  periode?: ConfVal<string>;
  nature?: ConfVal<string>;
  activites?: ConfVal<string[]>;
  caracteristiques?: ConfVal<string[]>;
  proportion?: ConfVal<string>;
  pj?: ConfVal<"oui" | "non">;
};

type RawConf = Record<string, { value: unknown; sure?: boolean } | null | undefined>;

async function extractConfidentFromPdf(pdf: Buffer): Promise<DevisConfident> {
  if (!process.env.ANTHROPIC_API_KEY) return {};
  let raw: RawConf = {};
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 900,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text:
`Tu lis un contrat d'assurance multirisque immeuble (MRI). Extrais les informations demandées ci-dessous.

Pour CHAQUE information trouvée, renvoie un objet { "value": <valeur>, "sure": <true|false> } :
- "sure": true UNIQUEMENT si l'information est EXPLICITEMENT et clairement indiquée, lisible sans ambiguïté dans le document.
- "sure": false si tu la déduis, si le passage est peu lisible, ambigu, ou incohérent.
- Si une information est TOTALEMENT absente du document, OMETS complètement sa clé (n'invente jamais).

Réponds UNIQUEMENT un objet JSON sans markdown. Clés possibles :
- "adresse": value = adresse complète du risque assuré (n° + voie + code postal + ville), telle qu'écrite.
- "prime": value = number, prime/cotisation annuelle TTC en euros (nombre seul).
- "surface": value = number, surface développée / superficie totale en m² (nombre seul).
- "periode": value = une valeur EXACTE parmi ${JSON.stringify(PERIODES)} (période de construction).
- "nature": value = une valeur EXACTE parmi ${JSON.stringify(NATURES)} ("habitation" si habitation, "mixte" si habitation + commerces/bureaux, "professionnelle" si uniquement pro).
- "activites": value = tableau de valeurs EXACTES parmi ${JSON.stringify(ACTIVITES)} (["Aucune"] si le contrat indique explicitement aucune).
- "caracteristiques": value = tableau de valeurs EXACTES parmi ${JSON.stringify(CARACTERISTIQUES)} (["Aucune"] si explicitement aucune).
- "proportion": value = une valeur EXACTE parmi ${JSON.stringify(PROPORTIONS)} (proportion de locaux inoccupés/vacants).
- "pj": value = "oui" ou "non" (présence d'une garantie Protection Juridique).` },
        ],
      }],
    });
    const c = resp.content.find((b) => b.type === "text");
    if (!c || c.type !== "text") return {};
    const txt = c.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    raw = JSON.parse(txt) as RawConf;
  } catch { return {}; }

  const out: DevisConfident = {};
  const pick = (k: string): { value: unknown; sure: boolean } | null => {
    const r = raw[k];
    if (r == null || typeof r !== "object" || !("value" in r)) return null;
    return { value: (r as { value: unknown }).value, sure: (r as { sure?: boolean }).sure === true };
  };
  const str = (k: keyof DevisConfident, whitelist?: string[]) => {
    const r = pick(k); if (!r || typeof r.value !== "string" || !r.value.trim()) return;
    const v = r.value.trim();
    if (whitelist && !whitelist.includes(v)) return;
    (out as Record<string, unknown>)[k] = { value: v, sure: r.sure };
  };
  const num = (k: keyof DevisConfident) => {
    const r = pick(k); if (!r || typeof r.value !== "number" || !(r.value > 0)) return;
    (out as Record<string, unknown>)[k] = { value: Math.round(r.value), sure: r.sure };
  };
  const arr = (k: keyof DevisConfident, whitelist: string[]) => {
    const r = pick(k); if (!r || !Array.isArray(r.value)) return;
    const a = (r.value as unknown[]).filter((x): x is string => typeof x === "string" && whitelist.includes(x));
    if (a.length) (out as Record<string, unknown>)[k] = { value: a, sure: r.sure };
  };
  str("adresse");
  num("prime"); num("surface");
  str("periode", PERIODES); str("nature", NATURES); str("proportion", PROPORTIONS);
  const pjR = pick("pj");
  if (pjR && (pjR.value === "oui" || pjR.value === "non")) out.pj = { value: pjR.value, sure: pjR.sure };
  arr("activites", ACTIVITES); arr("caracteristiques", CARACTERISTIQUES);
  return out;
}

// Extraction « avec confiance » depuis le contrat MRI d'UN dossier (lecture seule).
export async function extractDevisConfidentForPipeline(pipelineId: string): Promise<{ ok: boolean; data: DevisConfident; reason?: string }> {
  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: { documents: { where: { kind: "contrat_mri" }, orderBy: { createdAt: "desc" }, select: { storagePath: true }, take: 1 } },
  });
  if (!p) return { ok: false, data: {}, reason: "introuvable" };
  if (!p.documents.length) return { ok: false, data: {}, reason: "pas de contrat MRI" };
  const pdf = await downloadStored(p.documents[0].storagePath);
  if (!pdf) return { ok: false, data: {}, reason: "PDF illisible" };
  return { ok: true, data: await extractConfidentFromPdf(pdf) };
}
