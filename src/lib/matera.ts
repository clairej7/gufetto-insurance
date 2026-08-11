// Client de l'API core Matera (api-core.matera.eu) pour l'auto-remplissage de
// l'étape "Relevé de sinistralité" (RS).
//
// Objectif : remplacer la récupération manuelle que faisait le gestionnaire via
// Galileo (aller chercher le dernier avis d'échéance MRI, en extraire le N° de
// contrat + le mail du courtier + la prime, puis remplir Gufetto).
//
// HIÉRARCHIE DES SOURCES (source de vérité d'abord) :
//   1. Avis d'échéance MRI récupéré via FRONT  -> le plus à jour (voir front-avis.ts, TODO)
//   2. PDF du contrat attaché côté Matera       -> fallback (extraction Claude)
//   3. Champs structurés du contrat Matera       -> complément (PARFOIS PÉRIMÉS)
//
// Validé en conditions réelles le 2026-07-30 sur 6 copropriétés / 6 assureurs
// (Generali, Bessé, Generali France, Cenac, Groupama, GAN) :
//   - N° de contrat : 6/6 récupérables (5/6 directement via le champ `number`,
//     1/6 uniquement dans le PDF) ;
//   - Prime : 6/6 ;
//   - Mail courtier/assureur : 4/6 en données structurées (union supplier+broker).
//
// Auth : cet endpoint attend un JWT Materani (Bearer). Le serveur Gufetto doit
// disposer de son propre token de service Matera -> MATERA_API_TOKEN.
// (Dépendance externe à obtenir auprès de Matera : accès micro-service à
// api-core.matera.eu ; cf. l'en-tête X-Micro-Service côté API.)

const MATERA_API_URL = process.env.MATERA_API_URL || "https://api-core.matera.eu/api/v1";
const MATERA_API_TOKEN = process.env.MATERA_API_TOKEN;

// ---------------------------------------------------------------------------
// Types (sous-ensemble utile des réponses de l'API contrats/fournisseurs)
// ---------------------------------------------------------------------------

export type MateraSupplier = {
  id: number;
  name: string | null;
  emails: string[];
  phone_number: string | null;
  full_address: string | null;
  valid_emails: boolean;
};

export type MateraContract = {
  id: number;
  kind: string | null; // "multi_risk_insurance" pour la MRI
  name: string | null; // parfois l'assureur, parfois le COURTIER (ex. "BESSÉ")
  number: string | null; // N° de contrat (souvent déjà extrait par l'IA Matera)
  yearly_value: string | null; // prime annuelle (string décimale)
  start_date: string | null;
  end_date: string | null; // ATTENTION : souvent une date fantaisiste (1926, 2005...)
  sign_date: string | null;
  closed: boolean;
  broker_id: number | null;
  supplier_id: number | null;
  broker?: MateraSupplier | null;
  supplier?: MateraSupplier | null;
  documents?: MateraDocument[];
};

export type MateraDocument = {
  id: number;
  name: string | null;
  kind: string | null;
  file?: { url: string; content_type: string; size: number } | null;
};

// Résultat normalisé, prêt à être fusionné dans le modèle `Copro` de Gufetto.
export type ContratActuelExtrait = {
  assureurActuel: string | null;
  courtierActuel: string | null;
  numeroContrat: string | null;
  primeActuelle: number | null;
  contactCourtierEmail: string | null;
  contactCourtierTel: string | null;
  // Traçabilité : d'où vient chaque info + le contrat Matera retenu.
  _mataraContractId: number | null;
  _numeroSource: "matera_field" | "pdf" | "front_avis" | null;
  _mailManquant: boolean; // true => à compléter à la main / autre source
};

// ---------------------------------------------------------------------------
// Appel HTTP bas niveau
// ---------------------------------------------------------------------------

