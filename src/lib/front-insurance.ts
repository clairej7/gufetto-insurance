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
import { parseEuroAmount } from "@/lib/devis-prime";

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
  body?: string | null;
  blurb?: string | null;
  author?: { handle?: string; is_inbound?: boolean } | null;
  recipients?: FrontRecipient[];
  attachments?: FrontAttachment[];
};

export type InsuranceInfo = {
  assureur: string | null; // PORTEUR (compagnie) uniquement — jamais un courtier
  courtier: string | null; // COURTIER (intermédiaire)
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
  numeroSource: "objet" | "corps" | "pdf" | null;
  sampledConversations: number;
};

// ---------------------------------------------------------------------------
// Référentiels (à enrichir — cf. automatisation 3, base mails)
// ---------------------------------------------------------------------------

// Les 4 assureurs partenaires ODR + leurs variantes de nom/domaine.
const PARTNERS: { key: InsuranceInfo["partnerKey"]; patterns: RegExp }[] = [
  { key: "axa", patterns: /\baxa\b/i },
  { key: "generali", patterns: /g[eé]n[eé]?rali/i }, // tolère accent (Générali) + faute (GENRALI)
  { key: "sada", patterns: /\bsada\b|d[ée]fense\s+et\s+d.?assurances?/i },
  { key: "mila", patterns: /\bmila\b/i },
];

// Indices "assureur/courtier" : domaines d'expéditeur connus + mots-clés d'objet.
// Sert (a) à repérer un fil d'assurance, (b) à déduire l'assureur.
// `kind` distingue le PORTEUR (compagnie d'assurance = carrier) du COURTIER
// (intermédiaire). Crucial : on ne doit JAMAIS mettre un courtier dans le champ
// "Assureur" (bug vu en réel : Sada écrasé par Assurimo, AXA écrasé par GSA).
const INSURER_HINTS: { label: string; kind: "carrier" | "courtier"; test: RegExp }[] = [
  // Compagnies (porteurs)
  { label: "AXA", kind: "carrier", test: /axa\.fr|\baxa\b/i },
  { label: "Generali", kind: "carrier", test: /g[eé]n[eé]?rali/i }, // accent + faute "genrali"
  { label: "SADA", kind: "carrier", test: /\bsada\b|d[ée]fense\s+et\s+d.?assurances?/i },
  { label: "Mila", kind: "carrier", test: /\bmila\b/i },
  { label: "GAN", kind: "carrier", test: /\bgan\b|gan\.fr/i },
  { label: "Groupama", kind: "carrier", test: /groupama/i },
  { label: "MMA", kind: "carrier", test: /\bmma\b/i },
  { label: "Allianz", kind: "carrier", test: /allianz/i },
  { label: "Swiss Life", kind: "carrier", test: /swiss\s?life|swisslife/i },
  { label: "Matmut", kind: "carrier", test: /matmut/i },
  // Courtiers (intermédiaires)
  { label: "Verspieren", kind: "courtier", test: /verspieren/i },
  { label: "Odealim", kind: "courtier", test: /odealim|assurgerance/i },
  { label: "Assurimo", kind: "courtier", test: /assurimo/i },
  { label: "GSA", kind: "courtier", test: /groupegsa|\bgsa\b/i },
  { label: "Cenac", kind: "courtier", test: /cenac/i },
  { label: "Bessé", kind: "courtier", test: /besse\.fr|\bbessé\b/i },
  { label: "P. Plasse", kind: "courtier", test: /pplasse/i },
  { label: "Lamy Assurances", kind: "courtier", test: /lamy-assurances/i },
  { label: "Bélier Assurances", kind: "courtier", test: /belier-assurances/i },
  { label: "Saint Pierre Assurances", kind: "courtier", test: /stpierreassurances/i },
  { label: "Verlingue", kind: "courtier", test: /verlingue/i },
  { label: "CCGA", kind: "courtier", test: /ccga-assurances/i },
  { label: "Filhet-Allard", kind: "courtier", test: /filhetallard/i },
  { label: "Entoria", kind: "courtier", test: /entoria/i },
];

