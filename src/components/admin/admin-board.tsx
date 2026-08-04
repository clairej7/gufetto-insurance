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
  // Dossiers perdus (abandonné/refusé/non assurable) : dataset séparé, passé EN
  // ENTIER pour la carte "Perdus" cliquable et le filtre échéance.
  lostPipelines: Pipeline[];
}


const STAGE_COLS: { statut: string; label: string; shortLabel: string; bg: string; fg: string; bar: string }[] = [
  { statut: "identifie",          label: "Identification",      shortLabel: "Identification",       bg: "#F7F7F8", fg: "#656576", bar: "#D4D4DC" },
  { statut: "odr_en_cours",       label: "ODR en cours",        shortLabel: "ODR en cours",         bg: "#FFF7EB", fg: "#955804", bar: "#F5C55A" },
  { statut: "rs_en_cours",        label: "Récupération du RS",  shortLabel: "Récupération du RS",   bg: "#F5F5FF", fg: "#4E49FC", bar: "#B8B5FD" },
  { statut: "devis_demandes",     label: "Demande des devis",   shortLabel: "Demande des devis",    bg: "#F5F5FF", fg: "#4E49FC", bar: "#9B97FC" },
  { statut: "devis_recus",        label: "Comparaison des devis", shortLabel: "Comparaison des devis", bg: "#EBEBFF", fg: "#3C38C7", bar: "#7C79F8" },
  { statut: "envoye_cs",          label: "Validation du CS",    shortLabel: "Validation du CS",     bg: "#FFF7EB", fg: "#955804", bar: "#F5A623" },
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

export function AdminBoard({ pipelines, gestionnaires, events, lostPipelines }: AdminBoardProps) {
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
  const isActif = (p: Pipeline) => { const b = bucketOf(p); return (b === "urgent" || b === "autre" || b === "odr") && p.statut !== "contrat_signe"; };

  // "Deals gagnés" = clos (clients MRI hors Wakam inclus) + contrat signé.
  const wonPipelines     = fp.filter(p => bucketOf(p) === "clos" || p.statut === "contrat_signe");
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
  const barData = STAGE_COLS.map(col => {
    let count: number;
    if (col.statut === "_perdu") count = lostCount;
    else if (col.statut === "_clos") count = fp.filter(p => bucketOf(p) === "clos").length;
    else if (col.statut === "odr_en_cours") count = fp.filter(p => bucketOf(p) === "odr").length;
    // Signé = deal gagné à part (hors "actifs", hors "clos") ; compté par statut.
    else if (col.statut === "contrat_signe") count = fp.filter(p => p.statut === "contrat_signe" && bucketOf(p) !== "clos").length;
    else count = fp.filter(p => p.statut === col.statut && isActif(p)).length;
    return { ...col, count };
  });
  const maxBar = Math.max(...barData.map(b => b.count), 1);
  const CHART_H = 140;

  // Regroupement visuel du graphe en 4 zones (contenu identique, juste l'affichage).
  const byStatut = Object.fromEntries(barData.map(b => [b.statut, b] as const));
  const grp = (statuts: string[]) => statuts.map(s => byStatut[s]).filter(Boolean);
  const G_FUNNEL = grp(["identifie", "rs_en_cours", "devis_demandes", "devis_recus", "envoye_cs"]);
  const G_ODR    = grp(["odr_en_cours"]);
  const G_GAGNE  = grp(["contrat_signe", "_clos"]);
  const G_PERDU  = grp(["_perdu"]);

  const renderBar = (bar: (typeof barData)[number]) => {
    const barH = bar.count > 0 ? Math.max(Math.round((bar.count / maxBar) * CHART_H), 6) : 0;
    return (
      <div key={bar.statut} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, height: "100%", justifyContent: "flex-end" }}>
        <span style={{ fontSize: bar.count > 0 ? 15 : 12, fontWeight: 700, color: bar.count > 0 ? bar.fg : "#C0C0C9", fontVariantNumeric: "tabular-nums", marginBottom: 4, minHeight: 22, display: "flex", alignItems: "flex-end" }}>
          {bar.count}
        </span>
        <div style={{ width: "100%", height: barH, background: bar.count > 0 ? bar.bar : "#F3F3F5", borderRadius: "4px 4px 0 0", transition: "height 300ms ease", opacity: bar.count > 0 ? 1 : 0.4 }} />
        <div style={{ width: "100%", height: 1, background: "#E8E8EC" }} />
        <span style={{ fontSize: 11, color: "#656576", textAlign: "center", marginTop: 6, lineHeight: "13px", fontWeight: 500, maxWidth: "100%", whiteSpace: "normal", wordBreak: "break-word" }}>
          {bar.shortLabel}
        </span>
      </div>
    );
  };

  const dividerFull: React.CSSProperties = { alignSelf: "stretch", borderLeft: "1px dashed #C0C0C9", margin: "0 10px" };
  const dividerBars: React.CSSProperties = { alignSelf: "stretch", borderLeft: "1px dashed #DADAE0", margin: "0 6px" };
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontFamily: FONT_MONO, fontWeight: 600, textAlign: "center", marginBottom: 14, whiteSpace: "nowrap" };
  const barsRow: React.CSSProperties = { display: "flex", alignItems: "flex-end", gap: 8, height: CHART_H + 40 };

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

      {/* ── Bar chart : répartition par étape ── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ marginBottom: 18 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Répartition par étape</span>
        </div>

        {/* 4 zones séparées par des pointillés, chacune avec son titre. */}
        <div style={{ display: "flex", alignItems: "stretch" }}>

          {/* Zones 1 + 2 : Actifs (funnel + ODR) */}
          <div style={{ flex: 6, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#656576" }}>{activePipelines.length} dossiers actifs</div>
            <div style={barsRow}>
              {G_FUNNEL.map(renderBar)}
              <div style={dividerBars} />
              {G_ODR.map(renderBar)}
            </div>
          </div>

          <div style={dividerFull} />

          {/* Zone 3 : Gagnés (signé + clos) */}
          <div style={{ flex: 2, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#13762C" }}>Deals gagnés · signature {tauxSignature}%</div>
            <div style={barsRow}>
              {G_GAGNE.map(renderBar)}
            </div>
          </div>

          <div style={dividerFull} />

          {/* Zone 4 : Perdus */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ ...sectionTitle, color: "#CA1E12" }}>Deals perdus · perte {tauxPerte}%</div>
            <div style={barsRow}>
              {G_PERDU.map(renderBar)}
            </div>
          </div>

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

    </div>
  );
}
