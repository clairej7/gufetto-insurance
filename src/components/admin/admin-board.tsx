"use client";

import { useState } from "react";
import { getDaysUntilEcheance } from "@/lib/pipeline";

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
  };
  taskCompletions: Array<{ taskId: string; task: { required: boolean; statut: string } }>;
};

interface AdminBoardProps {
  pipelines: Pipeline[];
  taskTemplates: Array<{ id: string; statut: string; required: boolean }>;
  gestionnaires: string[];
}

const LOST_STATUTS = ["abandonne", "refuse", "non_assurable"];

const COLS: { statut: string; label: string; bg: string; fg: string }[] = [
  { statut: "identifie",      label: "Identifié",    bg: "#F7F7F8", fg: "#656576" },
  { statut: "rs_en_cours",    label: "RS",           bg: "#F5F5FF", fg: "#4E49FC" },
  { statut: "devis_demandes", label: "Devis dem.",   bg: "#F5F5FF", fg: "#4E49FC" },
  { statut: "devis_recus",    label: "Devis reçus",  bg: "#EBEBFF", fg: "#3C38C7" },
  { statut: "envoye_cs",      label: "Validé CS",    bg: "#FFF7EB", fg: "#955804" },
  { statut: "contrat_signe",  label: "Signé",        bg: "#EFFBF2", fg: "#13762C" },
  { statut: "termine",        label: "Clôturé",      bg: "#CFF2D8", fg: "#0E5D22" },
];

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

function formatGestionnaire(email: string): string {
  const prenom = email.split(".")[0];
  const nom    = email.split(".")[1]?.split("@")[0];
  if (!prenom || !nom) return email.split("@")[0];
  return `${prenom.charAt(0).toUpperCase() + prenom.slice(1)} ${nom.charAt(0).toUpperCase() + nom.slice(1)}`;
}

function formatEuros(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
}

function dealValue(p: Pipeline): number {
  return p.nouveauPrimeTTC ?? p.copro.primeActuelle ?? 0;
}

/* ─── Tokens Bento appliqués inline ─── */
const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, Menlo, Consolas, monospace";

const TH: React.CSSProperties = {
  background: "#FBFBFB",
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#A2A1AF",
  textAlign: "center",
  padding: "0 16px",
  height: 44,
  borderBottom: "1px solid #E8E8EC",
  whiteSpace: "nowrap",
  userSelect: "none",
  minWidth: 80,
};

const TH_LEFT: React.CSSProperties = {
  ...TH,
  textAlign: "left",
  minWidth: 200,
};

const TH_RIGHT: React.CSSProperties = {
  ...TH,
  textAlign: "right",
  minWidth: 140,
};

const TD: React.CSSProperties = {
  padding: "12px 16px",
  height: 48,
  fontFamily: FONT_SANS,
  fontSize: 13,
  lineHeight: "18px",
  color: "#26262C",
  borderBottom: "1px solid #F3F3F5",
  verticalAlign: "middle",
  textAlign: "center",
};

const TD_LEFT: React.CSSProperties  = { ...TD, textAlign: "left" };
const TD_RIGHT: React.CSSProperties = { ...TD, textAlign: "right" };

type KpiFilter = "actifs" | "urgents" | "gagnes" | null;

