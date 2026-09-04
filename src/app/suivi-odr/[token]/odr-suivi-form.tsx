"use client";

import { useState } from "react";
import type { OdrAccepteRow } from "@/lib/odr-suivi";

export function OdrSuiviForm({ token, rows }: { token: string; rows: OdrAccepteRow[] }) {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((r) => [r.pipelineId, r.prevenirCs])));
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (pipelineId: string) => {
    if (busy) return;
    const on = !flags[pipelineId];
    setBusy(pipelineId);
    try {
      const r = await fetch("/api/odr-suivi/prevenir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pipelineId, on }),
      });
      if (r.ok) setFlags((s) => ({ ...s, [pipelineId]: on }));
    } catch { /* réseau */ } finally {
      setBusy(null);
    }
  };

  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#8A8A99", textTransform: "uppercase", padding: "0 10px 6px" };
  const td: React.CSSProperties = { padding: "5px 10px", borderTop: "1px solid #F1F1F4", fontSize: 13, color: "#26262C", verticalAlign: "middle" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
        <thead>
          <tr>
            <th style={th}>Copropriété</th>
            <th style={th}>Gestionnaire</th>
            <th style={th}>Assureur</th>
            <th style={{ ...th, textAlign: "right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = flags[r.pipelineId];
            return (
              <tr key={r.pipelineId}>
                <td style={{ ...td, fontWeight: 600 }}>{r.copro}</td>
                <td style={{ ...td, color: "#656576" }}>{r.gestionnaire || "—"}</td>
                <td style={td}>{r.assureur}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button
                    onClick={() => toggle(r.pipelineId)}
                    disabled={busy === r.pipelineId}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: busy === r.pipelineId ? "wait" : "pointer",
                      border: on ? "1.5px solid #F3C48B" : "none",
                      background: on ? "#FDEEDC" : "#7A3FF2",
                      color: on ? "#A65B12" : "#fff",
                      whiteSpace: "nowrap",
                      opacity: busy === r.pipelineId ? 0.6 : 1,
                    }}
                  >
                    {on ? "✓ CS à prévenir" : "Prévenir le CS"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "#B0B0BC", margin: "12px 0 0" }}>Clique à nouveau sur un bouton orange pour annuler. L&apos;équipe assurance voit tes signalements en temps réel.</p>
    </div>
  );
}
