"use client";

import { useState, useRef, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { PIPELINE_STEPS, getDaysUntilEcheance, getUrgenceBadge, categoriseDossier } from "@/lib/pipeline";
import { X, Search, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { gestionnaireLabel } from "@/lib/gestionnaire";

type PipelineWithCopro = {
  id: string;
  statut: string;
  anneeEcheance: number;
  copro: {
    id: string;
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    courtierActuel: string | null;
    primeActuelle: number | null;
    dateEcheance: Date | null;
    gestionnaireEmail: string | null;
    gestionnaireNom: string | null;
    clientMriStatut: string | null;
    badge: string | null;
  };
  taskCompletions: Array<{ taskId: string; task: { required: boolean; statut: string } }>;
};

type TaskTemplate = {
  id: string;
  statut: string;
  label: string;
  shortLabel: string | null;
  actionType: string | null;
  required: boolean;
  order: number;
};

interface PipelineBoardProps {
  currentUserEmail?: string;
  pipelines: PipelineWithCopro[];
  taskTemplates: TaskTemplate[];
  gestionnaires: string[];
  excludedCoproIds?: string[];
}

// Copros exclues de toute automatisation → badge 🚫. Fourni par PipelineBoard.
const ExcludedCtx = createContext<Set<string>>(new Set());
function Excl({ id }: { id: string }) {
  const set = useContext(ExcludedCtx);
  return set.has(id) ? <span title="Exclu de toute automatisation" style={{ flexShrink: 0 }}>🚫</span> : null;
}

type TagVariant = "primary" | "warning" | "success" | "success-filled" | "error" | "neutral" | "info";

const TAG_STYLES: Record<TagVariant, { bg: string; fg: string }> = {
  primary:          { bg: "#F5F5FF", fg: "#4E49FC" },
  warning:          { bg: "#FFF7EB", fg: "#955804" },
  success:          { bg: "#EFFBF2", fg: "#13762C" },
  "success-filled": { bg: "#13762C", fg: "#ffffff" },
  error:            { bg: "#FFF5F5", fg: "#CA1E12" },
  neutral:          { bg: "#F7F7F8", fg: "#656576" },
  info:             { bg: "#F2F9FD", fg: "#206E92" },
};

function Tag({ children, variant = "neutral" }: { children: React.ReactNode; variant?: TagVariant }) {
  const s = TAG_STYLES[variant];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      height: 22, padding: "0 8px", borderRadius: 11,
      fontSize: 11, fontWeight: 500, lineHeight: "1",
      letterSpacing: "-0.08px",
      backgroundColor: s.bg, color: s.fg,
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "currentColor", opacity: 0.9, flexShrink: 0 }} />
      {children}
    </span>
  );
}

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

const ACTION_VARIANT: Record<string, TagVariant> = {
  email:     "primary",
  document:  "primary",
  signature: "success",
  update:    "info",
  waiting:   "neutral",
  other:     "neutral",
};

function getUrgencyBorderColor(days: number | null): string {
  if (days === null) return "#E8E8EC";
  if (days < 0 || days <= 60) return "#CA1E12";
  if (days <= 120) return "#955804";
  return "#E8E8EC";
}

function getNextAction(pipeline: PipelineWithCopro, taskTemplates: TaskTemplate[]) {
  const completedIds = new Set(pipeline.taskCompletions.map((tc) => tc.taskId));
  const stepTasks = taskTemplates.filter((t) => t.statut === pipeline.statut).sort((a, b) => a.order - b.order);
  const nextTask = stepTasks.find((t) => !completedIds.has(t.id));
  if (nextTask) return { shortLabel: nextTask.shortLabel || nextTask.label, actionType: nextTask.actionType || "other" };
  const step = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
  const idx = PIPELINE_STEPS.indexOf(step!);
  const nextStep = PIPELINE_STEPS[idx + 1];
  return nextStep ? { shortLabel: `→ ${nextStep.label}`, actionType: "other" } : null;
}


const selectStyle: React.CSSProperties = {
  fontSize: 13, height: 32, padding: "0 8px",
  border: "1px solid #E8E8EC", borderRadius: 4,
  background: "#fff", color: "#26262C",
  outline: "none", cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  background: "#FBFBFB",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#656576",
  textAlign: "left",
  padding: "0 16px",
  height: 44,
  borderBottom: "1px solid #E8E8EC",
  whiteSpace: "nowrap",
  userSelect: "none",
};

