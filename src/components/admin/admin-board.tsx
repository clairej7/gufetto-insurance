"use client";

import { useState } from "react";
import { getDaysUntilEcheance, categoriseDossier } from "@/lib/pipeline";
import type { PrimeStageRow } from "@/lib/prime";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { gestionnaireLabel } from "@/lib/gestionnaire";
import { EvolutionChart } from "./evolution-chart";
import { RsFlowChart } from "./rs-flow-chart";

type Pipeline = {
  id: string;
  statut: string;
  nouveauPrimeTTC: number | null;
  odrPartenaire: string | null;
  copro: {
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    primeActuelle: number | null;
    dateEcheance: Date | null;
    gestionnaireEmail: string | null;
    gestionnaireNom: string | null;
    clientMriStatut: string | null;
  };
  taskCompletions: Array<{ taskId: string; task: { required: boolean; statut: string } }>;
};

type RawEvent = {
  id: string;
  nouveauStatut: string | null;
  createdAt: Date;
  pipeline: { copro: { gestionnaireEmail: string | null } };
};

interface AdminBoardProps {
  pipelines: Pipeline[];
  taskTemplates: Array<{ id: string; statut: string; required: boolean }>;
  gestionnaires: string[];
  events: RawEvent[];
  // Dossiers perdus (abandonné/refusé/non assurable) : dataset séparé, passé EN
  // ENTIER pour la carte "Perdus" cliquable et le filtre échéance.
  lostPipelines: Pipeline[];
  // Complétude des primes par étape (miroir des montants) — calculée côté serveur.
  primeStages: PrimeStageRow[];
  // Nb de demandes de RS envoyées via Front (dossiers distincts).
  rsDemandes: number;
  rsRecus: number;
  contratsRecus: number;
  devisDemandes: number;
  // Vue « ODR par assureur » calculée côté serveur (même logique que l'Auto 2 :
  // marqueur ou fallback assureur + exclusions) → chiffres alignés sur l'automatisation.
  odrByInsurer: { key: string; label: string; count: number; montant: number; arr: number; stages: { label: string; count: number; montant: number; arr: number; color: string }[] }[];
  // Devis reçus = dossiers avec au moins 1 devis reçu (+ détail par assureur).
  devisRecus: { total: number; axa: number; mila: number };
  // Flux RS par jour (demandes envoyées vs RS reçus) pour le graphe du bas.
  rsFlow: { date: string; label: string; sent: number; relances: number; recus: number }[];
  // Nb de dossiers exclus des automatisations (à re-traiter plus tard).
  excludedCount: number;
}


const STAGE_COLS: { statut: string; label: string; shortLabel: string; bg: string; fg: string; bar: string }[] = [
  { statut: "identifie",          label: "Identification",      shortLabel: "Identification",       bg: "#F7F7F8", fg: "#656576", bar: "#D4D4DC" },
  { statut: "odr_en_cours",       label: "ODR en cours",        shortLabel: "ODR en cours",         bg: "#FFF7EB", fg: "#955804", bar: "#F5C55A" },
  { statut: "odr_envoye",         label: "ODR envoyées",        shortLabel: "ODR envoyées",         bg: "#FFF1DC", fg: "#8A4B04", bar: "#E8943A" },
  { statut: "rs_en_cours",        label: "Récupération du RS",  shortLabel: "Récupération du RS",   bg: "#F5F5FF", fg: "#4E49FC", bar: "#B8B5FD" },
  { statut: "devis_demandes",     label: "Demande des devis",   shortLabel: "Demande des devis",    bg: "#F5F5FF", fg: "#4E49FC", bar: "#9B97FC" },
  { statut: "devis_recus",        label: "Comparaison des devis", shortLabel: "Comparaison des devis", bg: "#EBEBFF", fg: "#3C38C7", bar: "#7C79F8" },
  { statut: "envoye_cs",          label: "Validation du CS",    shortLabel: "Validation du CS",     bg: "#FFF7EB", fg: "#955804", bar: "#F5A623" },
  { statut: "odr_accepte",        label: "ODR acceptés",        shortLabel: "ODR acceptés",         bg: "#EAFBEF", fg: "#13762C", bar: "#6FCF97" },
  { statut: "contrat_signe",      label: "Signé",               shortLabel: "Signé",                bg: "#EFFBF2", fg: "#13762C", bar: "#34C759" },
  { statut: "_clos",              label: "Clos",             shortLabel: "Clos",        bg: "#CFF2D8", fg: "#0E5D22", bar: "#0E5D22" },
  { statut: "_perdu",             label: "Perdus",           shortLabel: "Perdus",      bg: "#FFF5F5", fg: "#CA1E12", bar: "#F26D6D" },
];

// Le funnel n'a que 7 étapes visibles, mais l'enum a des sous-états. On replie
// chaque statut sur sa barre pour que TOUT dossier soit représenté (la somme des
// barres + Perdus = total). resiliation_envoyee / sepa_complete = "clos par statut"
// (cf. CLOSED_BY_STATUT) → barre Clôturé. rs_recu / validation_cs = sous-états rares
// repliés sur l'étape précédente la plus proche.