export function AdminBoard({ pipelines, gestionnaires }: AdminBoardProps) {
  const [activeKpi, setActiveKpi] = useState<KpiFilter>(null);

  function toggleKpi(k: KpiFilter) {
    setActiveKpi(prev => prev === k ? null : k);
  }

  const wonPipelines = pipelines.filter(p => p.statut === "contrat_signe" || p.statut === "termine");
  const urgentPipelines = pipelines.filter(p => {
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    return d !== null && d <= 60 && !LOST_STATUTS.includes(p.statut);
  });
  const activePipelines = pipelines.filter(p => !LOST_STATUTS.includes(p.statut) && p.statut !== "termine");
  const allUrgent   = urgentPipelines.length;
  const totalValeur = wonPipelines.reduce((s, p) => s + dealValue(p), 0);

  const kpiDetail: { label: string; rows: Pipeline[] } | null = activeKpi === "actifs"  ? { label: "Dossiers actifs",    rows: activePipelines }
                  : activeKpi === "urgents" ? { label: "Urgents < 2 mois",   rows: urgentPipelines }
                  : activeKpi === "gagnes"  ? { label: "Deals gagnés",        rows: wonPipelines }
                  : null;

  const rows = gestionnaires.map(email => {
    const gp     = pipelines.filter(p => p.copro.gestionnaireEmail === email);
    const won    = gp.filter(p => p.statut === "contrat_signe" || p.statut === "termine");
    const lost   = gp.filter(p => LOST_STATUTS.includes(p.statut));
    const urgent = gp.filter(p => {
      const d = getDaysUntilEcheance(p.copro.dateEcheance);
      return d !== null && d <= 60 && !LOST_STATUTS.includes(p.statut);
    }).length;
    return {
      email,
      name:     formatGestionnaire(email),
      counts:   Object.fromEntries(COLS.map(c => [c.statut, gp.filter(p => p.statut === c.statut).length])),
      wonCount: won.length,
      lostCount:lost.length,
      valeur:   won.reduce((s, p) => s + dealValue(p), 0),
      urgent,
      total:    gp.length,
    };
  });

  const totals = Object.fromEntries(COLS.map(c => [c.statut, pipelines.filter(p => p.statut === c.statut).length]));
  const totalWon = wonPipelines.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT_SANS }}>

      {/* KPIs — 4 tuiles cliquables */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {([
          { filter: "actifs"  as KpiFilter, label: "Dossiers actifs",      value: activePipelines.length,                            color: "#26262C",                               numeric: true  },
          { filter: "urgents" as KpiFilter, label: "Urgents < 2 mois",     value: allUrgent,                                         color: allUrgent > 0 ? "#CA1E12" : "#26262C",   numeric: true  },
          { filter: "gagnes"  as KpiFilter, label: "Deals gagnés",         value: totalWon,                                          color: totalWon > 0 ? "#13762C" : "#26262C",    numeric: true  },
          { filter: null,                   label: "Valeur totale gagnée", value: totalValeur > 0 ? formatEuros(totalValeur) : "—",  color: totalValeur > 0 ? "#13762C" : "#A2A1AF", numeric: false },
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
                borderRadius: 8,
                padding: "16px 20px",
                boxShadow: isActive ? "0 0 0 3px rgba(78,73,252,.08)" : "0 1px 2px rgba(13,22,63,.05)",
                cursor: clickable ? "pointer" : "default",
                transition: "all 120ms",
              }}
            >
              <div style={{ fontSize: numeric ? 28 : 22, fontWeight: 700, letterSpacing: "-0.03em", color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                {value}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontSize: 13, color: "#656576", lineHeight: "18px" }}>{label}</span>
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

      {/* Tableau de détail KPI */}
      {kpiDetail && (
        <div style={{ border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #E8E8EC" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C", lineHeight: "20px" }}>{kpiDetail.label}</span>
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
                {activeKpi === "gagnes" && <th style={{ ...TH_RIGHT, color: "#13762C" }}>Valeur</th>}
                {activeKpi !== "gagnes" && <th style={{ ...TH_RIGHT }}>Échéance</th>}
              </tr>
            </thead>
            <tbody>
              {kpiDetail.rows.map(p => {
                const days = getDaysUntilEcheance(p.copro.dateEcheance);
                const urgColor = days !== null && days <= 60 ? "#CA1E12" : days !== null && days <= 120 ? "#955804" : "#A2A1AF";
                const tag = STATUT_TAG[p.statut];
                return (
                  <tr
                    key={p.id}
                    style={{ borderBottom: "1px solid #F3F3F5", cursor: "pointer", transition: "background 120ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#FBFBFB")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                    onClick={() => window.location.href = `/pipeline/${p.id}`}
                  >
                    <td style={TD_LEFT}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#4E49FC", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.copro.nom}
                      </div>
                      {p.copro.adresse && (
                        <div style={{ fontSize: 12, color: "#A2A1AF", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                          {p.copro.adresse}
                        </div>
                      )}
                    </td>
                    <td style={TD_LEFT}>
                      <span style={{ fontSize: 13, color: "#656576" }}>
                        {p.copro.gestionnaireEmail ? formatGestionnaire(p.copro.gestionnaireEmail) : "—"}
                      </span>
                    </td>
                    <td style={TD}>
                      {tag && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          height: 22, padding: "0 8px", borderRadius: 11,
                          fontSize: 11, fontWeight: 500, letterSpacing: "-0.08px",
                          background: TAG_BG[tag.variant], color: TAG_FG[tag.variant],
                          whiteSpace: "nowrap",
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "currentColor", opacity: 0.9 }} />
                          {tag.label}
                        </span>
                      )}
                    </td>
                    {activeKpi === "gagnes" ? (
                      <td style={TD_RIGHT}>
                        {dealValue(p) > 0 ? (
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#13762C", fontVariantNumeric: "tabular-nums" }}>
                            {formatEuros(dealValue(p))}
                          </span>
                        ) : <span style={{ color: "#C0C0C9" }}>—</span>}
                      </td>
                    ) : (
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
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Matrice pipeline */}
      <div style={{ border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", overflow: "auto", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #E8E8EC" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C", lineHeight: "20px" }}>Suivi par gestionnaire</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: "#656576", padding: "2px 8px", background: "#F7F7F8", borderRadius: 10 }}>
            {gestionnaires.length} gestionnaire{gestionnaires.length > 1 ? "s" : ""}
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_SANS, minWidth: 860 }}>
          <thead>
            <tr>
              <th style={TH_LEFT}>Gestionnaire</th>
              {COLS.map(col => <th key={col.statut} style={TH}>{col.label}</th>)}
              <th style={{ ...TH_RIGHT, color: "#13762C" }}>Valeur gagnée</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.email}
                style={{ transition: "background 120ms" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FBFBFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                {/* Gestionnaire */}
                <td style={TD_LEFT}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#26262C", lineHeight: "20px" }}>{row.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: "#A2A1AF", lineHeight: "16px", fontVariantNumeric: "tabular-nums" }}>
                      {row.total} dossier{row.total !== 1 ? "s" : ""}
                    </span>
                    {row.urgent > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#CA1E12", lineHeight: "16px" }}>
                        · {row.urgent} urgent{row.urgent > 1 ? "s" : ""}
                      </span>
                    )}
                    {row.lostCount > 0 && (
                      <span style={{ fontSize: 12, color: "#C0C0C9", lineHeight: "16px" }}>
                        · {row.lostCount} perdu{row.lostCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </td>

                {/* Comptes par étape */}
                {COLS.map(col => {
                  const count = row.counts[col.statut] ?? 0;
                  return (
                    <td key={col.statut} style={{ ...TD, background: count > 0 ? col.bg : undefined }}>
                      {count > 0 ? (
                        <span style={{ fontSize: 16, fontWeight: 700, color: col.fg, fontVariantNumeric: "tabular-nums" }}>
                          {count}
                        </span>
                      ) : (
                        <span style={{ color: "#E8E8EC", fontSize: 14 }}>—</span>
                      )}
                    </td>
                  );
                })}

                {/* Valeur gagnée */}
                <td style={TD_RIGHT}>
                  {row.valeur > 0 ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#13762C", lineHeight: "20px", fontVariantNumeric: "tabular-nums" }}>
                        {formatEuros(row.valeur)}
                      </div>
                      <div style={{ fontSize: 12, color: "#A2A1AF", marginTop: 2, lineHeight: "16px" }}>
                        {row.wonCount} deal{row.wonCount > 1 ? "s" : ""}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "#C0C0C9", fontSize: 14 }}>—</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Ligne Totaux */}
            <tr style={{ background: "#F7F7F8", borderTop: "2px solid #E8E8EC" }}>
              <td style={{ ...TD_LEFT, borderBottom: 0 }}>
                <span style={{ fontSize: 11, fontFamily: FONT_MONO, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#A2A1AF" }}>
                  Total
                </span>
              </td>
              {COLS.map(col => {
                const count = totals[col.statut] ?? 0;
                return (
                  <td key={col.statut} style={{ ...TD, background: count > 0 ? col.bg : undefined, borderBottom: 0 }}>
                    {count > 0 ? (
                      <span style={{ fontSize: 16, fontWeight: 700, color: col.fg, fontVariantNumeric: "tabular-nums" }}>
                        {count}
                      </span>
                    ) : (
                      <span style={{ color: "#E8E8EC", fontSize: 14 }}>—</span>
                    )}
                  </td>
                );
              })}
              <td style={{ ...TD_RIGHT, borderBottom: 0 }}>
                {totalValeur > 0 && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#13762C", fontVariantNumeric: "tabular-nums" }}>
                    {formatEuros(totalValeur)}
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
