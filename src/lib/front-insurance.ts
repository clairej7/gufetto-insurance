// Automatisation 1 — extraction des 3 infos (mail courtier, assureur, n° de
// contrat) depuis FRONT UNIQUEMENT, à partir du building_id de la copro.
//
// Principe validé (juillet 2026) : l'API Front sait filtrer les conversations
// par champ personnalisé -> `custom_field:"building_id=<id>"` renvoie TOUS les
// fils de la copro, sans bruit. On y repère les mails d'assureur/courtier et on
// extrait : le mail (= expéditeur), l'assureur (= domaine/objet), le n° de
// contrat (= objet, puis PDF en secours via Claude).
//
// 100% Front + Claude : aucune dépendance Matera (contrainte CTO respectée).
//
// NB fiabilité : l'extraction est HEURISTIQUE et calibrée pour ne PAS produire
// de faux positifs (mieux vaut "non fiable" -> reste en "Aucune action" qu'un
// mauvais aiguillage). Les listes/regex ci-dessous sont volontairement faciles
// à ajuster avec les retours du terrain.

import Anthropic from "@anthropic-ai/sdk";

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Types (sous-ensemble utile des réponses Front)
// ---------------------------------------------------------------------------

type FrontConversation = {
  id: string;
  subject?: string | null;
  status?: string;
  custom_fields?: Record<string, unknown>;
  inboxes?: { id?: string; name?: string }[];
};

type FrontRecipient = { handle?: string; role?: string; name?: string };
type FrontAttachment = { id?: string; filename?: string; url?: string; content_type?: string; size?: number };
type FrontMessage = {
  id: string;
  is_inbound?: boolean;
  created_at?: number;
  subject?: string | null;
  text?: string | null;
  blurb?: string | null;
  author?: { handle?: string; is_inbound?: boolean } | null;
  recipients?: FrontRecipient[];
  attachments?: FrontAttachment[];
};

export type InsuranceInfo = {
  assureur: string | null;
  numeroContrat: string | null;
  mailCourtier: string | null;
  // Aiguillage
  isPartner: boolean;
  partnerKey: "axa" | "generali" | "sada" | "mila" | null;
  // Fiabilité
  reliable: boolean;
  confidence: "haute" | "moyenne" | "basse";
  reasons: string[];
  // Traçabilité
  numeroSource: "objet" | "pdf" | null;
  sampledConversations: number;
};

// ---------------------------------------------------------------------------
// Référentiels (à enrichir — cf. automatisation 3, base mails)
// ---------------------------------------------------------------------------

// Les 4 assureurs partenaires ODR + leurs variantes de nom/domaine.
const PARTNERS: { key: InsuranceInfo["partnerKey"]; patterns: RegExp }[] = [
  { key: "axa", patterns: /\baxa\b/i },
  { key: "generali", patterns: /\bgenerali\b/i },
  { key: "sada", patterns: /\bsada\b/i },
  { key: "mila", patterns: /\bmila\b/i },
];

// Indices "assureur/courtier" : domaines d'expéditeur connus + mots-clés d'objet.
// Sert (a) à repérer un fil d'assurance, (b) à déduire l'assureur.
const INSURER_HINTS: { label: string; test: RegExp }[] = [
  { label: "AXA", test: /axa\.fr|\baxa\b/i },
  { label: "Generali", test: /generali/i },
  { label: "SADA", test: /\bsada\b/i },
  { label: "Mila", test: /\bmila\b/i },
  { label: "GAN", test: /\bgan\b|gan\.fr/i },
  { label: "Groupama", test: /groupama/i },
  { label: "MMA", test: /\bmma\b/i },
  { label: "Allianz", test: /allianz/i },
  { label: "Swiss Life", test: /swiss\s?life|swisslife/i },
  { label: "Matmut", test: /matmut/i },
  { label: "Verspieren", test: /verspieren/i },
  { label: "Odealim", test: /odealim|assurgerance/i },
  { label: "Assurimo", test: /assurimo/i },
  { label: "GSA", test: /groupegsa|\bgsa\b/i },
  { label: "Cenac", test: /cenac/i },
  { label: "Bessé", test: /besse\.fr|\bbessé\b/i },
  { label: "P. Plasse", test: /pplasse/i },
  { label: "Lamy Assurances", test: /lamy-assurances/i },
  { label: "Bélier Assurances", test: /belier-assurances/i },
  { label: "Saint Pierre Assurances", test: /stpierreassurances/i },
  { label: "Verlingue", test: /verlingue/i },
  { label: "CCGA", test: /ccga-assurances/i },
  { label: "Filhet-Allard", test: /filhetallard/i },
  { label: "Entoria", test: /entoria/i },
];

// Mots-clés d'objet indiquant un fil d'assurance MRI exploitable.
const SUBJECT_INSURANCE = /assurance|multirisque|\bmri\b|police|contrat|avis d'?[ée]ch[ée]ance|appel de (?:prime|cotisation)|quittance|cotisation|sinistr/i;

