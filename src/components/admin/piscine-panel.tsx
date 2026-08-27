"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PiscineState, PiscineTone } from "@/lib/piscine";

const TONE: Record<PiscineTone, { bg: string; fg: string }> = {
  danger: { bg: "#FDECEA", fg: "#CA1E12" },
  warn: { bg: "#FEF3C7", fg: "#955804" },
  info: { bg: "#EEF0FF", fg: "#4E49FC" },
};

export function PiscinePanel({ state }: { state: PiscineState }) {
  const [auto, setAuto] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.cases.filter((c) => {
      if (auto !== null && c.auto !== auto) return false;
      if (!needle) return true;
      return (
        c.coproNom.toLowerCase().includes(needle) ||
        c.kindLabel.toLowerCase().includes(needle) ||
        c.detail.toLowerCase().includes(needle)
      );
    });
  }, [state.cases, auto, q]);

  if (state.total === 0) {
    return (
      <p style={{ fontSize: 13, color: "#13762C", margin: 0, fontWeight: 600 }}>
        ✓ Aucun cas en attente d&apos;intervention manuelle.
      </p>
    );
  }

  const chip = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 11px",
    borderRadius: 999,
    cursor: "pointer",
    border: active ? "1px solid #4E49FC" : "1px solid #E8E8EC",
    background: active ? "#EEF0FF" : "#fff",
    color: active ? "#4E49FC" : "#656576",
  });

  return (
    <div>
      {/* Filtres par automatisation + recherche */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <span style={chip(auto === null)} onClick={() => setAuto(null)}>
          Toutes ({state.total})
        </span>
        {state.groups.map((g) => (
          <span key={g.auto} style={chip(auto === g.auto)} onClick={() => setAuto(g.auto)}>
            {g.autoLabel} ({g.count})
          </span>
        ))}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300, marginLeft: "auto" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }}
          />
        </div>
      </div>

      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 380, border: "1px solid #E8E8EC", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
              <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Auto</th>
              <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Type de cas</th>
              <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Copropriété</th>
              <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Détail</th>
              <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Liens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #F1F1F4" }}>
                <td style={{ padding: "6px 12px", whiteSpace: "nowrap", color: "#8A8A99", fontWeight: 600 }}>{c.autoLabel.replace(/ —.*$/, "")}</td>
                <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: TONE[c.tone].bg, color: TONE[c.tone].fg }}>
                    {c.kindLabel}
                  </span>
                </td>
                <td style={{ padding: "6px 12px", color: "#26262C" }}>
                  {c.pipelineUrl ? (
                    <a href={c.pipelineUrl} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{c.coproNom}</a>
                  ) : (
                    c.coproNom
                  )}
                </td>
                <td style={{ padding: "6px 12px", color: "#4E4E58" }}>{c.detail}</td>
                <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                  {c.pipelineUrl && (
                    <a href={c.pipelineUrl} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", fontWeight: 600, marginRight: 10 }}>Fiche</a>
                  )}
                  {c.frontUrl && (
                    <a href={c.frontUrl} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", fontWeight: 600 }}>Front</a>
                  )}
                  {!c.pipelineUrl && !c.frontUrl && <span style={{ color: "#C4C4CE" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