type TagVariant = "primary" | "warning" | "success" | "success-filled" | "error" | "neutral";
const TAG_BG: Record<TagVariant, string> = {
  primary: "#F5F5FF", warning: "#FFF7EB", success: "#EFFBF2",
  "success-filled": "#13762C", error: "#FFF5F5", neutral: "#F7F7F8",
};
const TAG_FG: Record<TagVariant, string> = {
  primary: "#4E49FC", warning: "#955804", success: "#13762C",
  "success-filled": "#ffffff", error: "#CA1E12", neutral: "#656576",
};
const STATUT_TAG: Record<string, { label: string; variant: TagVariant }> = {
  identifie:      { label: "Identification",       variant: "neutral" },
  odr_en_cours:   { label: "ODR en cours",         variant: "warning" },
  odr_envoye:     { label: "ODR envoyée",          variant: "warning" },
  odr_accepte:    { label: "ODR accepté",          variant: "success" },
  odr_en_vigueur: { label: "ODR en vigueur",       variant: "success-filled" },
  rs_en_cours:    { label: "Récupération du RS",   variant: "primary" },
  devis_demandes: { label: "Demande des devis",    variant: "primary" },
  devis_recus:    { label: "Comparaison des devis", variant: "primary" },
  envoye_cs:      { label: "Validation du CS",     variant: "warning" },
  contrat_signe:  { label: "Signé",                variant: "success-filled" },
  termine:        { label: "Clôturé",        variant: "success" },
  abandonne:      { label: "Abandonné",      variant: "error" },
  refuse:         { label: "Refus client",   variant: "error" },
  non_assurable:  { label: "Non assurable",  variant: "error" },
};

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, Menlo, Consolas, monospace";

// Les 4 assureurs partenaires ODR. Le suivi s'appuie sur le MARQUEUR persistant
// `pipeline.odrPartenaire` (posé au traitement d'une liste ODR) — fiable à travers
// toutes les étapes, y compris une fois le dossier clos (contrairement à l'assureur
// seul : un clos AXA n'est pas forcément un ODR).

// Filtre échéance (même modèle que la page Pipeline).
const selectStyle: React.CSSProperties = {
  fontSize: 13, height: 32, padding: "0 8px",
  border: "1px solid #E8E8EC", borderRadius: 4,
  background: "#fff", color: "#26262C", outline: "none", cursor: "pointer",
};

const TH: React.CSSProperties = {
  background: "#FBFBFB", fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.04em", color: "#A2A1AF",
  textAlign: "center", padding: "0 16px", height: 44,
  borderBottom: "1px solid #E8E8EC", whiteSpace: "nowrap", userSelect: "none", minWidth: 80,
};
const TH_LEFT: React.CSSProperties  = { ...TH, textAlign: "left",  minWidth: 200 };
const TH_RIGHT: React.CSSProperties = { ...TH, textAlign: "right", minWidth: 140 };
const TD: React.CSSProperties = {
  padding: "12px 16px", height: 48, fontFamily: FONT_SANS, fontSize: 13,
  lineHeight: "18px", color: "#26262C", borderBottom: "1px solid #F3F3F5",
  verticalAlign: "middle", textAlign: "center",
};
const TD_LEFT: React.CSSProperties  = { ...TD, textAlign: "left" };
const TD_RIGHT: React.CSSProperties = { ...TD, textAlign: "right" };

type KpiFilter = "actifs" | "gagnes" | "perdus" | null;

// Grand en-tête de section « Partie N — Titre » (sépare nettement les 5 parties).
function PartTitle({ n, title, first }: { n: number; title: string; first?: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 44, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "#fff", background: "#4E49FC", borderRadius: 999, padding: "5px 13px", whiteSpace: "nowrap" }}>PARTIE {n}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: "#26262C", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{title}</span>
      <span style={{ flex: 1, height: 2, background: "#ECECF3", borderRadius: 2 }} />
    </div>
  );
}