async function mataraGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  if (!MATERA_API_TOKEN) {
    throw new Error("MATERA_API_TOKEN manquant : accès à l'API core Matera non configuré.");
  }
  const url = new URL(`${MATERA_API_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${MATERA_API_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Matera API ${res.status} sur ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// 1. Résolution d'un building_id (SECOURS UNIQUEMENT)
//
// En production on part TOUJOURS de Copro.buildingId (= building_id Matera,
// même espace d'ID, vérifié). La recherche par nom n'est qu'un secours car elle
// est ambiguë (ex. "2 rue des Rosiers" -> 2 correspondances parfaites).
// ---------------------------------------------------------------------------

type BuildingSearchResponse = {
  body: {
    result: { building_id: string; is_perfect_match: boolean } | null;
    best_candidates: { building_id: string; formatted_text: string; is_perfect_match: boolean }[];
  };
};

export async function searchBuildingId(query: string): Promise<string | null> {
  const data = await mataraGet<BuildingSearchResponse>("/ai/search/building", { query });
  const body = data.body ?? (data as unknown as BuildingSearchResponse["body"]);
  if (body.result?.is_perfect_match) return body.result.building_id;
  const perfect = body.best_candidates?.filter((c) => c.is_perfect_match) ?? [];
  // Ambigu (0 ou >1 match parfait) : on ne devine pas.
  return perfect.length === 1 ? perfect[0].building_id : null;
}

// ---------------------------------------------------------------------------
// 2. Contrats MRI de l'immeuble + sélection du contrat COURANT
// ---------------------------------------------------------------------------

// Réponses de l'API : parfois enveloppées dans `{ body: { results } }` (proxy MCP),
// parfois directement `{ results }`. On gère les deux.
function unwrapResults<T>(data: unknown): T[] {
  const d = data as { body?: { results?: T[] }; results?: T[] };
  return d.body?.results ?? d.results ?? [];
}

// Membres du conseil syndical (role="council") avec leur email perso, depuis
// GET /owners. Sert au mail de proposition en masse (Auto 6 volet 2).
export type CouncilMember = { name: string; email: string };
type MateraOwner = { email: string | null; full_name: string | null; entity_leader_name: string | null; role: string | null; visible_role: string | null };
export async function getCouncilMembers(buildingId: string | number): Promise<CouncilMember[]> {
  const data = await mataraGet<unknown>("/owners", { building_id: buildingId, limit: 200 });
  const owners = unwrapResults<MateraOwner>(data);
  const seen = new Set<string>();
  const out: CouncilMember[] = [];
  for (const o of owners) {
    if ((o.role !== "council" && o.visible_role !== "council") || !o.email) continue;
    const email = o.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: (o.full_name || o.entity_leader_name || "").trim(), email: o.email.trim() });
  }
  return out;
}

export async function listMriContracts(buildingId: string | number): Promise<MateraContract[]> {
  const data = await mataraGet<unknown>("/contracts", {
    building_id: buildingId,
    "filters[kind]": "multi_risk_insurance",
  });
  return unwrapResults<MateraContract>(data);
}

// Un immeuble a SOUVENT plusieurs contrats MRI (historique + courant).
// Règle validée : priorité au contrat ouvert (closed=false) ; le drapeau
// `closed` prime sur la date (cas 143 Jonquilles : GAN ouvert 2009 l'emporte
// sur Allianz clos 2022, ce qui correspond bien à la donnée Gufetto). À défaut
// d'ouvert, le plus récent. Départage par date : start_date puis sign_date.
export function selectCurrentMriContract(contracts: MateraContract[]): MateraContract | null {
  const mri = contracts.filter((c) => c.kind === "multi_risk_insurance");
  if (mri.length === 0) return null;

  const recency = (c: MateraContract) =>
    new Date(c.start_date ?? c.sign_date ?? 0).getTime();

  const open = mri.filter((c) => !c.closed);
  const pool = open.length > 0 ? open : mri;
  return pool.slice().sort((a, b) => recency(b) - recency(a))[0];
}

export async function getContractWithDocs(
  buildingId: string | number,
  contractId: number,
): Promise<MateraContract> {
  const data = await mataraGet<{ body?: { result: MateraContract }; result?: MateraContract }>(
    `/contracts/${contractId}`,
    {
      building_id: buildingId,
      "includes[documents][file]": "true",
      "includes[supplier]": "true",
      "includes[broker]": "true",
    },
  );
  const result = (data.body?.result ?? data.result) as MateraContract;
  return result;
}

// ---------------------------------------------------------------------------
// 3. Mapping contrat Matera -> champs Copro
// ---------------------------------------------------------------------------

// Filtre les adresses inutilisables pour une demande RS. La mesure sur 30
// dossiers a montré que le champ email mélange le bon contact MRI avec du bruit :
// services CNIL/réclamations, placeholders ("nesaitpas@axa.fr"), no-reply, etc.
const JUNK_EMAIL_PATTERNS = [
  /(^|[._-])(infocnil|cnil)@/i,
  /(^|[._-])(reclamation|reclamations|reclam)@/i,
  /(nesaitpas|ne-sait-pas|inconnu|unknown|placeholder|test|exemple|example)@/i,
  /^(no-?reply|noreply|donotreply|ne-pas-repondre)@/i,
];
export function isUsableInsuranceEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  return !JUNK_EMAIL_PATTERNS.some((re) => re.test(e));
}

// Union des emails courtier + fournisseur, dédupliquée, nettoyée. Le mail
// "courtier" peut se trouver sur l'un OU l'autre (ex. Bessé -> broker,
// AssurCopro -> supplier).
function usableEmails(...suppliers: (MateraSupplier | null | undefined)[]): string[] {
  const emails = suppliers
    .filter((s): s is MateraSupplier => !!s)
    .flatMap((s) => s.emails ?? [])
    .map((e) => e.trim())
    .filter(Boolean);
  return [...new Set(emails)].filter(isUsableInsuranceEmail);
}

export function mapContractToCopro(contract: MateraContract): ContratActuelExtrait {
  const prime = contract.yearly_value != null ? Number(contract.yearly_value) : null;
  const email = usableEmails(contract.broker, contract.supplier)[0] ?? null;

  return {
    // L'assureur est le fournisseur ; `contract.name` peut être le courtier.
    assureurActuel: contract.supplier?.name ?? contract.name ?? null,
    courtierActuel: contract.broker?.name ?? null,
    numeroContrat: contract.number ?? null,
    primeActuelle: prime != null && !Number.isNaN(prime) ? prime : null,
    contactCourtierEmail: email,
    contactCourtierTel: contract.broker?.phone_number ?? contract.supplier?.phone_number ?? null,
    _mataraContractId: contract.id,
    _numeroSource: contract.number ? "matera_field" : null,
    _mailManquant: !email,
    // NB : on n'expose PAS end_date comme dateEcheance (souvent périmée) — on
    // laisse l'échéance déjà synchronisée par Omni côté Copro.
  };
}

// ---------------------------------------------------------------------------
// 4. Téléchargement du PDF du contrat (fallback) + extraction Claude
// ---------------------------------------------------------------------------

// Les URLs de blob Active Storage sont signées : téléchargeables sans le JWT.
export async function downloadPdf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement PDF ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Choisit la meilleure pièce jointe PDF du contrat (le contrat MRI lui-même,
// ou à défaut la première PJ PDF).
export function pickContractPdf(contract: MateraContract): MateraDocument | null {
  const pdfs = (contract.documents ?? []).filter(
    (d) => d.file?.content_type === "application/pdf" && d.file?.url,
  );
  if (pdfs.length === 0) return null;
  return pdfs.find((d) => d.kind === "contract") ?? pdfs[0];
}

// Extraction depuis un PDF (avis d'échéance ou contrat) via Claude, en réutilisant
// le patron déjà en place dans /api/devis/extract (document base64 -> JSON strict).
// Renvoie les champs manquants (typiquement le N° de contrat) trouvés dans le PDF.
export async function extractFromPdf(pdf: Buffer): Promise<{
  numeroContrat: string | null;
  assureur: string | null;
  primeTTC: number | null;
  contactCourtierEmail: string | null;
  // Bonus "Infos copropriété" que le PDF contient souvent :
  surfaceDeveloppee: number | null;
  anneeConstruction: string | null;
  natureOccupation: string | null;
}> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const PROMPT = `Tu lis un document d'assurance multirisque immeuble (MRI) : avis d'échéance ou contrat.
Retourne UNIQUEMENT un objet JSON valide, sans markdown ni backticks, avec exactement ces clés
(mets null si l'information n'est pas présente) :
{
  "numeroContrat": "numéro de police / contrat exact (string ou null)",
  "assureur": "nom de la compagnie d'assurance (string ou null)",
  "primeTTC": "prime/cotisation annuelle TTC en euros (number ou null)",
  "contactCourtierEmail": "email du courtier ou de l'assureur si présent (string ou null)",
  "surfaceDeveloppee": "surface développée en m² (number ou null)",
  "anneeConstruction": "année ou période de construction (string ou null)",
  "natureOccupation": "usage: habitation / mixte / professionnelle (string ou null)"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
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
  const content = response.content[0];
  if (content.type !== "text") throw new Error("Réponse Claude invalide");
  const raw = content.text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// 5. Orchestrateur : tout ce qu'il faut pour l'étape RS d'une copro
// ---------------------------------------------------------------------------

// FUSION à travers TOUTES les lignes MRI de l'immeuble.
//
// Découverte de la mesure sur 30 dossiers : 64 % des immeubles ont plusieurs
// contrats MRI, et les infos sont ÉCLATÉES entre eux — la seule ligne ouverte
// (closed=false) est souvent une suggestion vide (nom du courtier seul), tandis
// que le N° de contrat / le mail / les détails enrichis par l'IA sont sur une
// ligne close. Aucune ligne unique ne porte les 3 champs. On fusionne donc :
// existence "courant" = y a-t-il une ligne ouverte ; mais chaque CHAMP est pris
// sur la première ligne (triée par pertinence) qui le renseigne.
//
// Ordre de pertinence : ligne ouverte d'abord, puis la plus récemment enrichie
// (ai_updated_at), puis la plus remplie. `fulls` = contrats déjà chargés via
// getContractWithDocs (supplier+broker+documents).
export function mergeMriContracts(fulls: MateraContract[]): ContratActuelExtrait {
  const scored = fulls
    .slice()
    .sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1; // ouvert d'abord
      const fill = (c: MateraContract) =>
        (c.number ? 1 : 0) + (c.yearly_value ? 1 : 0) + (c.broker?.name ? 1 : 0);
      return fill(b) - fill(a);
    });

  const firstWith = <T>(pick: (c: MateraContract) => T | null | undefined): T | null => {
    for (const c of scored) {
      const v = pick(c);
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };

  const numero = firstWith((c) => c.number);
  const primeStr = firstWith((c) => c.yearly_value);
  const prime = primeStr != null ? Number(primeStr) : null;
  const email = usableEmails(...scored.flatMap((c) => [c.broker, c.supplier]))[0] ?? null;

  // Assureur : privilégier un supplier.name qui n'est PAS aussi le courtier
  // (le champ confond souvent les deux, cf. supplier_id==broker_id).
  const assureur =
    firstWith((c) => (c.supplier && c.supplier_id !== c.broker_id ? c.supplier.name : null)) ??
    firstWith((c) => c.supplier?.name) ??
    firstWith((c) => c.name);

  return {
    assureurActuel: assureur,
    courtierActuel: firstWith((c) => c.broker?.name),
    numeroContrat: numero,
    primeActuelle: prime != null && !Number.isNaN(prime) ? prime : null,
    contactCourtierEmail: email,
    contactCourtierTel: firstWith((c) => c.broker?.phone_number ?? c.supplier?.phone_number),
    _mataraContractId: (scored.find((c) => !c.closed) ?? scored[0])?.id ?? null,
    _numeroSource: numero ? "matera_field" : null,
    _mailManquant: !email,
  };
}

// Fusionne les sources selon la hiérarchie. `buildingId` vient de Copro.buildingId.
// On ne touche qu'aux champs qu'on trouve ; l'appelant décide de la fusion en
// base (et respecte le cliquet `contratVerrouilleLe`).
export async function buildRsAutofill(buildingId: string | number): Promise<ContratActuelExtrait | null> {
  // (3)+(2) : on charge TOUTES les lignes MRI (avec supplier/broker/documents)
  // car les champs utiles sont éclatés entre plusieurs contrats.
  const mri = await listMriContracts(buildingId);
  if (mri.length === 0) return null;

  const fulls = await Promise.all(
    mri.map((c) =>
      getContractWithDocs(buildingId, c.id).catch((e) => {
        console.error(`[matera] show contrat ${c.id} échoué:`, e);
        return null;
      }),
    ),
  );
  const loaded = fulls.filter((c): c is MateraContract => !!c);
  if (loaded.length === 0) return null;

  const base = mergeMriContracts(loaded);

  // Fallback PDF si le N° de contrat manque encore (~11 % des cas). On tente le
  // PDF de la ligne ouverte d'abord, puis n'importe quelle ligne MRI avec un PDF.
  if (!base.numeroContrat || base._mailManquant) {
    const withPdf = [...loaded].sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0));
    for (const c of withPdf) {
      const doc = pickContractPdf(c);
      if (!doc?.file?.url) continue;
      try {
        const pdf = await downloadPdf(doc.file.url);
        const ext = await extractFromPdf(pdf);
        if (!base.numeroContrat && ext.numeroContrat) {
          base.numeroContrat = ext.numeroContrat;
          base._numeroSource = "pdf";
        }
        if (base._mailManquant && ext.contactCourtierEmail && isUsableInsuranceEmail(ext.contactCourtierEmail)) {
          base.contactCourtierEmail = ext.contactCourtierEmail;
          base._mailManquant = false;
        }
        if (base.numeroContrat && !base._mailManquant) break;
      } catch (e) {
        console.error(`[matera] extraction PDF échouée (contrat ${c.id}):`, e);
      }
    }
  }

  // TODO (source PRIMAIRE) : l'avis d'échéance via Front est la vraie source de
  // vérité (les champs structurés Matera sont parfois périmés). Front indexe ses
  // conversations par le champ personnalisé `building_id` (= buildingId) + le n°
  // de police dans le sujet -> lookup déterministe. À implémenter dans
  // front-avis.ts : trouver le dernier avis d'échéance en PJ, l'extraire via
  // extractFromPdf(), et écraser numeroContrat/prime/email/assureur si trouvés
  // (avec _numeroSource = "front_avis").

  return base;
}