// Fils à EXCLURE comme source du "contrat courant" (donnée trompeuse).
const SUBJECT_EXCLUDE = /devis|r[ée]siliation|r[ée]sili[ée]|mise en demeure/i;

// Inbox Front où atterrissent les avis/quittances/mails d'assureur. Signal FORT
// pour repérer un fil d'assurance même quand l'objet est cryptique (validé en
// live : l'avis Bessé de SDC 27 Barsacq est dans "CCR PRO - Factures").
const INSURER_INBOXES = /Assurance|Factures|Notif fournisseurs|Offre Pro/i;

function inboxLooksInsurer(conv: FrontConversation): boolean {
  return (conv.inboxes ?? []).some((i) => i.name && INSURER_INBOXES.test(i.name));
}

// Adresses non exploitables pour une relance (no-reply, services CNIL, etc.).
const JUNK_EMAIL = [
  /^(?:no-?reply|noreply|donotreply|ne-pas-repondre)@/i,
  /(?:^|[._-])(?:infocnil|cnil)@/i,
  /(?:^|[._-])(?:reclamation|reclamations)@/i,
  /(?:informations)@courriel\./i, // ex. Gan informations@courriel.gan.fr = automate
];

// ---------------------------------------------------------------------------
// Appels Front bas niveau
// ---------------------------------------------------------------------------

async function frontGet<T>(path: string): Promise<T | null> {
  if (!FRONT_TOKEN) throw new Error("FRONT_API_TOKEN manquant");
  const res = await fetch(`${FRONT_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
  });
  if (!res.ok) {
    console.error(`[front-insurance] GET ${path} -> ${res.status}: ${await res.text()}`);
    return null;
  }
  return (await res.json()) as T;
}

// Toutes les conversations d'une copro via le champ personnalisé building_id.
type FrontSearchResponse = { _results?: FrontConversation[]; _pagination?: { next?: string | null } };

async function searchByBuildingId(buildingId: string): Promise<FrontConversation[]> {
  const query = `custom_field:"building_id=${buildingId}"`;
  const out: FrontConversation[] = [];
  let path: string | null = `/conversations/search/${encodeURIComponent(query)}?limit=100`;
  let guard = 0;
  while (path && guard < 5) {
    const data: FrontSearchResponse | null = await frontGet<FrontSearchResponse>(path);
    if (!data) break;
    out.push(...(data._results ?? []));
    const nextUrl: string | null = data._pagination?.next ?? null;
    // `next` est une URL absolue -> on la re-relative pour frontGet.
    path = nextUrl ? nextUrl.replace(FRONT_API_URL, "") : null;
    guard++;
  }
  return out;
}

async function getMessages(conversationId: string): Promise<FrontMessage[]> {
  const data = await frontGet<{ _results?: FrontMessage[] }>(
    `/conversations/${conversationId}/messages?limit=50`,
  );
  return data?._results ?? [];
}

async function downloadAttachment(url: string): Promise<Buffer | null> {
  if (!FRONT_TOKEN) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${FRONT_TOKEN}` } });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Helpers d'extraction
// ---------------------------------------------------------------------------

function senderHandle(msg: FrontMessage): string | null {
  const from = msg.recipients?.find((r) => r.role === "from")?.handle;
  return (from || msg.author?.handle || null)?.toLowerCase() ?? null;
}

function isUsableEmail(email: string | null): boolean {
  if (!email) return false;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  return !JUNK_EMAIL.some((re) => re.test(email));
}

function looksLikeInsurer(text: string): string | null {
  for (const h of INSURER_HINTS) if (h.test.test(text)) return h.label;
  return null;
}

export function matchPartner(assureur: string | null): InsuranceInfo["partnerKey"] {
  if (!assureur) return null;
  for (const p of PARTNERS) if (p.patterns.test(assureur)) return p.key;
  return null;
}

