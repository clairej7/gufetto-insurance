"use client";

// Auto 5 — Volet 2 : tableau Excel des demandes de devis (AXA).
// 1) « Générer l'excel correspondant » → tableau (colonne A remplie).
// 2) « Retrouver les infos … » → remplissage Gufetto + extraction contrat, avec
//    code couleur (vert = sûr, orange = douteux, rouge = manquant), barre de chargement.
// 3) cellules éditables (menus déroulants) → sauvegarde + passage en vert.
// 4) « Générer l'excel » → téléchargement .xlsx.
import { useState } from "react";
import { Loader2, FileSpreadsheet, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { COLUMNS, LABELS, displayValue, type ColKey, type Cell, type ExcelRow } from "@/lib/devis5-columns";

const TINT: Record<Cell["color"], { bg: string; bd: string }> = {
  green: { bg: "#EAF6EE", bd: "#B7E0C3" },
  orange: { bg: "#FDF3DF", bd: "#F0D28A" },
  red: { bg: "#FCEBEB", bd: "#F1C4C4" },
};

export function Devis5ExcelTable({ count }: { count: number }) {
  const [rows, setRows] = useState<ExcelRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [extracted, setExtracted] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/devis5/excel/rows", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      setRows(d.rows);
      setExtracted(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setGenerating(false); }
  }

  async function retrieve(limit?: number) {
    if (!rows) return;
    const pending = rows.filter((r) => !extracted.has(r.pipelineId));
    const targets = typeof limit === "number" ? pending.slice(0, limit) : pending;
    if (!targets.length) { toast.info("Tous les dossiers ont déjà été traités."); return; }
    setExtracting(true);
    setProg({ done: 0, total: targets.length });
    let done = 0;
    for (const t of targets) {
      try {
        const res = await fetch("/api/devis5/excel/extract", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineId: t.pipelineId }),
        });
        const d = await res.json();
        if (res.ok && d.row) {
          setRows((prev) => prev?.map((r) => (r.pipelineId === t.pipelineId ? d.row : r)) ?? prev);
        }
      } catch { /* on continue le lot */ }
      done++;
      setExtracted((prev) => new Set(prev).add(t.pipelineId));
      setProg({ done, total: targets.length });
    }
    setExtracting(false);
    setProg(null);
    toast.success(`${done} dossier(s) traité(s).`);
  }

  async function saveCell(pipelineId: string, key: ColKey, value: string | null) {
    // MAJ optimiste
    setRows((prev) => prev?.map((r) => r.pipelineId === pipelineId
      ? { ...r, cells: { ...r.cells, [key]: { value: value || null, color: value ? "green" : "red" } } } : r) ?? prev);
    try {
      const res = await fetch("/api/devis5/excel/save-cell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId, key, value }),
      });
      if (!res.ok) throw new Error();
    } catch { toast.error("Sauvegarde échouée"); }
  }

  async function download() {
    if (!rows) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/devis5/excel/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error("Erreur génération");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "demandes-devis-axa.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setDownloading(false); }
  }

  const pendingCount = rows ? rows.filter((r) => !extracted.has(r.pipelineId)).length : count;
  const btn = (bg: string, fg: string, bd: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
    color: fg, background: bg, border: `1px solid ${bd}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer",
  });

  return (
    <div>
      {/* Étape 1 : générer le tableau */}
      {!rows && (
        <button onClick={generate} disabled={generating || count === 0} style={{ ...btn("#4E49FC", "#fff", "#4E49FC"), opacity: count === 0 ? 0.5 : 1 }}>
          {generating ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Générer l&apos;excel correspondant ({count})
        </button>
      )}

      {rows && (
        <>
          {/* Étape 2 : retrouver les infos */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <button onClick={() => retrieve()} disabled={extracting || pendingCount === 0} style={{ ...btn("#4E49FC", "#fff", "#4E49FC"), opacity: pendingCount === 0 ? 0.5 : 1 }}>
              {extracting ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Retrouver les infos des {pendingCount} dossiers
            </button>
            <button onClick={() => retrieve(5)} disabled={extracting || pendingCount === 0} style={{ ...btn("#EEF0FF", "#4E49FC", "#D7DAFB"), opacity: pendingCount === 0 ? 0.5 : 1 }}>
              {extracting ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} … de 5 dossiers
            </button>
            <button onClick={download} disabled={downloading} style={btn("#13762C", "#fff", "#13762C")}>
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Générer l&apos;excel
            </button>
            <span style={{ display: "inline-flex", gap: 12, fontSize: 11, color: "#656576", marginLeft: 4 }}>
              <span>🟢 sûr</span><span>🟠 à vérifier</span><span>🔴 manquant</span>
            </span>
          </div>

          {/* Barre de chargement */}
          {prog && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ height: 6, background: "#EEF0FF", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round((prog.done / prog.total) * 100)}%`, background: "#4E49FC", transition: "width .2s" }} />
              </div>
              <div style={{ fontSize: 11, color: "#656576", marginTop: 4 }}>{prog.done} / {prog.total} dossiers traités…</div>
            </div>
          )}

          {/* Tableau */}
          <div style={{ overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#F7F7FA" }}>
                  <th style={thStyle}>Copropriété (A)</th>
                  {COLUMNS.map((c) => <th key={c.key} style={thStyle}>{c.label} ({c.letter})</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pipelineId} style={{ borderTop: "1px solid #EEE" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, position: "sticky", left: 0, background: "#fff", minWidth: 200 }}>{r.nom}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} style={{ ...tdStyle, background: TINT[r.cells[c.key].color].bg, borderColor: TINT[r.cells[c.key].color].bd }}>
                        <CellEditor col={c.key} cell={r.cells[c.key]} onSave={(v) => saveCell(r.pipelineId, c.key, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontWeight: 700, color: "#26262C", whiteSpace: "nowrap", fontSize: 11 };
const tdStyle: React.CSSProperties = { padding: "4px 6px", verticalAlign: "top", border: "1px solid transparent" };

// Éditeur de cellule selon le type de colonne.
function CellEditor({ col, cell, onSave }: { col: ColKey; cell: Cell; onSave: (v: string | null) => void }) {
  const meta = COLUMNS.find((c) => c.key === col)!;
  const raw = cell.value ?? "";
  const inputStyle: React.CSSProperties = { width: "100%", minWidth: 120, border: "1px solid #D7D7DE", borderRadius: 6, padding: "4px 6px", fontSize: 12, background: "#fff" };

  if (meta.type === "select") {
    return (
      <select value={raw} onChange={(e) => onSave(e.target.value || null)} style={inputStyle}>
        <option value="">—</option>
        {meta.options!.map((o) => <option key={o} value={o}>{LABELS[o] ?? o}</option>)}
      </select>
    );
  }
  if (meta.type === "multi") {
    let selected: string[] = [];
    try { const a = JSON.parse(raw); if (Array.isArray(a)) selected = a; } catch { if (raw) selected = [raw]; }
    const toggle = (opt: string) => {
      const next = selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt];
      onSave(next.length ? JSON.stringify(next) : null);
    };
    return (
      <details style={{ minWidth: 160 }}>
        <summary style={{ ...inputStyle, cursor: "pointer", listStyle: "none", whiteSpace: "normal" }}>
          {selected.length ? selected.join(", ") : <span style={{ color: "#A2A1AF" }}>— choisir —</span>}
        </summary>
        <div style={{ background: "#fff", border: "1px solid #D7D7DE", borderRadius: 6, padding: 6, marginTop: 2, maxHeight: 180, overflowY: "auto", position: "relative", zIndex: 5 }}>
          {meta.options!.map((o) => (
            <label key={o} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, padding: "2px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </details>
    );
  }
  // text / number
  return (
    <input
      type={meta.type === "number" ? "number" : "text"}
      defaultValue={col === "prime" || col === "surface" ? raw : displayValue(col, cell.value)}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (cell.value ?? "")) onSave(v || null); }}
      style={inputStyle}
    />
  );
}
