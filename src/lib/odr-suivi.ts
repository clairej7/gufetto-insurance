// Sujet « Suivi des ODR acceptés » — recap hebdo + page gestio « Prévenir le CS ».
//
// Un post Slack hebdo (manuel) liste les dossiers passés en `odr_accepte` sur la
// semaine (lundi → vendredi) et pointe vers une PAGE TOKENISÉE (sans login) où les
// gestionnaires voient : copro / gestionnaire / assureur, avec un bouton violet
// « Prévenir le CS » à cliquer quand le dossier est sensible. Côté admin (semi-auto),
// on affiche la même liste + les dossiers flaggés « à prévenir » regroupés.
//
// Stockage SANS changement de schéma : le flag « prévenir le CS » = PipelineEvent
// `metadata.auto = "odr_prevenir_cs"` (+ `on`), le plus récent fait foi (toggle).

import { prisma } from "@/lib/prisma";
import { resolveSlackUserId } from "@/lib/devis6-slack";
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
const b64url = (b: Buffer) => b.toString("base64url");

// Jeton signé de SEMAINE (encode le lundi de la semaine) pour la page publique.
export function signOdrWeekToken(weekStartISO: string, ttlDays = 60): string {
  const payload = JSON.stringify({ w: weekStartISO, e: Date.now() + ttlDays * 86400000 });
  const body = b64url(Buffer.from(payload));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}
export function verifyOdrWeekToken(token: string): string | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { w, e } = JSON.parse(Buffer.from(body, "base64url").toString()) as { w?: string; e?: number };
    if (typeof e === "number" && Date.now() > e) return null;
    return typeof w === "string" ? w : null;
  } catch { return null; }
}

// Bornes de la semaine (lundi 00:00 → lundi suivant exclusif), en heure de Paris
// approximée en UTC-based (suffisant pour un découpage hebdo).
export function weekBounds(ref: Date): { start: Date; end: Date; monday: Date; friday: Date } {
  const d = new Date(ref);
  const dayFromMonday = (d.getDay() + 6) % 7; // 0 = lundi
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayFromMonday, 0, 0, 0, 0);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  const end = new Date(monday.getTime() + 7 * 86400000);
  return { start: monday, end, monday, friday };
}

export type OdrAccepteRow = {
  pipelineId: string;
  copro: string;
  gestionnaire: string | null;
  gestionnaireEmail: string | null;
  assureur: string;
  acceptedAt: string;
  prevenirCs: boolean;
  prevenirCsAt: string | null;
  prevenirCsBy: string | null;
};