// N° de contrat depuis un objet de mail. On privilégie les préfixes explicites
// (police / contrat) ; on ignore "quittance" seul (≠ n° de contrat).
function extractNumeroFromSubject(subject: string): string | null {
  const patterns = [
    /(?:police|contrat|contract)\s*(?:n[°o]?|num[ée]ro|:)?\s*([A-Za-z0-9][A-Za-z0-9\/\-]{4,})/i,
    /\bn[°o]\s*([A-Za-z0-9][A-Za-z0-9\/\-]{4,})/i,
  ];
  for (const re of patterns) {
    const m = subject.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

// Secours PDF : lit une pièce jointe (contrat/avis) via Claude pour en tirer le
// n° de contrat + l'assureur (réutilise le patron de /api/devis/extract).
async function extractFromPdf(pdf: Buffer): Promise<{ numeroContrat: string | null; assureur: string | null }> {
  // Secours PDF optionnel : sans clé Anthropic, on saute (le reste marche quand même).
  if (!process.env.ANTHROPIC_API_KEY) return { numeroContrat: null, assureur: null };
  const PROMPT = `Tu lis un document d'assurance multirisque immeuble (MRI) : avis d'échéance, contrat ou attestation.
Retourne UNIQUEMENT un JSON valide sans markdown : {"numeroContrat": string|null, "assureur": string|null}.
numeroContrat = le numéro de police/contrat exact. assureur = la compagnie d'assurance.`;
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const c = resp.content[0];
  if (c.type !== "text") return { numeroContrat: null, assureur: null };
  try {
    const raw = c.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    const j = JSON.parse(raw) as { numeroContrat?: string | null; assureur?: string | null };
    return { numeroContrat: j.numeroContrat ?? null, assureur: j.assureur ?? null };
  } catch {
    return { numeroContrat: null, assureur: null };
  }
}

// ---------------------------------------------------------------------------
// Extraction principale
// ---------------------------------------------------------------------------

export async function extractInsuranceInfoFromFront(buildingId: string): Promise<InsuranceInfo> {
  const empty: InsuranceInfo = {
    assureur: null, numeroContrat: null, mailCourtier: null,
    isPartner: false, partnerKey: null,
    reliable: false, confidence: "basse", reasons: [],
    numeroSource: null, sampledConversations: 0,
  };
  if (!buildingId) return { ...empty, reasons: ["building_id manquant"] };

  const convs = await searchByBuildingId(buildingId);
  if (convs.length === 0) return { ...empty, reasons: ["aucune conversation Front"] };

  // Sélection des fils candidats "assurance" : par OBJET (mots-clés) ET/OU par
  // INBOX (Factures/Assurance/... où arrivent les avis, même si l'objet est
  // cryptique). On écarte les devis/résiliations (source de contrat trompeuse).
  // Score : objet assurance (2) > inbox assureur (1) ; on garde les mieux notés.
  const ranked = convs
    .map((c) => ({ c, subj: c.subject || "" }))
    .filter((x) => !SUBJECT_EXCLUDE.test(x.subj))
    .map((x) => ({
      ...x,
      score: (SUBJECT_INSURANCE.test(x.subj) ? 2 : 0) + (inboxLooksInsurer(x.c) ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12); // borne : au plus 12 fils ouverts

  let assureur: string | null = null;
  let mailCourtier: string | null = null;
  let numero: string | null = null;
  let numeroSource: InsuranceInfo["numeroSource"] = null;
  let pdfFallback: FrontAttachment | null = null;

  for (const { c, subj } of ranked) {
    // N° depuis l'objet (source la plus sûre).
    if (!numero) {
      const n = extractNumeroFromSubject(subj);
      if (n) { numero = n; numeroSource = "objet"; }
    }
    // Assureur depuis l'objet.
    if (!assureur) assureur = looksLikeInsurer(subj);

    const messages = await getMessages(c.id);
    for (const m of messages) {
      if (!m.is_inbound) continue; // on veut le mail ENTRANT de l'assureur/courtier
      const from = senderHandle(m);
      const insurerByFrom = from ? looksLikeInsurer(from) : null;
      const insurerBySubj = m.subject ? looksLikeInsurer(m.subject) : null;
      const insurer = insurerByFrom || insurerBySubj;
      if (!insurer) continue;

      if (!assureur) assureur = insurer;
      if (!mailCourtier && isUsableEmail(from)) mailCourtier = from;
      if (!numero && m.subject) {
        const n = extractNumeroFromSubject(m.subject);
        if (n) { numero = n; numeroSource = "objet"; }
      }
      // Mémorise un PDF (contrat/avis) au cas où le n° manque.
      if (!pdfFallback) {
        pdfFallback = (m.attachments ?? []).find(
          (a) => a.content_type === "application/pdf" && a.url &&
            /avis|contrat|police|[ée]ch[ée]ance|conditions/i.test(a.filename || ""),
        ) ?? null;
      }
    }
    if (numero && mailCourtier && assureur) break; // on a tout
  }

  // Secours PDF pour le n° si absent des objets.
  if (!numero && pdfFallback?.url) {
    const pdf = await downloadAttachment(pdfFallback.url);
    if (pdf) {
      const ext = await extractFromPdf(pdf);
      if (ext.numeroContrat) { numero = ext.numeroContrat; numeroSource = "pdf"; }
      if (!assureur && ext.assureur) assureur = ext.assureur;
    }
  }

  // ---- Fiabilité + aiguillage -------------------------------------------------
  const partnerKey = matchPartner(assureur);
  const reasons: string[] = [];
  if (assureur) reasons.push(`assureur: ${assureur}`); else reasons.push("assureur introuvable");
  if (mailCourtier) reasons.push(`mail: ${mailCourtier}`); else reasons.push("mail introuvable");
  if (numero) reasons.push(`n°: ${numero} (${numeroSource})`); else reasons.push("n° introuvable");

  // Règle : fiable = assureur identifié ET (mail exploitable OU n° de contrat).
  const reliable = !!assureur && (!!mailCourtier || !!numero);
  const confidence: InsuranceInfo["confidence"] =
    assureur && mailCourtier && numero ? "haute" : reliable ? "moyenne" : "basse";

  return {
    assureur,
    numeroContrat: numero,
    mailCourtier,
    isPartner: !!partnerKey,
    partnerKey,
    reliable,
    confidence,
    reasons,
    numeroSource,
    sampledConversations: ranked.length,
  };
}