// Détecte qu'une valeur est en réalité un COURTIER et non un porteur. Sert à
// repérer les cas où Omni a mis un courtier dans le champ "Assureur" (pollution
// vue en réel : "PLASSE ( Courtier Axa )", "ODEALIM", "VERSPIEREN"…). On se base
// sur le mot "courtier" OU un nom de courtier connu. Aucun porteur (AXA, Generali,
// SADA, Mila, GAN, Groupama, MMA, Allianz, Swiss Life, Matmut) ne matche ces motifs.
const COURTIER_VALUE = /\bcourtier\b|verspieren|odealim|assurg[ée]rance|assurimo|\bgsa\b|cenac|bess[ée]|\bplasse\b|\blamy\b|b[ée]lier|saint.?pierre|verlingue|ccga|filhet|entoria|hc\s*conseil/i;
export function looksLikeCourtierValue(text: string | null | undefined): boolean {
  return !!text && COURTIER_VALUE.test(text);
}

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

async function frontGet<T>(pathOrUrl: string, attempts = 3): Promise<T | null> {
  if (!FRONT_TOKEN) throw new Error("FRONT_API_TOKEN manquant");
  // `pathOrUrl` peut être un chemin relatif (ex. "/conversations/...") OU une URL
  // absolue : les liens `_pagination.next` renvoyés par Front pointent vers l'hôte
  // spécifique au compte (ex. https://matera.api.frontapp.com/...) et non vers
  // FRONT_API_URL. On les suit tels quels ; le token étant scopé au compte, il
  // vaut pour les deux hôtes.
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${FRONT_API_URL}${pathOrUrl}`;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
      });
      if (res.ok) return (await res.json()) as T;
      // 429 / 5xx = transitoire -> on retente ; autres codes -> on abandonne.
      if (res.status !== 429 && res.status < 500) {
        console.error(`[front-insurance] GET ${url} -> ${res.status}: ${await res.text()}`);
        return null;
      }
    } catch (e) {
      // "fetch failed" réseau -> on retente jusqu'à épuisement.
      if (i === attempts) {
        console.error(`[front-insurance] GET ${url} fetch failed:`, e instanceof Error ? e.message : e);
        return null;
      }
    }
    await new Promise((r) => setTimeout(r, 400 * i));
  }
  return null;
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
    // `next` est une URL absolue vers l'hôte du compte -> frontGet la suit telle quelle.
    path = data._pagination?.next ?? null;
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

function looksLikeInsurer(text: string): { label: string; kind: "carrier" | "courtier" } | null {
  for (const h of INSURER_HINTS) if (h.test.test(text)) return { label: h.label, kind: h.kind };
  return null;
}

export function matchPartner(assureur: string | null): InsuranceInfo["partnerKey"] {
  if (!assureur) return null;
  for (const p of PARTNERS) if (p.patterns.test(assureur)) return p.key;
  return null;
}

// N° de contrat depuis un texte (objet OU corps de mail). On exige un préfixe
// explicite police / contrat / MRI (le motif "n°" seul captait des références
// de sinistre — bug vu en réel sur SDC 4 Albert Mercier).
function extractNumero(text: string): string | null {
  // Token ISOLÉ (lookahead) et de longueur bornée -> évite de capter un token/URL
  // long dans le corps (bug vu sur SDC 4 Albert Mercier en v2).
  const m = text.match(
    /(?:police|contrat|contract|mri)\s*(?:n[°o]?|num[ée]ro|:)?\s*([A-Za-z0-9][A-Za-z0-9\/\-]{3,17})(?![A-Za-z0-9])/i,
  );
  if (!m || !m[1]) return null;
  const cand = m[1].trim();
  const digits = (cand.match(/\d/g) ?? []).length;
  // Doit ressembler à un vrai n° : au moins 3 chiffres et ≤ 18 caractères. Évite
  // un mot ("contrat annuel" -> "annuel") et les tokens parasites du corps.
  return digits >= 3 && cand.length <= 18 ? cand : null;
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
    assureur: null, courtier: null, numeroContrat: null, mailCourtier: null,
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
  let courtier: string | null = null; // courtier (distinct du porteur)
  let insurerText = ""; // objets + corps des mails d'assureur (pour repérer le porteur → ODR)

  // Range un indice détecté dans le bon champ (porteur vs courtier), sans écraser.
  const applyHint = (h: { label: string; kind: "carrier" | "courtier" } | null) => {
    if (!h) return;
    if (h.kind === "carrier") { if (!assureur) assureur = h.label; }
    else if (!courtier) courtier = h.label;
  };

  for (const { c, subj } of ranked) {
    applyHint(looksLikeInsurer(subj)); // indice porteur/courtier depuis l'objet du fil
    // NB : le n° n'est extrait que d'un mail ENTRANT d'assureur (objet puis corps),
    // jamais de l'objet de la conversation en aveugle (évite les "proposition PC-...").

    const messages = await getMessages(c.id);
    for (const m of messages) {
      if (!m.is_inbound) continue; // on veut le mail ENTRANT de l'assureur/courtier
      const from = senderHandle(m);
      const body = m.text || m.body || m.blurb || "";
      const hay = `${m.subject ?? ""}\n${body}`;
      // Indice porteur/courtier via l'expéditeur OU le contenu (objet + corps).
      const hint = (from ? looksLikeInsurer(from) : null) || looksLikeInsurer(hay);
      if (!hint) continue;

      insurerText += ` ${hay}`;
      applyHint(hint);
      if (!mailCourtier && isUsableEmail(from)) mailCourtier = from;
      // N° : d'abord l'objet (le plus sûr), sinon le CORPS du mail (levier n°1).
      if (!numero) {
        const nSub = m.subject ? extractNumero(m.subject) : null;
        if (nSub) { numero = nSub; numeroSource = "objet"; }
        else {
          const nBody = extractNumero(body);
          if (nBody) { numero = nBody; numeroSource = "corps"; }
        }
      }
      // Mémorise un PDF (contrat/avis) au cas où le n° manque.
      if (!pdfFallback) {
        pdfFallback = (m.attachments ?? []).find(
          (a) => a.content_type === "application/pdf" && a.url &&
            /avis|contrat|police|[ée]ch[ée]ance|conditions/i.test(a.filename || ""),
        ) ?? null;
      }
    }
    if (numero && mailCourtier && (assureur || courtier)) break; // on a de quoi agir
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
  // Porteur partenaire (ODR) : depuis l'assureur détecté, SINON en scannant le
  // contenu des mails d'assureur — corrige le cas courtier qui masque le porteur
  // (ex. Bessé → contrat Generali → doit aller en ODR, pas RS).
  const partnerKey = matchPartner(assureur) || matchPartner(insurerText);
  const reasons: string[] = [];
  if (assureur) reasons.push(`assureur: ${assureur}`);
  if (courtier) reasons.push(`courtier: ${courtier}`);
  if (!assureur && !courtier) reasons.push("assureur/courtier introuvable");
  if (mailCourtier) reasons.push(`mail: ${mailCourtier}`); else reasons.push("mail introuvable");
  if (numero) reasons.push(`n°: ${numero} (${numeroSource})`); else reasons.push("n° introuvable");

  // Fiable = un interlocuteur assurance identifié (porteur OU courtier) ET
  // (mail exploitable OU n° de contrat).
  const reliable = (!!assureur || !!courtier) && (!!mailCourtier || !!numero);
  const confidence: InsuranceInfo["confidence"] =
    (assureur || courtier) && mailCourtier && numero ? "haute" : reliable ? "moyenne" : "basse";

  return {
    assureur,
    courtier,
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

// ---------------------------------------------------------------------------
// Dernière prime payée — depuis le mail de demande de devis déjà envoyé
// ---------------------------------------------------------------------------
//
// Source de vérité (choix Quentin) : le mail "Matera - demande de devis MRI"
// envoyé à l'assureur porte la ligne "- Dernières primes payées : X €". On le
// retrouve par building_id (même mécanisme que l'auto 1) puis on ancre sur le
// marqueur caché `gufetto-ref:<pipelineId>:` posé par /api/front/draft, pour être
// certain du bon dossier. Sert de base de comparaison (cf. resolvePrimeReference).

const PRIME_PAYEE_RE =
  /derni[eè]res?\s+primes?\s+pay[ée]es?\s*:?\s*([\d][\d\s.,  ]*?)\s*€/i;

function parsePrimePayeeFromText(text: string): number | null {
  const m = text.match(PRIME_PAYEE_RE);
  return m ? parseEuroAmount(m[1]) : null;
}

// Recherche Front en texte libre (ex. adresse de la copro). Secours indispensable :
// les demandes de devis créées par /api/front/draft n'ont PAS toujours le custom
// field building_id, donc searchByBuildingId peut les manquer. Boucle autonome pour
// ne pas toucher searchByBuildingId (fix pagination traité dans une tâche à part).
async function searchByText(query: string): Promise<FrontConversation[]> {
  if (!query.trim()) return [];
  const out: FrontConversation[] = [];
  let path: string | null = `/conversations/search/${encodeURIComponent(query)}?limit=100`;
  let guard = 0;
  while (path && guard < 3) {
    const data: FrontSearchResponse | null = await frontGet<FrontSearchResponse>(path);
    if (!data) break;
    out.push(...(data._results ?? []));
    // `next` = URL absolue (hôte du compte) → frontGet la suit telle quelle.
    path = data._pagination?.next ?? null;
    guard++;
  }
  return out;
}

export type PrimePayeeResult = {
  montant: number | null;
  conversationId: string | null;
  matchedByRef: boolean; // true = ancré sur gufetto-ref (dossier certain)
  reason: string;
};

// Scanne des conversations Front pour y trouver la ligne "Dernières primes payées".
// Retourne dès qu'un montant est ancré sur le gufetto-ref du dossier (certain) ;
// sinon, si allowNoRef, garde un repli "sujet demande de devis".
async function scanConvsForPrime(
  convs: FrontConversation[],
  pipelineId: string,
  allowNoRef: boolean,
): Promise<PrimePayeeResult | null> {
  const seen = new Set<string>();
  const uniq = convs.filter((c) => c.id && !seen.has(c.id) && seen.add(c.id));
  const devisConvs = uniq.filter((c) => /demande\s+de\s+devis/i.test(c.subject ?? ""));
  const pool = devisConvs.length > 0 ? devisConvs : uniq;

  let fallback: PrimePayeeResult | null = null;
  for (const c of pool) {
    const messages = await getMessages(c.id);
    for (const m of messages) {
      const html = m.body ?? ""; // marqueur gufetto-ref = span caché dans le HTML
      const plain = m.text ?? m.blurb ?? ""; // "Dernières primes payées" = texte visible
      const montant = parsePrimePayeeFromText(`${m.subject ?? ""}\n${plain || html}`);
      if (montant == null) continue;
      if (html.includes(`gufetto-ref:${pipelineId}:`)) {
        return { montant, conversationId: c.id, matchedByRef: true, reason: "gufetto-ref (dossier exact)" };
      }
      if (allowNoRef && !fallback && devisConvs.length > 0) {
        fallback = { montant, conversationId: c.id, matchedByRef: false, reason: "sujet 'demande de devis' (dossier non confirmé)" };
      }
    }
  }
  return fallback;
}

export async function getDernierePrimePayeeFromFront(
  buildingId: string,
  pipelineId: string,
  searchHints: (string | null | undefined)[] = [],
  refOnly = false,
): Promise<PrimePayeeResult> {
  const empty = (reason: string): PrimePayeeResult => ({
    montant: null,
    conversationId: null,
    matchedByRef: false,
    reason,
  });
  if (!pipelineId) return empty("pipelineId manquant");

  // 1) PRIORITAIRE : recherche par le marqueur gufetto-ref (unique par dossier,
  // toujours posé par /api/front/draft, indexé par Front). Rapide et fiable → on
  // court-circuite dès qu'on a un résultat, sans lancer les recherches lentes.
  const byRef = await scanConvsForPrime(await searchByText(`gufetto-ref:${pipelineId}`), pipelineId, false);
  if (byRef) return byRef;

  // Mode ref-only (batch) : on s'arrête là (introuvable instantané pour les dossiers
  // sans marqueur, sans payer les recherches building_id/adresse lentes).
  if (refOnly) return empty("prime introuvable (pas de gufetto-ref)");

  // 2) SECOURS (dossiers sans marqueur ref) : building_id + adresse/nom. Plus lent
  // (building_id peut paginer) → réservé aux cas où le ref n'a rien donné.
  const terms = [...new Set(searchHints.map((t) => t?.trim()).filter((t): t is string => !!t))];
  if (!buildingId && terms.length === 0) return empty("prime introuvable (ni gufetto-ref, ni building_id/nom)");
  const results = await Promise.all([
    buildingId ? searchByBuildingId(buildingId) : Promise.resolve([] as FrontConversation[]),
    ...terms.map((t) => searchByText(t)),
  ]);
  return (await scanConvsForPrime(results.flat(), pipelineId, true)) ?? empty("prime introuvable dans les demandes de devis Front");
}

// ---------------------------------------------------------------------------
// Automatisation 8 « clean prime » — récupérer la prime depuis Front
// (avis d'échéance / relance impayé) pour les dossiers SANS prime.
// ---------------------------------------------------------------------------

export type PrimeDocResult = {
  montant: number | null;
  confidence: "clear" | "unsure" | null;
  source: string;
  conversationId: string | null;
};

// Cotisation annuelle TTC lue dans un PDF (avis d'échéance / quittance / relance) via Claude.
async function extractPrimeFromPdf(pdf: Buffer): Promise<{ montant: number | null; type: string; certain: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) return { montant: null, type: "autre", certain: false };
  const PROMPT = `Tu lis un document d'assurance multirisque immeuble : avis d'échéance, échéancier, quittance, appel de cotisation, ou relance pour impayé.
Retourne UNIQUEMENT un JSON sans markdown : {"montantAnnuelTTC": number|null, "type": "avis_echeance"|"relance_impaye"|"autre", "certain": boolean}
- montantAnnuelTTC = la COTISATION / PRIME ANNUELLE TTC (montant pour UNE année entière), en euros (nombre pur, sans symbole ni séparateur de milliers).
- Si le document ne donne qu'un montant partiel (un trimestre, une fraction, un solde impayé) sans permettre de déduire l'annuel avec certitude → renvoie ce montant si c'est le mieux disponible et certain=false.
- certain=true UNIQUEMENT si tu es sûr que le montant est la prime annuelle TTC complète.`;
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
        { type: "text", text: PROMPT },
      ] }],
    });
    const c = resp.content[0];
    if (c.type !== "text") return { montant: null, type: "autre", certain: false };
    const raw = c.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    const j = JSON.parse(raw) as { montantAnnuelTTC?: number | null; type?: string; certain?: boolean };
    return { montant: typeof j.montantAnnuelTTC === "number" ? j.montantAnnuelTTC : null, type: j.type ?? "autre", certain: !!j.certain };
  } catch {
    return { montant: null, type: "autre", certain: false };
  }
}

const PRIME_DOC_SUBJECT = /avis d'?[ée]ch[ée]ance|[ée]ch[ée]ance|cotisation|quittance|appel de (?:prime|cotisation)|impay|relance|prime/i;
const PRIME_TEXT_RE = /(?:cotisation|prime|montant\s+(?:total|ttc|annuel)|[àa]\s+r[ée]gler|total\s+ttc)[^€\d]{0,40}?([\d][\d\s.,]{2,})\s*€/i;
// Garde-fou : une prime MRI d'immeuble dépasse rarement ~150 k€ → au-delà de 300 k€
// c'est presque sûrement un montant de GARANTIE (millions), pas la cotisation.
const isPlausiblePrime = (n: number) => n > 0 && n < 300000;

// Cherche la prime pour un dossier SANS prime : avis d'échéance / relance impayé
// dans Front (par building_id + nom/adresse). Priorité au PDF (Claude) ; repli corps
// de mail (moins sûr → unsure). Ne renvoie jamais de valeur invraisemblable.
export async function getPrimeFromFrontDocs(
  buildingId: string,
  hints: (string | null | undefined)[] = [],
): Promise<PrimeDocResult> {
  const none = (source: string): PrimeDocResult => ({ montant: null, confidence: null, source, conversationId: null });
  const terms = [...new Set(hints.map((t) => t?.trim()).filter((t): t is string => !!t))];
  const convLists = await Promise.all([
    buildingId ? searchByBuildingId(buildingId) : Promise.resolve([] as FrontConversation[]),
    ...terms.map((t) => searchByText(t)),
  ]);
  const seen = new Set<string>();
  const convs = convLists.flat().filter((c) => c.id && !seen.has(c.id) && seen.add(c.id));
  if (convs.length === 0) return none("aucune conversation Front");

  const ranked = convs
    .filter((c) => !/devis|r[ée]siliation/i.test(c.subject ?? ""))
    .map((c) => ({ c, score: (PRIME_DOC_SUBJECT.test(c.subject ?? "") ? 2 : 0) + (inboxLooksInsurer(c) ? 1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (ranked.length === 0) return none("aucun fil avis d'échéance / cotisation");

  let unsureHit: PrimeDocResult | null = null;
  for (const { c } of ranked) {
    const isRelance = /impay|relance|mise en demeure/i.test(c.subject ?? "");
    const messages = await getMessages(c.id);
    for (const m of messages) {
      if (!m.is_inbound) continue;
      // 1) PDF avis d'échéance / quittance → Claude (le plus fiable)
      const pdfAtt = (m.attachments ?? []).find(
        (a) => a.content_type === "application/pdf" && a.url &&
          /avis|[ée]ch[ée]ance|quittance|cotisation|prime|appel|impay|relance/i.test(a.filename || ""),
      );
      if (pdfAtt?.url) {
        const pdf = await downloadAttachment(pdfAtt.url);
        if (pdf) {
          const ex = await extractPrimeFromPdf(pdf);
          if (ex.montant && isPlausiblePrime(ex.montant)) {
            const relance = ex.type === "relance_impaye" || isRelance;
            const clear = ex.certain && ex.type === "avis_echeance" && !isRelance;
            const res: PrimeDocResult = {
              montant: Math.round(ex.montant),
              confidence: clear ? "clear" : "unsure",
              source: `${relance ? "relance impayé" : "avis d'échéance"} (PDF)`,
              conversationId: c.id,
            };
            if (clear) return res;
            unsureHit = unsureHit ?? res;
          }
        }
      }
      // 2) Corps du mail (moins sûr → unsure)
      if (!unsureHit) {
        const body = m.text || m.blurb || m.body || "";
        const mm = `${m.subject ?? ""}\n${body}`.match(PRIME_TEXT_RE);
        const montant = mm ? parseEuroAmount(mm[1]) : null;
        if (montant && isPlausiblePrime(montant)) {
          unsureHit = { montant: Math.round(montant), confidence: "unsure", source: isRelance ? "corps relance impayé" : "corps mail avis", conversationId: c.id };
        }
      }
    }
  }
  return unsureHit ?? none("prime introuvable dans les avis d'échéance / relances Front");
}
