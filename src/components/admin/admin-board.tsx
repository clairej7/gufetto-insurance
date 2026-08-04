"use client";

import { useState } from "react";
import { getDaysUntilEcheance, categoriseDossier } from "@/lib/pipeline";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { gestionnaireLabel } from "@/lib/gestionnaire";
import { EvolutionChart } from "./evolution-chart";

type Pipeline = {
  id: string;
  statut: string;
  nouveauPrimeTTC: number | null;
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
  // Email gestionnaire de chaque dossier perdu (abandonné/refusé/non assurable),
  // exclus du dataset `pipelines` actif-only mais comptés dans la barre "Perdus".
  lostGestionnaires: (string | null)[];
}


const STAGE_COLS: { statut: string; label: string; shortLabel: string; bg: string; fg: string; bar: string }[] = [
  { statut: "identifie",          label: "Identifié",        shortLabel: "Identifié",   bg: "#F7F7F8", fg: "#656576", bar: "#D4D4DC" },
  { statut: "odr_en_cours",       label: "ODR en cours",     shortLabel: "ODR",         bg: "#FFF7EB", fg: "#955804", bar: "#F5C55A" },
  { statut: "rs_en_cours",        label: "RS en cours",      shortLabel: "RS",          bg: "#F5F5FF", fg: "#4E49FC", bar: "#B8B5FD" },
  { statut: "devis_demandes",     label: "Devis demandés",   shortLabel: "Devis dem.",  bg: "#F5F5FF", fg: "#4E49FC", bar: "#9B97FC" },
  { statut: "devis_recus",        label: "Devis reçus",      shortLabel: "Devis reçus", bg: "#EBEBFF", fg: "#3C38C7", bar: "#7C79F8" },
  { statut: "envoye_cs",          label: "Validé CS",        shortLabel: "Validé CS",   bg: "#FFF7EB", fg: "#955804", bar: "#F5A623" },
  { statut: "contrat_signe",      label: "Contrat signé",    shortLabel: "Signé",       bg: "#EFFBF2", fg: "#13762C", bar: "#34C759" },
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
  identifie:      { label: "Non démarré",    variant: "neutral" },
  odr_en_cours:   { label: "ODR en cours",   variant: "warning" },
  rs_en_cours:    { label: "RS en cours",    variant: "primary" },
  devis_demandes: { label: "Devis demandés", variant: "primary" },
  devis_recus:    { label: "Devis partagés", variant: "primary" },
  envoye_cs:      { label: "Devis validé",   variant: "warning" },
  contrat_signe:  { label: "Contrat signé",  variant: "success-filled" },
  termine:        { label: "Clôturé",        variant: "success" },
  abandonne:      { label: "Abandonné",      variant: "error" },
  refuse:         { label: "Refus client",   variant: "error" },
  non_assurable:  { label: "Non assurable",  variant: "error" },
};

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, Menlo, Consolas, monospace";

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

type KpiFilter = "actifs" | "urgents" | "gagnes" | null;