type SortKey = "nom" | "echeance" | "statut" | "assureur";

function SortIndicator({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return asc
    ? <ChevronUp size={11} style={{ display: "inline", marginLeft: 2, verticalAlign: "middle" }} />
    : <ChevronDown size={11} style={{ display: "inline", marginLeft: 2, verticalAlign: "middle" }} />;
}

function PipelineRow({ pipeline, taskTemplates, cloture = false, odr = false }: {
  pipeline: PipelineWithCopro;
  taskTemplates: TaskTemplate[];
  cloture?: boolean;
  odr?: boolean;
}) {
  const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);
  const borderColor = getUrgencyBorderColor(days);
  const nextAction = getNextAction(pipeline, taskTemplates);
  const statutTag = STATUT_TAG[pipeline.statut];
  const actionVariant: TagVariant = ACTION_VARIANT[nextAction?.actionType ?? "other"] ?? "neutral";
  const isLost = ["abandonne", "refuse", "non_assurable"].includes(pipeline.statut);

  // Couleurs de fond de ligne selon la section : ODR = jaune, clos/perdu = vert clair.
  const rowBg = odr ? "#FFFBEB" : cloture ? "#F7FDF9" : undefined;
  const rowBgHover = odr ? "#FDF3D0" : cloture ? "#EFFBF2" : "#FBFBFB";
  const rowBgLeave = odr ? "#FFFBEB" : cloture ? "#F7FDF9" : "";

  function handleClick() { window.location.href = `/pipeline/${pipeline.id}`; }

  return (
    <tr
      style={{ borderBottom: "1px solid #F3F3F5", cursor: "pointer", background: rowBg }}
      onMouseEnter={(e) => (e.currentTarget.style.background = rowBgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = rowBgLeave)}
      onClick={handleClick}
    >
      {/* Copropriété — left border couleur urgence */}
      <td style={{ padding: "0 16px 0 13px", height: 48, borderLeft: `3px solid ${isLost ? "#CA1E12" : borderColor}`, verticalAlign: "middle", minWidth: 180 }}>
        <div>
          <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: 240 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pipeline.copro.nom}
            </span>
            <Excl id={pipeline.copro.id} />
            {pipeline.copro.badge && (
              <span title={pipeline.copro.badge} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "#7A3E9D", background: "#F3E8FB", border: "1px solid #E3CDF3", borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>
                {pipeline.copro.badge}
              </span>
            )}
            {(pipeline.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
          </span>
          {pipeline.copro.adresse && (
            <span style={{ fontSize: 12, color: "#A2A1AF", display: "block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
              {pipeline.copro.adresse}
            </span>
          )}
        </div>
      </td>

      {/* Statut */}
      <td style={{ padding: "0 16px", height: 48, verticalAlign: "middle" }}>
        {statutTag && <Tag variant={statutTag.variant}>{statutTag.label}</Tag>}
      </td>

      {/* Prochaine action */}
      <td style={{ padding: "0 16px", height: 48, verticalAlign: "middle" }}>
        {nextAction && !isLost && (
          <Tag variant={actionVariant}>{nextAction.shortLabel}</Tag>
        )}
      </td>

      {/* Assureur */}
      <td style={{ padding: "0 16px", height: 48, verticalAlign: "middle" }}>
        {pipeline.copro.assureurActuel
          ? <span style={{ fontSize: 13, color: "#656576" }}>{pipeline.copro.assureurActuel}</span>
          : <span style={{ color: "#A2A1AF" }}>—</span>}
      </td>

      {/* Échéance */}
      <td style={{ padding: "0 16px", height: 48, verticalAlign: "middle", textAlign: "right" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ fontSize: 13, color: "#656576", fontVariantNumeric: "tabular-nums" }}>
            {pipeline.copro.dateEcheance
              ? new Date(pipeline.copro.dateEcheance).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
              : <span style={{ color: "#A2A1AF" }}>—</span>}
          </span>
          {days !== null && (
            <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: borderColor === "#E8E8EC" ? "#A2A1AF" : borderColor }}>
              {days < 0 ? `+${Math.abs(days)} j` : `J-${days}`}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// Filtres persistés en sessionStorage : quand on ouvre un dossier puis qu'on
// revient à la liste, la recherche et les filtres sont conservés.
const FILTERS_STORAGE_KEY = "pipeline-board-filters";

type SavedFilters = {
  sortKey: SortKey;
  sortAsc: boolean;
  view: "liste" | "kanban";
  selectedGestionnaire: string[];
  selectedStatut: string[];
  selectedEcheance: string;
  selectedAssureur: string[];
  selectedCourtier: string[];
  selectedPrime: string;
  search: string;
};

export function PipelineBoard({ pipelines, taskTemplates, gestionnaires, currentUserEmail, excludedCoproIds = [] }: PipelineBoardProps) {
  const excludedSet = new Set(excludedCoproIds);
  const defaultGestionnaire = currentUserEmail && gestionnaires.includes(currentUserEmail) ? [currentUserEmail] : [];
  // Libellé d'affichage par email (nom Omni si présent, sinon dérivation).
  const gestioNomByEmail = new Map<string, string | null>();
  for (const p of pipelines) {
    if (p.copro.gestionnaireEmail) gestioNomByEmail.set(p.copro.gestionnaireEmail, p.copro.gestionnaireNom);
  }
  const [sortKey, setSortKey] = useState<SortKey>("echeance");
  const [sortAsc, setSortAsc] = useState(true);
  const [view, setView] = useState<"liste" | "kanban">("liste");
  const [selectedGestionnaire, setSelectedGestionnaire] = useState<string[]>(defaultGestionnaire);
  const [selectedStatut, setSelectedStatut] = useState<string[]>([]);
  const [selectedEcheance, setSelectedEcheance] = useState("all");
  const [selectedAssureur, setSelectedAssureur] = useState<string[]>([]);
  const [selectedCourtier, setSelectedCourtier] = useState<string[]>([]);
  const [selectedPrime, setSelectedPrime] = useState("all");
  const [search, setSearch] = useState("");
  const filtersLoaded = useRef(false);

  // Restauration au montage (après hydratation, sessionStorage est côté client)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedFilters>;
        if (saved.sortKey) setSortKey(saved.sortKey);
        if (typeof saved.sortAsc === "boolean") setSortAsc(saved.sortAsc);
        if (saved.view) setView(saved.view);
        if (Array.isArray(saved.selectedGestionnaire)) setSelectedGestionnaire(saved.selectedGestionnaire);
        if (Array.isArray(saved.selectedStatut)) setSelectedStatut(saved.selectedStatut);
        if (typeof saved.selectedEcheance === "string") setSelectedEcheance(saved.selectedEcheance);
        if (Array.isArray(saved.selectedAssureur)) setSelectedAssureur(saved.selectedAssureur);
        if (Array.isArray(saved.selectedCourtier)) setSelectedCourtier(saved.selectedCourtier);
        if (typeof saved.selectedPrime === "string") setSelectedPrime(saved.selectedPrime);
        if (typeof saved.search === "string") setSearch(saved.search);
      }
    } catch { /* sessionStorage indisponible ou JSON corrompu : on garde les défauts */ }
    filtersLoaded.current = true;
  }, []);

  // Sauvegarde à chaque changement (pas avant la restauration initiale)
  useEffect(() => {
    if (!filtersLoaded.current) return;
    try {
      const toSave: SavedFilters = { sortKey, sortAsc, view, selectedGestionnaire, selectedStatut, selectedEcheance, selectedAssureur, selectedCourtier, selectedPrime, search };
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* quota ou indisponible : tant pis, pas bloquant */ }
  }, [sortKey, sortAsc, view, selectedGestionnaire, selectedStatut, selectedEcheance, selectedAssureur, selectedCourtier, selectedPrime, search]);

  const assureurs = [...new Set(pipelines.map((p) => p.copro.assureurActuel).filter(Boolean) as string[])].sort();
  const courtiers = [...new Set(pipelines.map((p) => p.copro.courtierActuel).filter(Boolean) as string[])].sort();
  const hasActiveFilters = selectedGestionnaire.length > 0 || selectedStatut.length > 0 || selectedEcheance !== "all" || selectedAssureur.length > 0 || selectedCourtier.length > 0 || selectedPrime !== "all" || search !== "";

  function resetFilters() {
    setSelectedGestionnaire([]); setSelectedStatut([]);
    setSelectedEcheance("all"); setSelectedAssureur([]); setSelectedCourtier([]); setSelectedPrime("all"); setSearch("");
  }

  const filtered = pipelines.filter((p) => {
    if (selectedGestionnaire.length > 0 && !selectedGestionnaire.includes(p.copro.gestionnaireEmail ?? "")) return false;
    if (selectedStatut.length > 0 && !selectedStatut.includes(p.statut)) return false;
    if (selectedAssureur.length > 0 && !selectedAssureur.includes(p.copro.assureurActuel ?? "")) return false;
    if (selectedCourtier.length > 0 && !selectedCourtier.includes(p.copro.courtierActuel ?? "")) return false;
    if (search && !p.copro.nom.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedEcheance !== "all") {
      const days = getDaysUntilEcheance(p.copro.dateEcheance);
      if (selectedEcheance === "lt2" && (days === null || days > 60)) return false;
      if (selectedEcheance === "bt2_6" && (days === null || days <= 60 || days > 180)) return false;
      if (selectedEcheance === "gt6" && (days === null || days <= 180)) return false;
    }
    if (selectedPrime !== "all") {
      const prime = p.copro.primeActuelle;
      if (selectedPrime === "lt10" && !(prime != null && prime <= 10000)) return false;
      if (selectedPrime === "gt10" && !(prime != null && prime > 10000)) return false;
    }
    return true;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = 0, vb: string | number = 0;
    if (sortKey === "echeance") {
      va = a.copro.dateEcheance ? new Date(a.copro.dateEcheance).getTime() : Infinity;
      vb = b.copro.dateEcheance ? new Date(b.copro.dateEcheance).getTime() : Infinity;
    } else if (sortKey === "nom") {
      va = a.copro.nom.toLowerCase(); vb = b.copro.nom.toLowerCase();
    } else if (sortKey === "statut") {
      va = a.statut; vb = b.statut;
    } else if (sortKey === "assureur") {
      va = a.copro.assureurActuel?.toLowerCase() ?? ""; vb = b.copro.assureurActuel?.toLowerCase() ?? "";
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  // Classement en sections via le classifieur central (un bucket par dossier).
  const bucketOf = (p: PipelineWithCopro) => categoriseDossier({
    statut: p.statut,
    dateEcheance: p.copro.dateEcheance,
    clientMriStatut: p.copro.clientMriStatut,
    assureurActuel: p.copro.assureurActuel,
  });

  // KPIs : actifs = urgent + autres + ODR (l'ODR est un dossier en cours de
  //   travail → inclus pour que le compteur ne chute pas quand on aiguille en ODR).
  //   Exclut seulement clos (dont clients MRI) et perdus.
  // "contrat_signe" = deal gagné (compté dans "gagnés") → exclu des "actifs"
  // même si son bucket est urgent/autre, sinon il serait compté deux fois.
  const actifsCount = filtered.filter(p => { const b = bucketOf(p); return (b === "urgent" || b === "autre" || b === "odr" || b === "odr_envoye") && p.statut !== "contrat_signe"; }).length;
  // « Échéance < 6 mois » : TOUS les dossiers à traiter dont l'échéance est ≤ 180 j,
  // ODR INCLUS (un ODR se traite en parallèle → il reste "à traiter"). On garde le
  // périmètre "actifs" (exclut clos / perdus / signés, qui ne sont plus à traiter).
  // Sans l'inclusion ODR, aiguiller un dossier bientôt échu vers l'ODR le faisait
  // sortir du compteur (bucket odr testé avant urgent) → le chiffre chutait pendant
  // le batch alors que la date d'échéance n'avait pas bougé.
  const echeanceProche = filtered.filter(p => {
    const b = bucketOf(p);
    const actif = (b === "urgent" || b === "autre" || b === "odr" || b === "odr_envoye") && p.statut !== "contrat_signe";
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    return actif && d !== null && d <= 180;
  }).length;
  // "Deals gagnés" : clos (clients MRI hors Wakam inclus) + contrat signé + ODR accepté.
  const dealsGagnes = filtered.filter(p => bucketOf(p) === "clos" || p.statut === "contrat_signe" || p.statut === "odr_accepte").length;

  const urgents      = sorted.filter(p => bucketOf(p) === "urgent");
  const autres       = sorted.filter(p => bucketOf(p) === "autre");
  const odrs         = sorted.filter(p => bucketOf(p) === "odr");
  const odrEnvoyes   = sorted.filter(p => bucketOf(p) === "odr_envoye");
  const odrAcceptes  = sorted.filter(p => bucketOf(p) === "odr_accepte");
  const clos         = sorted.filter(p => bucketOf(p) === "clos");
  const perdus       = sorted.filter(p => bucketOf(p) === "perdu");

  // Toolbar shared between views
  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #E8E8EC", flexWrap: "wrap", background: "#fff" }}>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 2, background: "#F7F7F8", borderRadius: 6, padding: 2 }}>
        {(["liste", "kanban"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none", transition: "all 120ms",
              background: view === v ? "#fff" : "transparent",
              color: view === v ? "#26262C" : "#656576",
              boxShadow: view === v ? "0 1px 2px rgba(13,22,63,.06)" : "none",
            }}
          >
            {v === "liste" ? "Liste" : "Par étape"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Filters */}
      <MultiSelectFilter
        placeholder="Gestionnaire"
        options={gestionnaires}
        value={selectedGestionnaire}
        onChange={setSelectedGestionnaire}
        renderOption={(e) => gestionnaireLabel(e, gestioNomByEmail.get(e))}
        width={140}
      />
      <MultiSelectFilter
        placeholder="Étapes"
        options={["identifie", "odr_en_cours", "odr_envoye", "rs_en_cours", "devis_demandes", "devis_recus", "envoye_cs", "odr_accepte", "odr_en_vigueur", "contrat_signe"]}
        value={selectedStatut}
        onChange={setSelectedStatut}
        renderOption={(s) => STATUT_TAG[s]?.label ?? s}
        width={140}
      />
      <select value={selectedEcheance} onChange={(e) => setSelectedEcheance(e.target.value)} style={{ ...selectStyle, width: 140 }}>
        <option value="all">Échéances</option>
        <option value="lt2">{"< 2 mois"}</option>
        <option value="bt2_6">2 à 6 mois</option>
        <option value="gt6">{"> 6 mois"}</option>
      </select>
      <MultiSelectFilter
        placeholder="Assureur"
        options={assureurs}
        value={selectedAssureur}
        onChange={setSelectedAssureur}
        width={140}
      />
      <MultiSelectFilter
        placeholder="Courtier"
        options={courtiers}
        value={selectedCourtier}
        onChange={setSelectedCourtier}
        width={140}
      />
      <select value={selectedPrime} onChange={(e) => setSelectedPrime(e.target.value)} style={{ ...selectStyle, width: 140 }}>
        <option value="all">Primes</option>
        <option value="lt10">{"Prime < 10 k€"}</option>
        <option value="gt10">{"Prime > 10 k€ 👑"}</option>
      </select>

      {/* Search */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", border: "1px solid #E8E8EC", borderRadius: 4, background: "#fff", minWidth: 180 }}>
        <Search size={13} color="#A2A1AF" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          style={{ fontSize: 13, background: "transparent", outline: "none", border: "none", flex: 1, color: "#26262C", minWidth: 0 }}
        />
        {search && (
          <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#A2A1AF", display: "flex" }}>
            <X size={12} />
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <button onClick={resetFilters} style={{ fontSize: 12, color: "#A2A1AF", textDecoration: "underline", border: "none", background: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
          Réinitialiser
        </button>
      )}
    </div>
  );

  // Séparateur pointillé vertical entre les 4 zones du kanban.
  const dotSepStyle: React.CSSProperties = { alignSelf: "stretch", borderLeft: "1px dashed #C0C0C9", flexShrink: 0, margin: "0 2px" };

  // Rendu d'une colonne d'étape "active" (funnel + Signé). Extrait pour pouvoir
  // le réutiliser dans l'ordre voulu (Signé va dans la zone 3 avec Clos).
  const renderStepColumn = (step: (typeof PIPELINE_STEPS)[number]) => {
    const items = filtered.filter((p) => {
      if (p.statut !== step.statut) return false;
      const b = bucketOf(p);
      return b === "urgent" || b === "autre";
    });
    return (
      <div key={step.statut} style={{ width: 264, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#656576" }}>
            {step.shortLabel}
          </span>
          {items.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 6px", background: "#E8E8EC", borderRadius: 10, color: "#656576", fontVariantNumeric: "tabular-nums" }}>
              {items.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((p) => {
            const days = getDaysUntilEcheance(p.copro.dateEcheance);
            const borderColor = getUrgencyBorderColor(days);
            const nextAction = getNextAction(p, taskTemplates);
            // "Signé" = deal gagné : fond vert CLAIR (plus clair que les clos).
            const won = step.statut === "contrat_signe";
            return (
              <Link key={p.id} href={`/pipeline/${p.id}`} style={{ textDecoration: "none" }}>
                <div style={{
                  background: won ? "#F1FCF5" : "#fff", borderRadius: 6, padding: "10px 12px",
                  border: won ? "1px solid #CDEFD9" : "1px solid #E8E8EC",
                  borderLeft: won ? "3px solid #52C77E" : `3px solid ${borderColor}`,
                  cursor: "pointer", transition: "box-shadow 120ms",
                  minHeight: 76, display: "flex", flexDirection: "column",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,22,63,.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Excl id={p.copro.id} />{(p.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.copro.nom}</div>
                  </div>
                  <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ minWidth: 0, overflow: "hidden" }}>
                      {nextAction && <Tag variant={ACTION_VARIANT[nextAction.actionType] ?? "neutral"}>{nextAction.shortLabel}</Tag>}
                    </span>
                    {days !== null && (
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", color: borderColor === "#E8E8EC" ? "#A2A1AF" : borderColor }}>
                        {days < 0 ? `+${Math.abs(days)} j` : `J-${days}`}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
          {items.length === 0 && (
            <div style={{ borderRadius: 6, padding: 12, textAlign: "center", fontSize: 12, border: "1px dashed #E8E8EC", background: "#F7F7F8", color: "#A2A1AF" }}>
              Vide
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <ExcludedCtx.Provider value={excludedSet}>
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Dossiers actifs", value: actifsCount, color: undefined },
          { label: "Échéance < 6 mois", value: echeanceProche, color: echeanceProche > 0 ? "#CA1E12" : undefined },
          { label: "Deals gagnés", value: dealsGagnes, color: dealsGagnes > 0 ? "#13762C" : undefined },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "16px 20px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", color: color ?? "#26262C", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 13, color: "#656576", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table / Kanban */}
      <div style={{ border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        {toolbar}

        {view === "liste" ? (
          filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "#A2A1AF" }}>
              <div style={{ fontSize: 13 }}>
                {selectedGestionnaire.length === 1 && pipelines.filter(p => p.copro.gestionnaireEmail === selectedGestionnaire[0]).length === 0
                  ? "Aucun dossier assigné à ce gestionnaire."
                  : "Aucun dossier ne correspond aux filtres."}
              </div>
              {hasActiveFilters && (
                <button onClick={resetFilters} style={{ marginTop: 8, fontSize: 12, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Voir tous les dossiers
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Title row inside table */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 8px", borderBottom: "1px solid #F3F3F5" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#26262C" }}>Mes dossiers</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#656576", padding: "2px 7px", background: "#F7F7F8", borderRadius: 10, fontVariantNumeric: "tabular-nums" }}>
                  {urgents.length + autres.length}
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th
                      onClick={() => toggleSort("nom")}
                      style={{ ...thStyle, cursor: "pointer", paddingLeft: 13 }}
                    >
                      Copropriété <SortIndicator active={sortKey === "nom"} asc={sortAsc} />
                    </th>
                    <th onClick={() => toggleSort("statut")} style={{ ...thStyle, cursor: "pointer" }}>
                      Statut <SortIndicator active={sortKey === "statut"} asc={sortAsc} />
                    </th>
                    <th style={thStyle}>Prochaine action</th>
                    <th onClick={() => toggleSort("assureur")} style={{ ...thStyle, cursor: "pointer" }}>
                      Assureur <SortIndicator active={sortKey === "assureur"} asc={sortAsc} />
                    </th>
                    <th onClick={() => toggleSort("echeance")} style={{ ...thStyle, textAlign: "right", cursor: "pointer" }}>
                      Échéance <SortIndicator active={sortKey === "echeance"} asc={sortAsc} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {urgents.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "8px 16px 6px", background: "#FFF9F5", borderBottom: "1px solid #F3F3F5" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#955804" }}>
                            Urgents — échéance &lt; 6 mois — {urgents.length}
                          </span>
                        </td>
                      </tr>
                      {urgents.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} />
                      ))}
                    </>
                  )}
                  {autres.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "8px 16px 6px", background: "#FBFBFB", borderTop: urgents.length > 0 ? "2px solid #E8E8EC" : undefined, borderBottom: "1px solid #F3F3F5" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#656576" }}>
                            Autres dossiers — {autres.length}
                          </span>
                        </td>
                      </tr>
                      {autres.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} />
                      ))}
                    </>
                  )}
                  {odrs.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "10px 16px 8px", background: "#FFFBEB", borderTop: "2px solid #E8E8EC" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#955804" }}>
                            Dossiers en cours d&apos;ODR — {odrs.length}
                          </span>
                        </td>
                      </tr>
                      {odrs.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} odr />
                      ))}
                    </>
                  )}
                  {odrEnvoyes.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "10px 16px 8px", background: "#FFF3E3", borderTop: "2px solid #E8E8EC" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8A4B04" }}>
                            ODR envoyées — en attente de réponse — {odrEnvoyes.length}
                          </span>
                        </td>
                      </tr>
                      {odrEnvoyes.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} odr />
                      ))}
                    </>
                  )}
                  {odrAcceptes.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "10px 16px 8px", background: "#EAFBEF", borderTop: "2px solid #E8E8EC" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#13762C" }}>
                            ODR acceptés — deals gagnés — {odrAcceptes.length}
                          </span>
                        </td>
                      </tr>
                      {odrAcceptes.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} cloture />
                      ))}
                    </>
                  )}
                  {clos.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "10px 16px 8px", background: "#F7FDF9", borderTop: "2px solid #E8E8EC" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#13762C" }}>
                            Dossiers clos — {clos.length}
                          </span>
                        </td>
                      </tr>
                      {clos.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} cloture />
                      ))}
                    </>
                  )}
                  {perdus.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} style={{ padding: "10px 16px 8px", background: "#FFF5F5", borderTop: clos.length > 0 ? "2px solid #E8E8EC" : "2px solid #E8E8EC" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#CA1E12" }}>
                            Dossiers perdus — {perdus.length}
                          </span>
                        </td>
                      </tr>
                      {perdus.map((p) => (
                        <PipelineRow key={p.id} pipeline={p} taskTemplates={taskTemplates} cloture />
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </>
          )
        ) : (
          /* Kanban — 4 zones (même ordre que le Tracking) */
          <div style={{ display: "flex", gap: 16, overflowX: "auto", padding: 16 }}>
            {/* Zone 1 : funnel actif (Signé exclu, il va en zone 3 avec Clos) */}
            {PIPELINE_STEPS.filter((s) => s.statut !== "termine" && s.statut !== "contrat_signe").map(renderStepColumn)}

            {(() => {
              const odrKanban = filtered.filter(p => bucketOf(p) === "odr");
              const odrEnvoyeKanban = filtered.filter(p => bucketOf(p) === "odr_envoye");
              const odrAccepteKanban = filtered.filter(p => bucketOf(p) === "odr_accepte");
              const closKanban = filtered.filter(p => bucketOf(p) === "clos");
              const perdusKanban = filtered.filter(p => bucketOf(p) === "perdu");
              const signeStep = PIPELINE_STEPS.find(s => s.statut === "contrat_signe")!;
              return (
                <>
                  {/* Zone 2 : ODR */}
                  <div style={dotSepStyle} />
                  <div style={{ width: 264, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#955804" }}>
                        ODR en cours
                      </span>
                      {odrKanban.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 6px", background: "#FFF7EB", borderRadius: 10, color: "#955804", fontVariantNumeric: "tabular-nums" }}>
                          {odrKanban.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {odrKanban.map((p) => (
                        <Link key={p.id} href={`/pipeline/${p.id}`} style={{ textDecoration: "none" }}>
                          <div style={{
                            background: "#FFFBEB", borderRadius: 6, padding: "10px 12px", minHeight: 76,
                            border: "1px solid #F5D98A", borderLeft: "3px solid #F5A623",
                            cursor: "pointer", transition: "box-shadow 120ms",
                          }}
                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,22,63,.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Excl id={p.copro.id} />{(p.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.copro.nom}
                              </div>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag variant="warning">ODR en cours</Tag>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {odrKanban.length === 0 && (
                        <div style={{ borderRadius: 6, padding: 12, textAlign: "center", fontSize: 12, border: "1px dashed #F5D98A", background: "#FFFBEB", color: "#A2A1AF" }}>
                          Vide
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Zone 2 (suite) : ODR envoyées — toujours actif */}
                  <div style={{ width: 264, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#8A4B04" }}>
                        ODR envoyées
                      </span>
                      {odrEnvoyeKanban.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 6px", background: "#FFF1DC", borderRadius: 10, color: "#8A4B04", fontVariantNumeric: "tabular-nums" }}>
                          {odrEnvoyeKanban.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {odrEnvoyeKanban.map((p) => (
                        <Link key={p.id} href={`/pipeline/${p.id}`} style={{ textDecoration: "none" }}>
                          <div style={{
                            background: "#FFF6EA", borderRadius: 6, padding: "10px 12px", minHeight: 76,
                            border: "1px solid #EBB878", borderLeft: "3px solid #E8943A",
                            cursor: "pointer", transition: "box-shadow 120ms",
                          }}
                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,22,63,.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Excl id={p.copro.id} />{(p.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.copro.nom}
                              </div>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag variant="warning">ODR envoyée</Tag>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {odrEnvoyeKanban.length === 0 && (
                        <div style={{ borderRadius: 6, padding: 12, textAlign: "center", fontSize: 12, border: "1px dashed #EBB878", background: "#FFF6EA", color: "#A2A1AF" }}>
                          Vide
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Zone 3 : Gagnés — ODR acceptés + Signé + Clos */}
                  <div style={dotSepStyle} />
                  <div style={{ width: 264, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#13762C" }}>
                        ODR acceptés
                      </span>
                      {odrAccepteKanban.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 6px", background: "#EAFBEF", borderRadius: 10, color: "#13762C", fontVariantNumeric: "tabular-nums" }}>
                          {odrAccepteKanban.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {odrAccepteKanban.map((p) => (
                        <Link key={p.id} href={`/pipeline/${p.id}`} style={{ textDecoration: "none" }}>
                          <div style={{
                            background: "#F1FCF5", borderRadius: 6, padding: "10px 12px", minHeight: 76,
                            border: "1px solid #CDEFD9", borderLeft: "3px solid #52C77E",
                            cursor: "pointer", transition: "box-shadow 120ms",
                          }}
                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,22,63,.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Excl id={p.copro.id} />{(p.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.copro.nom}
                              </div>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag variant="success">ODR accepté</Tag>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {odrAccepteKanban.length === 0 && (
                        <div style={{ borderRadius: 6, padding: 12, textAlign: "center", fontSize: 12, border: "1px dashed #A6E7BC", background: "#EAFBEF", color: "#A2A1AF" }}>
                          Vide
                        </div>
                      )}
                    </div>
                  </div>
                  {renderStepColumn(signeStep)}
                  <div style={{ width: 264, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#13762C" }}>
                        Clos
                      </span>
                      {closKanban.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 6px", background: "#EFFBF2", borderRadius: 10, color: "#13762C", fontVariantNumeric: "tabular-nums" }}>
                          {closKanban.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {closKanban.map((p) => (
                        <Link key={p.id} href={`/pipeline/${p.id}`} style={{ textDecoration: "none" }}>
                          <div style={{
                            background: "#F7FDF9", borderRadius: 6, padding: "10px 12px", minHeight: 76,
                            border: "1px solid #BBF1C8", borderLeft: "3px solid #13762C",
                            cursor: "pointer", transition: "box-shadow 120ms",
                          }}
                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,22,63,.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Excl id={p.copro.id} />{(p.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.copro.nom}
                              </div>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag variant="success">Clos</Tag>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {closKanban.length === 0 && (
                        <div style={{ borderRadius: 6, padding: 12, textAlign: "center", fontSize: 12, border: "1px dashed #BBF1C8", background: "#F7FDF9", color: "#A2A1AF" }}>
                          Vide
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Zone 4 : Perdus */}
                  <div style={dotSepStyle} />
                  <div style={{ width: 264, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#CA1E12" }}>
                        Perdus
                      </span>
                      {perdusKanban.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 6px", background: "#FFF5F5", borderRadius: 10, color: "#CA1E12", fontVariantNumeric: "tabular-nums" }}>
                          {perdusKanban.length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {perdusKanban.map((p) => (
                        <Link key={p.id} href={`/pipeline/${p.id}`} style={{ textDecoration: "none" }}>
                          <div style={{
                            background: "#FFF5F5", borderRadius: 6, padding: "10px 12px", minHeight: 76,
                            border: "1px solid #F1CCCC", borderLeft: "3px solid #CA1E12",
                            cursor: "pointer", transition: "box-shadow 120ms",
                          }}
                            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(13,22,63,.08)")}
                            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Excl id={p.copro.id} />{(p.copro.primeActuelle ?? 0) > 10000 && <span title="Prime > 10 k€" style={{ flexShrink: 0 }}>👑</span>}
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.copro.nom}
                              </div>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <Tag variant="error">Perdu</Tag>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {perdusKanban.length === 0 && (
                        <div style={{ borderRadius: 6, padding: 12, textAlign: "center", fontSize: 12, border: "1px dashed #F1CCCC", background: "#FFF5F5", color: "#A2A1AF" }}>
                          Vide
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
    </ExcludedCtx.Provider>
  );
}
