"use client";

// Import en masse des devis AXA envoyés par Achille (zip de PDF nommés par adresse).
// Prévisualisation (manifest + statut actuel) puis exécution (upload zip) :
// chaque devis → doc `devis_axa` dans la fiche + passage en comparaison / régénération
// selon l'étape. Une seule action serveur (session admin → Supabase + extraction Claude).

import { useCallback, useEffect, useRef, useState } from "react";

type PreviewRow = { file: string; coproNom: string; action: string; statutManifest: string; statutActuel: string; docDejaPresent: boolean };
type Preview = { total: number; counts: Record<string, number>; rows: PreviewRow[] };
type ReportRow = { file: string; copro: string; docStored: boolean; stepMoved: boolean; compared: boolean; note: string };
type Result = { summary: { total: number; docsStored: number; stepsMoved: number; compared: number; errors: number }; report: ReportRow[] };

const ACTION_LABEL: Record<string, string> = { move: "→ comparaison", regen: "régénérer", skip: "doc seul (envoyé CS)", flag: "à vérifier" };

export default function ImportDevisPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "run">(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setBusy("preview"); setErr(null);
    try {
      const r = await fetch("/api/admin/import-devis-axa");
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      setPreview(j as Preview);
    } catch (e) { setErr(e instanceof Error ? e.message : "Échec"); }
    finally { setBusy(null); }
  }, []);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const run = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr("Sélectionne d'abord le fichier DEVIS.zip."); return; }
    if (!confirm(`Lancer l'import ? ${preview?.counts.move ?? 0} passage(s) en comparaison, ${preview?.counts.regen ?? 0} régénération(s), ${preview?.counts.skip ?? 0} doc seul.`)) return;
    setBusy("run"); setErr(null); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("/api/admin/import-devis-axa", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      setResult(j as Result);
      loadPreview();
    } catch (e) { setErr(e instanceof Error ? e.message : "Échec de l'import"); }
    finally { setBusy(null); }
  };

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "18px 20px", marginBottom: 16 };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#8A8A99", textTransform: "uppercase", padding: "0 8px 6px" };
  const td: React.CSSProperties = { padding: "6px 8px", borderTop: "1px solid #F1F1F4", fontSize: 12.5, color: "#26262C" };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#26262C", margin: "0 0 4px" }}>Import devis AXA (en masse)</h1>
      <p style={{ fontSize: 13.5, color: "#656576", margin: "0 0 18px" }}>Dépose le <b>DEVIS.zip</b> d&apos;Achille. Chaque devis est rattaché à sa copro (doc <code>devis_axa</code>) et le dossier avance selon son étape.</p>

      {err && <div style={{ ...card, border: "1px solid #F4C7BC", background: "#FFF7F5", color: "#CA1E12", fontSize: 13 }}>{err}</div>}

      {/* Prévisualisation */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#26262C" }}>1 · Prévisualisation {preview ? `(${preview.total} devis)` : ""}</span>
          {preview && (
            <span style={{ fontSize: 12.5, color: "#656576" }}>
              <b style={{ color: "#4E49FC" }}>{preview.counts.move ?? 0}</b> → comparaison · <b style={{ color: "#7A3FF2" }}>{preview.counts.regen ?? 0}</b> régénérer · <b style={{ color: "#8A8A99" }}>{preview.counts.skip ?? 0}</b> doc seul{preview.counts.flag ? ` · ${preview.counts.flag} à vérifier` : ""}
            </span>
          )}
        </div>
        {busy === "preview" && <p style={{ fontSize: 13, color: "#8A8A99" }}>Chargement…</p>}
        {preview && (
          <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr><th style={th}>Fichier</th><th style={th}>Copro</th><th style={th}>Action</th><th style={th}>Statut actuel</th><th style={th}>Doc déjà là</th></tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.file}>
                    <td style={td}>{r.file}</td>
                    <td style={{ ...td, color: "#656576" }}>{r.coproNom}</td>
                    <td style={td}>{ACTION_LABEL[r.action] ?? r.action}</td>
                    <td style={{ ...td, color: r.statutActuel === r.statutManifest ? "#26262C" : "#CA1E12" }}>{r.statutActuel}</td>
                    <td style={td}>{r.docDejaPresent ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exécution */}
      <div style={card}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#26262C" }}>2 · Import</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".zip" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} style={{ fontSize: 13 }} />
          <button onClick={run} disabled={busy === "run"} style={{ padding: "9px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, background: busy === "run" ? "#C9C8D3" : "#4E49FC", color: "#fff", cursor: busy === "run" ? "wait" : "pointer" }}>
            {busy === "run" ? "Import en cours… (peut prendre 1-2 min)" : "Lancer l'import"}
          </button>
          {fileName && <span style={{ fontSize: 12, color: "#8A8A99" }}>{fileName}</span>}
        </div>
      </div>

      {/* Rapport */}
      {result && (
        <div style={card}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#26262C" }}>3 · Rapport</span>
          <p style={{ fontSize: 13, color: "#26262C", margin: "8px 0 12px" }}>
            {result.summary.docsStored} doc(s) stocké(s) · {result.summary.stepsMoved} passage(s) en comparaison · {result.summary.compared} régénéré(s) ·{" "}
            <b style={{ color: result.summary.errors ? "#CA1E12" : "#13762C" }}>{result.summary.errors} erreur(s)</b>
          </p>
          <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr><th style={th}>Copro</th><th style={th}>Doc</th><th style={th}>Étape</th><th style={th}>Comparé</th><th style={th}>Note</th></tr></thead>
              <tbody>
                {result.report.map((r) => (
                  <tr key={r.file}>
                    <td style={{ ...td, color: "#656576" }}>{r.copro}</td>
                    <td style={td}>{r.docStored ? "✓" : "—"}</td>
                    <td style={td}>{r.stepMoved ? "✓" : "—"}</td>
                    <td style={td}>{r.compared ? "✓" : "—"}</td>
                    <td style={{ ...td, color: r.note.match(/KO|erreur|absent|introuvable/i) ? "#CA1E12" : "#8A8A99" }}>{r.note || "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