// Dossiers passés en `odr_accepte` pendant la semaine contenant `weekStart`.
// Triés par ordre alphabétique de gestionnaire (puis copropriété).
export async function getOdrAcceptesSemaine(weekStart: Date): Promise<OdrAccepteRow[]> {
  const { start, end } = weekBounds(weekStart);
  const evts = await prisma.pipelineEvent.findMany({
    where: { type: "statut_change", nouveauStatut: "odr_accepte", createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    select: { pipelineId: true, createdAt: true },
  });
  const acceptedAt = new Map<string, Date>();
  for (const e of evts) if (!acceptedAt.has(e.pipelineId)) acceptedAt.set(e.pipelineId, e.createdAt);
  const ids = [...acceptedAt.keys()];
  if (!ids.length) return [];

  const [pipes, flags] = await Promise.all([
    prisma.insurancePipeline.findMany({
      where: { id: { in: ids }, copro: { archivedAt: null } },
      select: { id: true, odrPartenaire: true, copro: { select: { nom: true, gestionnaireNom: true, gestionnaireEmail: true, assureurActuel: true } } },
    }),
    prisma.pipelineEvent.findMany({
      where: { pipelineId: { in: ids }, metadata: { path: ["auto"], equals: "odr_prevenir_cs" } },
      orderBy: { createdAt: "desc" },
      select: { pipelineId: true, createdAt: true, createdBy: true, metadata: true },
    }),
  ]);
  // Flag actif = dernier event odr_prevenir_cs, on=true (le plus récent fait foi).
  const flagBy = new Map<string, { at: Date; by: string | null; on: boolean }>();
  for (const f of flags) {
    if (flagBy.has(f.pipelineId)) continue;
    const m = f.metadata as { on?: boolean } | null;
    flagBy.set(f.pipelineId, { at: f.createdAt, by: f.createdBy, on: m?.on !== false });
  }

  const rows: OdrAccepteRow[] = pipes.map((p) => {
    const fl = flagBy.get(p.id);
    return {
      pipelineId: p.id,
      copro: p.copro.nom,
      gestionnaire: p.copro.gestionnaireNom,
      gestionnaireEmail: p.copro.gestionnaireEmail,
      assureur: p.odrPartenaire || p.copro.assureurActuel || "—",
      acceptedAt: acceptedAt.get(p.id)!.toISOString(),
      prevenirCs: !!fl?.on,
      prevenirCsAt: fl?.on ? fl.at.toISOString() : null,
      prevenirCsBy: fl?.on ? fl.by : null,
    };
  });
  // Tri alphabétique par GESTIONNAIRE (puis copro), pour que chaque gestio retrouve
  // ses dossiers regroupés.
  rows.sort((a, b) =>
    (a.gestionnaire || "zzz").localeCompare(b.gestionnaire || "zzz", "fr", { sensitivity: "base" }) ||
    a.copro.localeCompare(b.copro, "fr", { sensitivity: "base" }),
  );
  return rows;
}

// Le gestionnaire (ou l'admin) bascule le flag « prévenir le CS » sur un dossier.
export async function setPrevenirCs(pipelineId: string, on: boolean, by: string): Promise<void> {
  await prisma.pipelineEvent.create({
    data: {
      pipelineId,
      type: "action_manuelle",
      description: on ? "« Prévenir le CS » activé (dossier ODR sensible signalé par le gestionnaire)" : "« Prévenir le CS » annulé",
      metadata: { auto: "odr_prevenir_cs", on },
      createdBy: by,
    },
  });
}

// Formatte "lundi 1 sept. → vendredi 5 sept." pour le message Slack / la page.
export function weekLabel(weekStart: Date): string {
  const { monday, friday } = weekBounds(weekStart);
  const f = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${f(monday)} → ${f(friday)}`;
}

// ── Message recap hebdo « ODR acceptés » ────────────────────────────────────
// Source de vérité UNIQUE : l'envoi Slack ET la prévisualisation admin appellent
// buildOdrRecapMessage → aucun décalage possible entre l'aperçu et ce qui part.

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://gufetto-insurance.up.railway.app";

export type RecapGestio = { nom: string; email: string | null; tagged: boolean };
export type OdrRecap = {
  count: number;
  label: string;
  url: string;               // lien tokenisé vers la page gestio
  gestios: RecapGestio[];    // gestionnaires concernés (dédup) + statut de tag Slack
  text: string;              // fallback texte Slack
  blocks: unknown[];         // Block Kit exactement posté
};

export async function buildOdrRecapMessage(ref: Date): Promise<OdrRecap> {
  const { start } = weekBounds(ref);
  const rows = await getOdrAcceptesSemaine(ref);
  const url = `${BASE_URL}/suivi-odr/${signOdrWeekToken(start.toISOString())}`;
  const label = weekLabel(ref);

  // Gestionnaires concernés, dédupliqués (par email sinon nom), triés alpha.
  const seen = new Set<string>();
  const uniques: { nom: string; email: string | null }[] = [];
  for (const r of rows) {
    const key = (r.gestionnaireEmail || r.gestionnaire || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniques.push({ nom: r.gestionnaire || "—", email: r.gestionnaireEmail });
  }
  uniques.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));

  // @mention si l'email est trouvé sur Slack, sinon nom en clair (best-effort).
  const gestios: RecapGestio[] = [];
  const mentions: string[] = [];
  for (const g of uniques) {
    const uid = g.email ? await resolveSlackUserId(g.email) : null;
    gestios.push({ nom: g.nom, email: g.email, tagged: !!uid });
    mentions.push(uid ? `<@${uid}>` : `*${g.nom}*`);
  }

  const text = `ODR acceptés de la semaine (${label}) — ${rows.length} dossier(s)`;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*📋 ODR acceptés de la semaine* _(${label})_\nVoici les *${rows.length}* copropriété(s) dont l'ODR a été accepté par nos partenaires cette semaine.` } },
    { type: "section", text: { type: "mrkdwn", text: `👉 <${url}|Voir la liste et signaler celles où il faut *prévenir le conseil syndical*>` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Repère tes copropriétés : si l'une est sensible, clique « Prévenir le CS »." }] },
  ];
  if (mentions.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `Liste des gestionnaires concernés : ${mentions.join(" ")}` } });
  }

  return { count: rows.length, label, url, gestios, text, blocks };
}