export function AdminBoard({ pipelines, gestionnaires, events, lostGestionnaires }: AdminBoardProps) {
  const [selectedGestionnaires, setSelectedGestionnaires] = useState<string[]>([]);
  const [activeKpi, setActiveKpi] = useState<KpiFilter>(null);

  // Libellé d'affichage par email (nom Omni si présent, sinon dérivation).
  const gestioNomByEmail = new Map<string, string | null>();
  for (const p of pipelines) {
    if (p.copro.gestionnaireEmail) gestioNomByEmail.set(p.copro.gestionnaireEmail, p.copro.gestionnaireNom);
  }

  const fp = selectedGestionnaires.length > 0
    ? pipelines.filter(p => selectedGestionnaires.includes(p.copro.gestionnaireEmail ?? ""))
    : pipelines;

  // Dossiers perdus : hors dataset `pipelines` (actif-only), comptés à part pour
  // la barre "Perdus". On respecte le filtre gestionnaire courant.
  const lostCount = selectedGestionnaires.length > 0
    ? lostGestionnaires.filter(e => selectedGestionnaires.includes(e ?? "")).length
    : lostGestionnaires.length;

  function toggleKpi(k: KpiFilter) { setActiveKpi(prev => prev === k ? null : k); }

  // Classement central : un dossier clos (dont clients MRI hors Wakam) n'est ni actif ni urgent.
  const bucketOf = (p: Pipeline) => categoriseDossier({
    statut: p.statut,
    dateEcheance: p.copro.dateEcheance,
    clientMriStatut: p.copro.clientMriStatut,
    assureurActuel: p.copro.assureurActuel,
  });
  // ODR inclus : dossier en cours de travail → compté dans "actifs" (cohérent avec
  // la page Pipeline ; évite que le compteur chute quand on aiguille en ODR).
  const isActif = (p: Pipeline) => { const b = bucketOf(p); return b === "urgent" || b === "autre" || b === "odr"; };

  // "Deals gagnés" = clos (clients MRI hors Wakam inclus) + contrat signé en cours.
  const wonPipelines     = fp.filter(p => bucketOf(p) === "clos" || p.statut === "contrat_signe");
  const urgentPipelines  = fp.filter(p => {
    if (!isActif(p)) return false;
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    return d !== null && d <= 60;
  });
  const activePipelines  = fp.filter(isActif);
  const tauxSignature    = activePipelines.length > 0
    ? Math.round((wonPipelines.length / (activePipelines.length + wonPipelines.length)) * 100)
    : 0;

  const kpiDetail: { label: string; rows: Pipeline[] } | null =
    activeKpi === "actifs"  ? { label: "Dossiers actifs",  rows: activePipelines } :
    activeKpi === "urgents" ? { label: "Urgents < 2 mois", rows: urgentPipelines } :
    activeKpi === "gagnes"  ? { label: "Deals gagnés",     rows: wonPipelines }    : null;

  /* ── Bar chart data ── */
  // Répartition alignée sur les buckets (comme la page Pipeline) : les barres
  // d'étape ne comptent que les dossiers ACTIFS de cette étape ; ODR/Clos/Perdus
  // sont comptés par bucket. Ainsi un client "identifié" tombe dans "Clos", pas
  // dans "Identifié" -> mêmes nombres des deux côtés, plus de dossiers qui
  // "sautent" d'une étape à l'autre entre les deux interfaces.
  const barData = STAGE_COLS.map(col => {
    let count: number;
    if (col.statut === "_perdu") count = lostCount;
    else if (col.statut === "_clos") count = fp.filter(p => bucketOf(p) === "clos").length;
    else if (col.statut === "odr_en_cours") count = fp.filter(p => bucketOf(p) === "odr").length;
    else count = fp.filter(p => p.statut === col.statut && isActif(p)).length;
    return { ...col, count };
  });
  const maxBar = Math.max(...barData.map(b => b.count), 1);
  const CHART_H = 140;

  const totalWon = wonPipelines.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT_SANS }}>

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
        {selectedGestionnaires.length > 0 && (() => {
          const totalDossiers = fp.length + lostCount; // actifs + perdus, comme dans Pipeline
          return (
            <span style={{ fontSize: 12, color: "#656576" }}>
              {totalDossiers} dossier{totalDossiers > 1 ? "s" : ""}
            </span>
          );
        })()}
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {([
          { filter: "actifs"  as KpiFilter, label: "Dossiers actifs",   value: activePipelines.length,                              color: "#26262C",                              numeric: true  },
          { filter: "urgents" as KpiFilter, label: "Urgents < 2 mois",  value: urgentPipelines.length,                              color: urgentPipelines.length > 0 ? "#CA1E12" : "#26262C", numeric: true },
          { filter: "gagnes"  as KpiFilter, label: "Deals gagnés",      value: totalWon,                                            color: totalWon > 0 ? "#13762C" : "#26262C",   numeric: true  },
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

      {/* ── Bar chart : répartition par étape ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Répartition par étape</span>
          <span style={{ fontSize: 12, color: "#A2A1AF", fontFamily: FONT_MONO }}>{activePipelines.length} dossiers actifs</span>
          {tauxSignature > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#13762C" }}>
              Taux de signature : {tauxSignature}%
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: CHART_H + 40 }}>
          {barData.map(bar => {
            const barH = bar.count > 0 ? Math.max(Math.round((bar.count / maxBar) * CHART_H), 6) : 0;
            return (
              <div key={bar.statut} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, height: "100%", justifyContent: "flex-end" }}>
                {/* Count */}
                <span style={{
                  fontSize: bar.count > 0 ? 15 : 12, fontWeight: 700, color: bar.count > 0 ? bar.fg : "#C0C0C9",
                  fontVariantNumeric: "tabular-nums", marginBottom: 4, minHeight: 22, display: "flex", alignItems: "flex-end",
                }}>
                  {bar.count}
                </span>
                {/* Bar */}
                <div style={{
                  width: "100%", height: barH, background: bar.count > 0 ? bar.bar : "#F3F3F5",
                  borderRadius: "4px 4px 0 0", transition: "height 300ms ease",
                  opacity: bar.count > 0 ? 1 : 0.4,
                }} />
                {/* Baseline */}
                <div style={{ width: "100%", height: 1, background: "#E8E8EC" }} />
                {/* Label */}
                <span style={{
                  fontSize: 11, color: "#656576", textAlign: "center", marginTop: 6,
                  lineHeight: "14px", fontWeight: 500, maxWidth: "100%", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {bar.shortLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Évolution semaine par semaine ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Activité par semaine</span>
          <span style={{ fontSize: 12, color: "#A2A1AF", fontFamily: FONT_MONO }}>transitions de statut · 12 dernières semaines</span>
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

    </div>
  );
}