export function AdminBoard({ pipelines, gestionnaires, events, lostPipelines, primeStages, rsDemandes, rsRecus, contratsRecus, devisDemandes, odrByInsurer, devisRecus, rsFlow, excludedCount }: AdminBoardProps) {
  const [selectedGestionnaires, setSelectedGestionnaires] = useState<string[]>([]);
  const [selectedEcheance, setSelectedEcheance] = useState("all");
  const [activeKpi, setActiveKpi] = useState<KpiFilter>(null);

  // Libellé d'affichage par email (nom Omni si présent, sinon dérivation).
  const gestioNomByEmail = new Map<string, string | null>();
  for (const p of pipelines) {
    if (p.copro.gestionnaireEmail) gestioNomByEmail.set(p.copro.gestionnaireEmail, p.copro.gestionnaireNom);
  }

  // Filtres appliqués aux deux datasets (actifs+gagnés = `fp`, perdus = `flost`).
  const gestioMatch = (p: Pipeline) =>
    selectedGestionnaires.length === 0 || selectedGestionnaires.includes(p.copro.gestionnaireEmail ?? "");
  const inEcheance = (p: Pipeline) => {
    if (selectedEcheance === "all") return true;
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    if (selectedEcheance === "lt2")   return d !== null && d <= 60;
    if (selectedEcheance === "bt2_6") return d !== null && d > 60 && d <= 180;
    if (selectedEcheance === "gt6")   return d !== null && d > 180;
    return true;
  };
  const fp    = pipelines.filter(p => gestioMatch(p) && inEcheance(p));
  const flost = lostPipelines.filter(p => gestioMatch(p) && inEcheance(p));
  const lostCount = flost.length;

  function toggleKpi(k: KpiFilter) { setActiveKpi(prev => prev === k ? null : k); }

  // Classement central : un dossier clos (dont clients MRI hors Wakam) n'est ni actif ni urgent.
  const bucketOf = (p: Pipeline) => categoriseDossier({
    statut: p.statut,
    dateEcheance: p.copro.dateEcheance,
    clientMriStatut: p.copro.clientMriStatut,
    assureurActuel: p.copro.assureurActuel,
  });
  // ODR inclus (dossier en cours de travail). "contrat_signe" exclu : c'est un
  // deal gagné (compté dans "gagnés"), sinon double-comptage actifs+gagnés.
  const isActif = (p: Pipeline) => { const b = bucketOf(p); return (b === "urgent" || b === "autre" || b === "odr" || b === "odr_envoye") && p.statut !== "contrat_signe"; };

  // "Deals gagnés" = clos (clients MRI hors Wakam inclus) + contrat signé + ODR accepté
  // (ordre validé par l'assureur ; deal gagné même si le mandat démarre à l'échéance).
  const wonPipelines     = fp.filter(p => bucketOf(p) === "clos" || p.statut === "contrat_signe" || p.statut === "odr_accepte");
  const activePipelines  = fp.filter(isActif);

  // Taux calculés sur le VRAI total (actifs + gagnés + perdus).
  const realTotal     = activePipelines.length + wonPipelines.length + lostCount;
  const tauxSignature = realTotal > 0 ? Math.round((wonPipelines.length / realTotal) * 100) : 0;
  const tauxPerte     = realTotal > 0 ? Math.round((lostCount / realTotal) * 100) : 0;

  const kpiDetail: { label: string; rows: Pipeline[] } | null =
    activeKpi === "actifs" ? { label: "Dossiers actifs", rows: activePipelines } :
    activeKpi === "gagnes" ? { label: "Deals gagnés",    rows: wonPipelines }    :
    activeKpi === "perdus" ? { label: "Dossiers perdus", rows: flost }           : null;

  /* ── Bar chart data ── */
  // Répartition alignée sur les buckets (comme la page Pipeline) : les barres
  // d'étape ne comptent que les dossiers ACTIFS de cette étape ; ODR/Clos/Perdus
  // sont comptés par bucket. Ainsi un client "identifié" tombe dans "Clos", pas
  // dans "Identifié" -> mêmes nombres des deux côtés, plus de dossiers qui
  // "sautent" d'une étape à l'autre entre les deux interfaces.
  const rowsForCol = (statut: string): Pipeline[] => {
    if (statut === "_perdu") return flost;
    if (statut === "_clos") return fp.filter(p => bucketOf(p) === "clos");
    if (statut === "odr_en_cours") return fp.filter(p => bucketOf(p) === "odr");
    // ODR envoyé = étape active dédiée (bucket odr_envoye).
    if (statut === "odr_envoye") return fp.filter(p => bucketOf(p) === "odr_envoye");
    // ODR accepté = deal gagné dédié (bucket odr_accepte).
    if (statut === "odr_accepte") return fp.filter(p => bucketOf(p) === "odr_accepte");
    // Signé = deal gagné à part (hors "actifs", hors "clos").
    if (statut === "contrat_signe") return fp.filter(p => p.statut === "contrat_signe" && bucketOf(p) !== "clos");
    return fp.filter(p => p.statut === statut && isActif(p));
  };
  const sumPrime = (rows: Pipeline[]) => rows.reduce((s, p) => s + (p.copro.primeActuelle ?? 0), 0);
  const barData = STAGE_COLS.map(col => {
    const rows = rowsForCol(col.statut);
    return { ...col, count: rows.length, prime: sumPrime(rows) };
  });
  const maxBar = Math.max(...barData.map(b => b.count), 1);
  const maxPrime = Math.max(...barData.map(b => b.prime), 1);
  const CHART_H = 140;

  // Montants (primes) et ARR potentiel (25% de la prime) par catégorie.
  const primeActifs = sumPrime(activePipelines);
  const primeGagnes = sumPrime(wonPipelines);
  const primePerdus = sumPrime(flost);
  const fmtEur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const fmtEurC = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} M€` : n >= 1e3 ? `${Math.round(n / 1e3)} k€` : `${Math.round(n)} €`;

  // ── Suivi des ODR ─────────────────────────────────────────────────────────
  // DEUX vues (cf. Quentin) :
  //  • Pipeline ODR (bas) = agrégat par STATUT sur TOUS les dossiers → aligné sur
  //    le Kanban « Répartition par étape ». odr_en_cours/envoye/accepte ne servent
  //    QU'à l'ODR → tout dossier dans ce statut est un ODR (même sans assureur connu).
  //    « ODR clos » = ODR devenus clos/en vigueur (marqueur requis, car le clos
  //    générique est majoritairement non-ODR).
  //  • Par assureur (haut) = par MARQUEUR `odrPartenaire`. La somme des 4 assureurs
  //    est normalement INFÉRIEURE au total (assureur pas toujours renseigné).
  //  Les perdus/refusés sont dans lostPipelines (hors `fp`) → exclus d'office.
  const odrRows         = fp.filter(p => !!p.odrPartenaire);
  // Agrégat pipeline (statut) — bloc du bas :
  const aggEnCours = fp.filter(p => p.statut === "odr_en_cours");
  const aggEnvoye  = fp.filter(p => p.statut === "odr_envoye");
  const aggAccepte = fp.filter(p => p.statut === "odr_accepte");
  const aggClos    = odrRows.filter(p => bucketOf(p) === "clos"); // ODR-clos = marqués
  const odrStages = [
    { key: "odr",     label: "ODR en cours",  rows: aggEnCours, color: "#955804" },
    { key: "envoye",  label: "ODR envoyées",  rows: aggEnvoye,  color: "#8A4B04" },
    { key: "accepte", label: "ODR acceptés",  rows: aggAccepte, color: "#13762C" },
    { key: "clos",    label: "ODR clos",      rows: aggClos,    color: "#0E5D22" },
  ];
  // Par assureur (bloc du haut) : `odrByInsurer` vient désormais du SERVEUR
  // (même logique que l'Auto 2 : normPartner + exclusions) → chiffres identiques
  // entre le dashboard et l'automatisation.

  // Regroupement visuel du graphe en 4 zones (contenu identique, juste l'affichage).
  const byStatut = Object.fromEntries(barData.map(b => [b.statut, b] as const));
  const grp = (statuts: string[]) => statuts.map(s => byStatut[s]).filter(Boolean);
  const G_FUNNEL = grp(["identifie", "rs_en_cours", "devis_demandes", "devis_recus", "envoye_cs"]);
  const G_ODR    = grp(["odr_en_cours", "odr_envoye"]);
  const G_GAGNE  = grp(["odr_accepte", "contrat_signe", "_clos"]);
  const G_PERDU  = grp(["_perdu"]);

  // Taux de pénétration théorique : si les dossiers en passe d'être gagnés
  // (« Validation du CS » + « ODR en cours » + « ODR envoyées ») passaient tous en clos.
  const enPasseDeClos = rowsForCol("envoye_cs").length + aggEnCours.length + aggEnvoye.length;
  const tauxTheorique = realTotal > 0 ? Math.round(((wonPipelines.length + enPasseDeClos) / realTotal) * 100) : 0;

  // Totaux de complétude des primes (tous stades confondus).
  const primeTotalDossiers = primeStages.reduce((a, s) => a + s.total, 0);
  const primeSansTotal = primeStages.reduce((a, s) => a + s.sansPrime, 0);
  const primeAvecTotal = primeTotalDossiers - primeSansTotal;

  // ── Suivi des changements d'assureur (dossiers CLASSIQUES, hors ODR) ──
  // Pipeline RS → devis → CS → signé → clos. Pour signé/clos on EXCLUT les dossiers
  // passés par un ODR (marqueur odrPartenaire) → ne reste que les changements classiques.
  const classicStages = [
    { key: "rs_en_cours",    label: "RS en cours",           rows: rowsForCol("rs_en_cours"),    color: "#4E49FC" },
    { key: "devis_demandes", label: "Demande de devis",      rows: rowsForCol("devis_demandes"), color: "#6D69F5" },
    { key: "devis_recus",    label: "Comparaison des devis", rows: rowsForCol("devis_recus"),    color: "#8A87E8" },
    { key: "envoye_cs",      label: "Validation du CS",      rows: rowsForCol("envoye_cs"),      color: "#F5A623" },
    { key: "signe",          label: "Signé",                 rows: rowsForCol("contrat_signe").filter(p => !p.odrPartenaire), color: "#13762C" },
    { key: "clos",           label: "Clos",                  rows: rowsForCol("_clos").filter(p => !p.odrPartenaire),         color: "#0E5D22" },
  ];
  const wonClassic = [...classicStages[4].rows, ...classicStages[5].rows];
  const insurerGroup = (a: string | null): string => {
    const s = (a || "").toLowerCase();
    if (!s) return "Non renseigné";
    if (/\baxa\b/.test(s)) return "AXA";
    if (/\bmila\b/.test(s)) return "Mila";
    if (/g[eé]n[eé]?rali/.test(s)) return "Generali";
    if (/\bsada\b/.test(s)) return "SADA";
    return "Autre";
  };
  const classicInsurers = (() => {
    const m: Record<string, number> = {};
    for (const p of wonClassic) { const k = insurerGroup(p.copro.assureurActuel); m[k] = (m[k] ?? 0) + 1; }
    const order = ["AXA", "Mila", "Generali", "SADA", "Autre", "Non renseigné"];
    return Object.entries(m).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([label, count]) => ({ label, count }));
  })();

  const renderBar = (bar: (typeof barData)[number]) => {
    const barH = bar.count > 0 ? Math.max(Math.round((bar.count / maxBar) * CHART_H), 6) : 0;
    return (
      <div key={bar.statut} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, height: "100%", justifyContent: "flex-end" }}>
        <span style={{ fontSize: bar.count > 0 ? 15 : 12, fontWeight: 700, color: bar.count > 0 ? bar.fg : "#C0C0C9", fontVariantNumeric: "tabular-nums", marginBottom: 4, minHeight: 22, display: "flex", alignItems: "flex-end" }}>
          {bar.count}
        </span>
        <div style={{ width: "100%", height: barH, background: bar.count > 0 ? bar.bar : "#F3F3F5", borderRadius: "4px 4px 0 0", transition: "height 300ms ease", opacity: bar.count > 0 ? 1 : 0.4 }} />
        <div style={{ width: "100%", height: 1, background: "#E8E8EC" }} />
        <span style={{ fontSize: 11, color: "#656576", textAlign: "center", marginTop: 6, lineHeight: "13px", fontWeight: 500, width: "100%", whiteSpace: "normal", wordBreak: "break-word", height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {bar.shortLabel}
        </span>
      </div>
    );
  };

  const renderRevenueBar = (bar: (typeof barData)[number]) => {
    const barH = bar.prime > 0 ? Math.max(Math.round((bar.prime / maxPrime) * CHART_H), 6) : 0;
    return (
      <div key={bar.statut} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, height: "100%", justifyContent: "flex-end" }}>
        <span style={{ fontSize: bar.prime > 0 ? 13 : 12, fontWeight: 700, color: bar.prime > 0 ? bar.fg : "#C0C0C9", fontVariantNumeric: "tabular-nums", marginBottom: 4, minHeight: 22, display: "flex", alignItems: "flex-end" }}>
          {bar.prime > 0 ? fmtEurC(bar.prime) : "—"}
        </span>
        <div style={{ width: "100%", height: barH, background: bar.prime > 0 ? bar.bar : "#F3F3F5", borderRadius: "4px 4px 0 0", transition: "height 300ms ease", opacity: bar.prime > 0 ? 1 : 0.4 }} />
        <div style={{ width: "100%", height: 1, background: "#E8E8EC" }} />
        <span style={{ fontSize: 11, color: "#656576", textAlign: "center", marginTop: 6, lineHeight: "13px", fontWeight: 500, width: "100%", whiteSpace: "normal", wordBreak: "break-word", height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {bar.shortLabel}
        </span>
      </div>
    );
  };

  const dividerFull: React.CSSProperties = { alignSelf: "stretch", borderLeft: "1px dashed #C0C0C9", margin: "0 10px" };
  const dividerBars: React.CSSProperties = { alignSelf: "stretch", borderLeft: "1px dashed #DADAE0", margin: "0 6px" };
  // Titre de zone : autorisé à passer sur 2 lignes (sinon "73 deals perdus · perte 3%"
  // forçait la largeur de la zone Perdus → barre trop large). Hauteur fixe = alignement.
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontFamily: FONT_MONO, fontWeight: 600, textAlign: "center", marginBottom: 14, whiteSpace: "normal", minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "15px" };
  const barsRow: React.CSSProperties = { display: "flex", alignItems: "flex-end", gap: 8, height: CHART_H + 40 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, fontFamily: FONT_SANS }}>

      {/* ── Filtres ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <MultiSelectFilter
          placeholder="Tous les gestionnaires"
          options={gestionnaires}
          value={selectedGestionnaires}
          onChange={setSelectedGestionnaires}
          renderOption={(e) => gestionnaireLabel(e, gestioNomByEmail.get(e))}
          width={200}
        />
        <select value={selectedEcheance} onChange={(e) => setSelectedEcheance(e.target.value)} style={selectStyle}>
          <option value="all">Toutes les échéances</option>
          <option value="lt2">{"< 2 mois"}</option>
          <option value="bt2_6">2 à 6 mois</option>
          <option value="gt6">{"> 6 mois"}</option>
        </select>
        {selectedGestionnaires.length > 0 && (() => {
          const totalDossiers = fp.length + lostCount; // actifs + perdus, comme dans Pipeline
          return (
            <span style={{ fontSize: 12, color: "#656576" }}>
              {totalDossiers} dossier{totalDossiers > 1 ? "s" : ""}
            </span>
          );
        })()}
      </div>

      <PartTitle n={1} title="État des lieux du pipe" first />

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {([
          { filter: "actifs" as KpiFilter, label: "Dossiers actifs", value: activePipelines.length, color: "#26262C",                                     numeric: true },
          { filter: "gagnes" as KpiFilter, label: "Deals gagnés",     value: wonPipelines.length,    color: wonPipelines.length > 0 ? "#13762C" : "#26262C", numeric: true },
          { filter: "perdus" as KpiFilter, label: "Dossiers perdus",  value: lostCount,              color: lostCount > 0 ? "#CA1E12" : "#26262C",           numeric: true },
        ]).map(({ filter, label, value, color, numeric }) => {
          const isActive = filter !== null && activeKpi === filter;
          const clickable = filter !== null;
          return (
            <div
              key={label}
              onClick={() => filter && toggleKpi(filter)}
              style={{
                background: isActive ? "#FAFAFF" : "#fff",
                border: `1.5px solid ${isActive ? "#4E49FC" : "#E8E8EC"}`,
                borderRadius: 8, padding: "16px 20px",
                boxShadow: isActive ? "0 0 0 3px rgba(78,73,252,.08)" : "0 1px 2px rgba(13,22,63,.05)",
                cursor: clickable ? "pointer" : "default", transition: "all 120ms",
              }}
            >
              <div style={{ fontSize: numeric ? 28 : 22, fontWeight: 700, letterSpacing: "-0.03em", color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                {value}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontSize: 13, color: "#656576" }}>{label}</span>
                {clickable && (
                  <span style={{ fontSize: 11, color: isActive ? "#4E49FC" : "#A2A1AF", fontWeight: 500 }}>
                    {isActive ? "Masquer" : "Voir →"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Taux de pénétration (= taux de signature) ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 32, background: "#F5F5FF", border: "1.5px solid #4E49FC", borderRadius: 10, padding: "20px 26px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: "#4E49FC", letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{tauxSignature}%</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Taux de pénétration</div>
            <div style={{ fontSize: 12.5, color: "#656576", marginTop: 2 }}>{wonPipelines.length} gagnés sur {realTotal} dossiers</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, borderLeft: "1px solid #C7C5F5", paddingLeft: 28, maxWidth: 380 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: "#8A87E8", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{tauxTheorique}%</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, fontStyle: "italic", color: "#8A87E8" }}>Taux de pénétration théorique</div>
            <div style={{ fontSize: 12, color: "#A2A1AF", marginTop: 2 }}>lorsque les « Validation du CS » / « ODR en cours » / « ODR envoyées » seront passés en clos</div>
          </div>
        </div>
      </div>

      {/* ── Bar chart : répartition par étape ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ marginBottom: 18 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Répartition par étape</span>
        </div>

        {/* 4 zones séparées par des pointillés, chacune avec son titre. */}
        <div style={{ display: "flex", alignItems: "stretch" }}>

          {/* Zones 1 + 2 : Actifs (funnel + ODR) */}
          <div style={{ flex: 7, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#656576" }}>{activePipelines.length} dossiers actifs</div>
            <div style={barsRow}>
              {G_FUNNEL.map(renderBar)}
              <div style={dividerBars} />
              {G_ODR.map(renderBar)}
            </div>
          </div>

          <div style={dividerFull} />

          {/* Zone 3 : Gagnés (ODR acceptés + signé + clos) */}
          <div style={{ flex: 3, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#13762C" }}>{wonPipelines.length} deals gagnés · signature {tauxSignature}%</div>
            <div style={barsRow}>
              {G_GAGNE.map(renderBar)}
            </div>
          </div>

          <div style={dividerFull} />

          {/* Zone 4 : Perdus */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#CA1E12" }}>{lostCount} deals perdus · perte {tauxPerte}%</div>
            <div style={barsRow}>
              {G_PERDU.map(renderBar)}
            </div>
          </div>

        </div>
      </div>

      <PartTitle n={2} title="Revenus — montants en jeu" />

      {/* ── Revenus — montants en jeu ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Revenus — montants en jeu</span>
        </div>

        {/* Sous-partie 1 : montant (somme des primes) par étape, mêmes 4 zones */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div style={{ flex: 7, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#656576" }}>{fmtEur(primeActifs)} · actifs</div>
            <div style={barsRow}>
              {G_FUNNEL.map(renderRevenueBar)}
              <div style={dividerBars} />
              {G_ODR.map(renderRevenueBar)}
            </div>
          </div>
          <div style={dividerFull} />
          <div style={{ flex: 3, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#13762C" }}>{fmtEur(primeGagnes)} · gagnés</div>
            <div style={barsRow}>{G_GAGNE.map(renderRevenueBar)}</div>
          </div>
          <div style={dividerFull} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#CA1E12" }}>{fmtEur(primePerdus)} · perdus</div>
            <div style={barsRow}>{G_PERDU.map(renderRevenueBar)}</div>
          </div>
        </div>

        {/* Sous-partie 2 : synthèse montant + ARR potentiel (×0,25) */}
        <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: "#A2A1AF", marginTop: 8, marginBottom: 12 }}>Synthèse & ARR potentiel</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Actifs", prime: primeActifs, color: "#26262C" },
            { label: "Gagnés", prime: primeGagnes, color: "#13762C" },
            { label: "Perdus", prime: primePerdus, color: "#CA1E12" },
          ].map(b => (
            <div key={b.label} style={{ border: "1px solid #E8E8EC", borderRadius: 8, padding: "14px 16px", background: "#FBFBFB" }}>
              <div style={{ fontSize: 12, fontWeight: 600, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.04em", color: b.color, marginBottom: 12 }}>{b.label}</div>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: "#26262C", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{fmtEur(b.prime)}</div>
                  <div style={{ fontSize: 11, color: "#656576", marginTop: 3 }}>Montant en jeu</div>
                </div>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: b.color, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{fmtEur(b.prime * 0.25)}</div>
                  <div style={{ fontSize: 11, color: "#656576", marginTop: 3 }}>ARR potentiel (×0,25)</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Complétude des primes par étape (part de montants connus/inconnus) */}
        <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: "#A2A1AF", marginTop: 20, marginBottom: 12 }}>Complétude des primes par étape</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {primeStages.map((s) => {
            const c = `hsl(${Math.round((1 - s.tauxInconnu) * 125)}, 62%, 42%)`;
            return (
              <div key={s.label} style={{ flex: "0 0 128px", border: "1px solid #E8E8EC", borderTop: `3px solid ${c}`, borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                <div style={{ fontSize: 11, color: "#656576", lineHeight: "14px", minHeight: 28 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c, marginTop: 4, lineHeight: 1 }}>{Math.round(s.tauxInconnu * 100)}%</div>
                <div style={{ fontSize: 11, color: "#656576", marginTop: 1 }}>de primes inconnues</div>
                <div style={{ fontSize: 10.5, color: "#A2A1AF", marginTop: 3 }}>{s.sansPrime}/{s.total} sans prime</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12.5, color: "#656576", marginTop: 12, fontVariantNumeric: "tabular-nums" }}>
          Total : <strong style={{ color: "#26262C" }}>{primeAvecTotal}</strong> / {primeTotalDossiers} dossiers avec prime renseignée · <strong style={{ color: "#CA1E12" }}>{primeSansTotal}</strong> primes manquantes
        </div>
      </div>

      <PartTitle n={3} title="Suivi des ODR" />

      {/* ── Suivi des ODR ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Suivi des ODR</span>
        </div>
        <div style={{ fontSize: 12, color: "#656576", marginBottom: 18 }}>
          Avancement des ordres de remplacement chez nos 4 partenaires.
          <br />
          <span style={{ color: "#A2A1AF" }}>ℹ️ Le <b>pipeline ODR</b> (en bas) compte tous les dossiers par étape (aligné sur la Répartition). La vue <b>par assureur</b> suit la <b>même logique que l&apos;automatisation ODR</b> (marqueur ODR, sinon assureur du contrat ; hors dossiers exclus) → les chiffres sont alignés. La somme des 4 assureurs peut rester inférieure au total (dossiers sans partenaire identifiable). « ODR clos » = ODR accepté et en vigueur (récupération passée) ou devenu client. Refusés / perdus jamais comptés.</span>
        </div>

        {/* Par assureur : nb dossiers + montant en jeu + ARR, puis répartition par stade */}
        <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: "#A2A1AF", marginBottom: 10 }}>Dossiers ODR par assureur — toutes étapes (aligné sur l&apos;automatisation ODR)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 24 }}>
          {odrByInsurer.map(ins => (
            <div key={ins.label} style={{ border: "1px solid #E8E8EC", borderRadius: 8, padding: "14px 16px", background: "#FBFBFB" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#26262C", marginBottom: 10 }}>{ins.label}</div>
              {/* Ligne du haut : nb dossiers · montant en jeu · ARR */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid #EEEEF1" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#26262C", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{ins.count}</div>
                  <div style={{ fontSize: 11, color: "#656576", marginTop: 2 }}>Dossiers</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#26262C", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{ins.montant > 0 ? fmtEurC(ins.montant) : "—"}</div>
                  <div style={{ fontSize: 11, color: "#656576", marginTop: 2 }}>Montant en jeu</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#13762C", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{ins.arr > 0 ? fmtEurC(ins.arr) : "—"}</div>
                  <div style={{ fontSize: 11, color: "#656576", marginTop: 2 }}>ARR associé</div>
                </div>
              </div>
              {/* Répartition par stade : montant en jeu + ARR par ligne */}
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", fontSize: 10, fontFamily: FONT_MONO, color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.03em", paddingBottom: 5 }}>
                  <span style={{ flex: 1 }} />
                  <span style={{ width: 34, textAlign: "right" }}>Nb</span>
                  <span style={{ width: 58, textAlign: "right" }}>En jeu</span>
                  <span style={{ width: 58, textAlign: "right" }}>ARR</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {ins.stages.map(st => (
                    <div key={st.label} style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                      <span style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 6, color: "#656576" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                        {st.label}
                      </span>
                      <span style={{ width: 34, textAlign: "right", fontWeight: 600, color: st.count > 0 ? "#26262C" : "#C0C0C9", fontVariantNumeric: "tabular-nums" }}>
                        {st.count}
                      </span>
                      <span style={{ width: 58, textAlign: "right", fontWeight: 600, color: st.montant > 0 ? "#26262C" : "#C0C0C9", fontVariantNumeric: "tabular-nums" }}>
                        {st.montant > 0 ? fmtEurC(st.montant) : "—"}
                      </span>
                      <span style={{ width: 58, textAlign: "right", fontWeight: 600, color: st.arr > 0 ? "#13762C" : "#C0C0C9", fontVariantNumeric: "tabular-nums" }}>
                        {st.arr > 0 ? fmtEurC(st.arr) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mini-pipeline ODR — présenté en kanban (colonnes à liseré coloré) */}
        <div style={{ fontSize: 12, fontFamily: FONT_MONO, color: "#A2A1AF", marginBottom: 10 }}>Pipeline ODR — nombre · montant en jeu · ARR potentiel (×0,25)</div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {odrStages.map(st => {
            const prime = sumPrime(st.rows);
            return (
              <div key={st.key} style={{ flex: "1 1 0", minWidth: 150, border: "1px solid #E8E8EC", borderTop: `3px solid ${st.color}`, borderRadius: 8, padding: "12px 14px", background: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 600, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.04em", color: st.color, marginBottom: 8 }}>{st.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{st.rows.length}</div>
                <div style={{ fontSize: 11, color: "#656576", marginBottom: 8 }}>dossiers</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#26262C" }}>{prime > 0 ? fmtEurC(prime) : "—"}</div>
                <div style={{ fontSize: 10.5, color: "#A2A1AF" }}>en jeu</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: st.color, marginTop: 4 }}>{prime > 0 ? fmtEurC(prime * 0.25) : "—"}</div>
                <div style={{ fontSize: 10.5, color: "#A2A1AF" }}>ARR potentiel</div>
              </div>
            );
          })}
        </div>
      </div>

      <PartTitle n={4} title="Suivi des changements d'assureur" />

      {/* ── Suivi des changements d'assureur (dossiers classiques, hors ODR) ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Suivi des changements d&apos;assureur</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>Partie en cours de configuration</span>
        </div>
        <div style={{ fontSize: 12, color: "#656576", marginBottom: 18 }}>
          Dossiers classiques (RS → devis → conseil syndical → signature), hors ODR.{" "}
          <span style={{ color: "#A2A1AF" }}>« Signé » et « Clos » excluent les dossiers gagnés via un ODR.</span>
        </div>

        {/* Pipeline changement d'assureur — kanban, 3 cartes par ligne */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {classicStages.map(st => {
            const prime = sumPrime(st.rows);
            return (
              <div key={st.key} style={{ border: "1px solid #E8E8EC", borderTop: `3px solid ${st.color}`, borderRadius: 8, padding: "11px 14px", background: "#fff" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: "0.04em", color: st.color, marginBottom: 8 }}>{st.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{st.rows.length}</div>
                    <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>dossiers</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{prime > 0 ? fmtEurC(prime) : "—"}</div>
                    <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>en jeu</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: st.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{prime > 0 ? fmtEurC(prime * 0.25) : "—"}</div>
                    <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>ARR potentiel</div>
                  </div>
                </div>

                {st.key === "rs_en_cours" && (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px dashed #E8E8EC" }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#4E49FC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{rsDemandes}</div>
                        <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>demandes envoyées</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{rsRecus}</div>
                        <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>RS reçus</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{contratsRecus}</div>
                        <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>contrats récupérés</div>
                      </div>
                    </div>
                  </div>
                )}

                {st.key === "devis_demandes" && (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px dashed #E8E8EC" }}>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#4E49FC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{devisDemandes}</div>
                        <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>dont mails envoyés</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{devisRecus.total}</div>
                        <div style={{ fontSize: 10.5, color: "#656576", marginTop: 2 }}>devis reçus</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10.5, color: "#656576", display: "flex", gap: 12 }}>
                      <span><strong style={{ color: "#0A6BB8" }}>{devisRecus.axa}</strong> devis AXA</span>
                      <span><strong style={{ color: "#8A4FC7" }}>{devisRecus.mila}</strong> devis Mila</span>
                    </div>
                  </div>
                )}

                {st.key === "clos" && (() => {
                  const g = (l: string) => classicInsurers.find(x => x.label === l)?.count ?? 0;
                  const axa = g("AXA"), sada = g("SADA"), mila = g("Mila");
                  const autres = wonClassic.length - axa - sada - mila;
                  const rows: [string, number][] = [["AXA", axa], ["Mila", mila], ["SADA", sada], ["Autres", autres]];
                  return (
                    <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px dashed #E8E8EC" }}>
                      <div style={{ fontSize: 10.5, color: "#A2A1AF", marginBottom: 6 }}>Assureurs des {wonClassic.length} gagnés</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                        {rows.map(([label, n]) => (
                          <span key={label} style={{ fontSize: 12.5, color: n > 0 ? "#26262C" : "#C7C7D1" }}>
                            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{n}</strong> {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>


        <RsFlowChart data={rsFlow} recusTotal={rsRecus} demandesTotal={rsDemandes} />
      </div>

      <PartTitle n={5} title="Autres" />

      {/* ── Dossiers exclus des automatisations ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 2px rgba(13,22,63,.05)", display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: excludedCount > 0 ? "#B4690E" : "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{excludedCount}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Dossiers exclus des automatisations</div>
          <div style={{ fontSize: 12, color: "#656576", marginTop: 2 }}>Copros mises de côté (gestionnaires/dossiers exclus). À re-traiter à la main plus tard — elles ne partent dans aucune automatisation.</div>
        </div>
      </div>

      {/* ── Évolution semaine par semaine ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Activité</span>
          <span style={{ fontSize: 12, color: "#A2A1AF", fontFamily: FONT_MONO }}>transitions de statut · hors synchro Omni</span>
        </div>
        <EvolutionChart events={events} filteredGestionnaires={selectedGestionnaires} />
      </div>

      {/* ── Tableau de détail KPI ── */}
      {kpiDetail && (
        <div style={{ border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #E8E8EC" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>{kpiDetail.label}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: "#656576", padding: "2px 8px", background: "#F7F7F8", borderRadius: 10 }}>
              {kpiDetail.rows.length}
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_SANS }}>
            <thead>
              <tr>
                <th style={{ ...TH_LEFT, minWidth: 200 }}>Copropriété</th>
                <th style={TH_LEFT}>Gestionnaire</th>
                <th style={TH}>Statut</th>
                <th style={TH_RIGHT}>Échéance</th>
              </tr>
            </thead>
            <tbody>
              {kpiDetail.rows.map(p => {
                const days = getDaysUntilEcheance(p.copro.dateEcheance);
                const urgColor = days !== null && days <= 60 ? "#CA1E12" : days !== null && days <= 120 ? "#955804" : "#A2A1AF";
                const tag = STATUT_TAG[p.statut];
                return (
                  <tr key={p.id}
                    style={{ borderBottom: "1px solid #F3F3F5", cursor: "pointer", transition: "background 120ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#FBFBFB")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                    onClick={() => window.location.href = `/pipeline/${p.id}`}
                  >
                    <td style={TD_LEFT}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.copro.nom}
                      </div>
                    </td>
                    <td style={TD_LEFT}>
                      <span style={{ fontSize: 13, color: "#656576" }}>
                        {p.copro.gestionnaireEmail ? gestionnaireLabel(p.copro.gestionnaireEmail, p.copro.gestionnaireNom) : "—"}
                      </span>
                    </td>
                    <td style={TD}>
                      {tag && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          height: 22, padding: "0 8px", borderRadius: 11, fontSize: 11, fontWeight: 500,
                          background: TAG_BG[tag.variant], color: TAG_FG[tag.variant], whiteSpace: "nowrap",
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "currentColor", opacity: 0.9 }} />
                          {tag.label}
                        </span>
                      )}
                    </td>
                    <td style={TD_RIGHT}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 13, color: "#656576", fontVariantNumeric: "tabular-nums" }}>
                          {p.copro.dateEcheance
                            ? new Date(p.copro.dateEcheance).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
                            : <span style={{ color: "#C0C0C9" }}>—</span>}
                        </span>
                        {days !== null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: urgColor, fontVariantNumeric: "tabular-nums" }}>
                            {days < 0 ? `+${Math.abs(days)} j` : `J-${days}`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Espace de défilement : permet de remonter la dernière partie en haut de
          l'écran pour la voir seule (comme les autres parties). */}
      <div aria-hidden style={{ height: "70vh" }} />
    </div>
  );
}
