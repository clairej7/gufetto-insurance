"use client";

// Volet admin « Suivi des ODR acceptés » (semi-auto). Affiche la MÊME liste que la
// page gestio (copro / gestio / assureur), les dossiers flaggés « à prévenir le CS »
// par les gestionnaires regroupés en tête, + un bouton pour poster le recap hebdo
// sur Slack. Se rafraîchit tout seul pour voir les retours en temps réel.

import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, ShieldAlert, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type Row = { pipelineId: string; copro: string; gestionnaire: string | null; assureur: string; prevenirCs: boolean };
type Data = { weekLabel: string; total: number; aPrevenirCount: number; rows: Row[] };

export function OdrSuiviAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [posting, setPosting] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/odr-suivi/admin"); const j = await r.json(); if (j?.success) setData(j as Data); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const postRecap = async () => {
    if (posting) return;
    if (!confirm("Poster le recap « ODR acceptés de la semaine » sur #devis_assurance_pro (avec le lien pour les gestionnaires) ?")) return;
    setPosting(true);
    try {
      const r = await fetch("/api/odr-suivi/post-recap", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; count?: number; error?: string };
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`Recap posté sur Slack (${j.count ?? 0} dossier(s)).`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'envoi"); }
    finally { setPosting(false); }
  };

  const aPrevenir = data?.rows.filter((r) => r.prevenirCs) ?? [];

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "16px 18px", marginTop: 14 };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#8A8A99", textTransform: "uppercase", padding: "0 8px 6px" };
  const td: React.CSSProperties = { padding: "8px", borderTop: "1px solid #F1F1F4", fontSize: 13, color: "#26262C" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#26262C" }}>Suivi des ODR acceptés</span>
          <span style={{ fontSize: 12.5, color: "#8A8A99", marginLeft: 8 }}>{data ? `${data.weekLabel} · ${data.total} dossier(s)` : "…"}</span>
        </div>
        <button onClick={postRecap} disabled={posting} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, background: posting ? "#C9C8D3" : "#4E49FC", color: "#fff", cursor: posting ? "wait" : "pointer" }}>
          {posting ? <Loader2 size={15} /> : <Send size={15} />} Poster le recap ODR (Slack)
        </button>
      </div>

      {/* Retours gestionnaires : dossiers « à prévenir le CS » regroupés */}
      <div style={{ marginTop: 14, background: aPrevenir.length ? "#FFF7F5" : "#FAFAFC", border: `1px solid ${aPrevenir.length ? "#F4C7BC" : "#EEE"}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: aPrevenir.length ? 10 : 0 }}>
          <ShieldAlert size={16} style={{ color: aPrevenir.length ? "#CA1E12" : "#8A8A99" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: aPrevenir.length ? "#CA1E12" : "#656576" }}>
            {aPrevenir.length} dossier(s) à prévenir le CS <span style={{ fontWeight: 500, color: "#8A8A99" }}>(signalés par les gestionnaires)</span>
          </span>
        </div>
        {aPrevenir.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {aPrevenir.map((r) => (
              <div key={r.pipelineId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", border: "1px solid #F1D9D2", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#26262C" }}>{r.copro}</span>
                <span style={{ color: "#656576" }}>{r.gestionnaire || "—"} · {r.assureur}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* La fenêtre exacte que voient les gestionnaires (liste complète) */}
      <button onClick={() => setListOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        {listOpen ? "Masquer" : "Voir"} la liste vue par les gestionnaires ({data?.total ?? 0})
        <ChevronDown size={14} style={{ transform: listOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {listOpen && data && (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr><th style={th}>Copropriété</th><th style={th}>Gestionnaire</th><th style={th}>Assureur</th><th style={{ ...th, textAlign: "right" }}>Prévenir CS</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.pipelineId}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.copro}</td>
                  <td style={{ ...td, color: "#656576" }}>{r.gestionnaire || "—"}</td>
                  <td style={td}>{r.assureur}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.prevenirCs ? <span style={{ color: "#CA1E12", fontWeight: 700 }}>✓ à prévenir</span> : <span style={{ color: "#C7C7D2" }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
