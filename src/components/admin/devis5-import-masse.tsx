"use client";

// Volet 5 de l'Automatisation 5 — « Import devis en masse ». Un seul bouton :
// déverse un zip de devis AXA (PDF nommés par adresse) → chaque devis est rattaché
// à sa copro (doc `devis_axa`) et le dossier avance selon son étape. Bilan à la fin
// + historique des imports (menu déroulant).

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, Loader2, ChevronDown, History } from "lucide-react";
import { toast } from "sonner";

type ReportRow = { file: string; copro: string; docStored: boolean; stepMoved: boolean; compared: boolean; note: string };
type Summary = { total: number; rattaches: number; docsStored: number; stepsMoved: number; compared: number; nonRattaches: number; errors: number };
type Result = { summary: Summary; report: ReportRow[] };
type HistRow = Summary & { at: string; by: string | null };

const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(":", "h");

export function Devis5ImportMasse() {
  const [hist, setHist] = useState<HistRow[]>([]);
  const [histOpen, setHistOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHist = useCallback(async () => {
    try { const r = await fetch("/api/admin/import-devis-axa"); const j = await r.json(); if (j?.success) setHist(j.history ?? []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadHist(); }, [loadHist]);

  const onFile = async (f: File) => {
    if (busy) return;
    if (!confirm(`Importer « ${f.name} » ? Chaque devis sera rattaché à sa copro et le dossier avancera automatiquement.`)) { if (fileRef.current) fileRef.current.value = ""; return; }
    setBusy(true); setResult(null); setDetailOpen(false);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("/api/admin/import-devis-axa", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      setResult(j as Result);
      const su = (j as Result).summary;
      toast.success(`Import terminé : ${su.docsStored} devis rattachés, ${su.stepsMoved} passés en comparaison.`);
      loadHist();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'import"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "16px 18px" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#8A8A99", textTransform: "uppercase", padding: "0 8px 6px" };
  const td: React.CSSProperties = { padding: "6px 8px", borderTop: "1px solid #F1F1F4", fontSize: 12.5, color: "#26262C" };
  const s = result?.summary;

  return (
    <div style={card}>
      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
        Dépose le zip des devis (PDF nommés par adresse, ex. « 21 RUE CHAPPE 75018 PARIS.pdf »). Chaque devis est rattaché à sa copropriété et le dossier avance selon son étape.
      </p>

      {/* Bouton unique : déverser le zip */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: busy ? "#C9C8D3" : "#4E49FC", color: "#fff", cursor: busy ? "wait" : "pointer" }}>
        {busy ? <Loader2 size={16} /> : <UploadCloud size={16} />}
        {busy ? "Import en cours… (~1-2 min)" : "Importer le dossier"}
        <input ref={fileRef} type="file" accept=".zip" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} style={{ display: "none" }} />
      </label>

      {/* Bilan */}
      {s && (
        <div style={{ marginTop: 14, background: s.errors || s.nonRattaches ? "#FFF9F0" : "#EAF7EE", border: `1px solid ${s.errors || s.nonRattaches ? "#F3D9B8" : "#B7E4C4"}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#26262C", marginBottom: 4 }}>Bilan de l&apos;import</div>
          <div style={{ fontSize: 13, color: "#26262C" }}>
            {s.docsStored} devis rattaché(s) · {s.stepsMoved} passé(s) en comparaison · {s.compared} régénéré(s)
            {s.nonRattaches ? <> · <b style={{ color: "#A65B12" }}>{s.nonRattaches} non rattaché(s)</b></> : null}
            {s.errors ? <> · <b style={{ color: "#CA1E12" }}>{s.errors} erreur(s)</b></> : null}
          </div>
          <button onClick={() => setDetailOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {detailOpen ? "Masquer" : "Voir"} le détail ({result!.report.length})
            <ChevronDown size={13} style={{ transform: detailOpen ? "rotate(180deg)" : "none" }} />
          </button>
          {detailOpen && (
            <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, background: "#fff" }}>
                <thead><tr><th style={th}>Fichier</th><th style={th}>Copro</th><th style={th}>Doc</th><th style={th}>Étape</th><th style={th}>Note</th></tr></thead>
                <tbody>
                  {result!.report.map((r) => (
                    <tr key={r.file}>
                      <td style={td}>{r.file}</td>
                      <td style={{ ...td, color: "#656576" }}>{r.copro}</td>
                      <td style={td}>{r.docStored ? "✓" : "—"}</td>
                      <td style={td}>{r.stepMoved ? "→ comparaison" : r.compared ? "régénéré" : "—"}</td>
                      <td style={{ ...td, color: /KO|erreur|rattacher/i.test(r.note) ? "#A65B12" : "#8A8A99" }}>{r.note || "ok"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Historique */}
      <button onClick={() => setHistOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        <History size={14} /> Historique des imports ({hist.length})
        <ChevronDown size={14} style={{ transform: histOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {histOpen && (
        hist.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#A0A0AC", margin: "4px 0 0", fontStyle: "italic" }}>Aucun import pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {hist.map((h) => (
              <div key={h.at} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#FAFAFC", border: "1px solid #EEE", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "#26262C" }}>{fmtDate(h.at)}</span>
                <span style={{ color: "#656576" }}>
                  {h.docsStored} rattaché(s) · {h.stepsMoved} → comparaison · {h.compared} régénéré(s)
                  {h.nonRattaches ? ` · ${h.nonRattaches} non rattaché(s)` : ""}{h.errors ? ` · ${h.errors} erreur(s)` : ""}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
