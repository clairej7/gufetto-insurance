"use client";

// Auto 5 — Volet 2 : tableau Excel des demandes de devis (AXA).
// 1) « Générer l'excel correspondant » → tableau (colonne A remplie).
// 2) « Retrouver les infos … » → remplissage Gufetto + extraction contrat, avec
//    code couleur (vert = sûr, orange = douteux, rouge = manquant), barre de chargement.
// 3) cellules éditables (menus déroulants) → sauvegarde + passage en vert.
// 4) « Générer l'excel » → téléchargement .xlsx.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileSpreadsheet, Search, Download, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { COLUMNS, LABELS, displayValue, type ColKey, type Cell, type ExcelRow } from "@/lib/devis5-columns";

const TINT: Record<Cell["color"], { bg: string; bd: string }> = {
  green: { bg: "#EAF6EE", bd: "#B7E0C3" },
  orange: { bg: "#FDF3DF", bd: "#F0D28A" },
  red: { bg: "#FCEBEB", bd: "#F1C4C4" },
};
// Persistance locale : le tableau (valeurs + couleurs + dossiers déjà traités)
// est sauvegardé à chaque changement et restauré au chargement → un
// rafraîchissement de l'onglet ne remet plus tout à zéro.
const STORAGE_KEY = "devis5-excel-v1";

export function Devis5ExcelTable({ count }: { count: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<ExcelRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [extracted, setExtracted] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  // Restauration au montage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { rows?: ExcelRow[]; extracted?: string[] };
      if (Array.isArray(s.rows) && s.rows.length) { setRows(s.rows); setExtracted(new Set(s.extracted ?? [])); }
    } catch { /* ignore */ }
  }, []);
  // Sauvegarde à chaque changement.
  useEffect(() => {
    if (!rows) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, extracted: [...extracted] })); } catch { /* quota */ }
  }, [rows, extracted]);

  function reset() {
    setRows(null); setExtracted(new Set());
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

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

  async function runExtract(targets: ExcelRow[]) {
    if (!targets.length) { toast.info("Rien à traiter."); return; }
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
          // MERGE (jamais de régression) : la nouvelle extraction ajoute / améliore,
          // mais ne doit JAMAIS effacer une cellule déjà remplie. Si le nouveau
          // résultat est "red" (rien trouvé ce coup-ci) alors qu'on avait une valeur
          // (vert OU orange), on GARDE l'ancienne.
          setRows((prev) => prev?.map((r) => {
            if (r.pipelineId !== t.pipelineId) return r;
            const row = d.row as ExcelRow;
            const cells = { ...row.cells };
            for (const c of COLUMNS) {
              const nu = cells[c.key];
              const old = r.cells[c.key];
              if (nu && nu.color === "red" && old && old.color !== "red") cells[c.key] = old;
            }
            return { ...row, cells };
          }) ?? prev);
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

  // Retrouver = seulement les dossiers pas encore traités (progression).
  async function retrieve(limit?: number) {
    if (!rows) return;
    const pending = rows.filter((r) => !extracted.has(r.pipelineId));
    if (!pending.length) { toast.info("Tous les dossiers ont déjà été traités — utilise « Rafraîchir » pour refaire une passe."); return; }
    await runExtract(typeof limit === "number" ? pending.slice(0, limit) : pending);
  }

  // Rafraîchir = repasse l'extraction sur TOUS les dossiers (récupère les nouveaux
  // docs / infos modifiées + applique les défauts si des champs sont encore vides).
  async function refresh() {
    if (!rows) return;
    await runExtract(rows);
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
      // finalize=true : crée le lot (Volet 3) + sort les dossiers du Volet 2.
      const res = await fetch("/api/devis5/excel/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, finalize: true }),
      });
      if (!res.ok) throw new Error("Erreur génération");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const fname = `Demandes_devis_Matera_${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}.xlsx`;
      const a = document.createElement("a");
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel généré et ajouté au Volet 3.");
      reset();           // les dossiers ont quitté le Volet 2 → on vide le tableau
      router.refresh();  // affiche le nouveau lot dans le Volet 3
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
            <button onClick={refresh} disabled={extracting} title="Repasse l'extraction sur TOUS les dossiers (récupère les nouveaux docs / infos modifiées et applique les défauts sur les champs encore vides)" style={{ ...btn("#EEF0FF", "#4E49FC", "#D7DAFB"), opacity: extracting ? 0.5 : 1 }}>
              {extracting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rafraîchir
            </button>
            <button onClick={reset} title="Vide le tableau (les données restent enregistrées côté dossier)" style={btn("#fff", "#656576", "#E8E8EC")}>
              <RotateCcw size={13} /> Réinitialiser
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

          {/* Tableau — hauteur ~6-7 lignes, en-tête figé, scroll H+V */}
          <div style={{ maxHeight: 340, overflow: "auto", border: "1px solid #E8E8EC", borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#F7F7FA" }}>
                  <th style={{ ...thStyle, position: "sticky", top: 0, left: 0, zIndex: 3, background: "#F7F7FA" }}>Copropriété (A)</th>
                  {COLUMNS.map((c) => <th key={c.key} style={{ ...thStyle, position: "sticky", top: 0, zIndex: 2, background: "#F7F7FA" }}>{c.label} ({c.letter})</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pipelineId} style={{ borderTop: "1px solid #EEE" }}>
                    <td style={{ ...tdStyle, position: "sticky", left: 0, zIndex: 1, background: "#fff", minWidth: 200 }}>
                      <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", fontWeight: 600 }}>{r.nom}</a>
                    </td>
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

          {/* Compteur de complétion — toujours visible (hors zone de scroll du tableau) */}
          {(() => {
            const totalCells = rows.length * COLUMNS.length;
            const filled = rows.reduce((s, r) => s + COLUMNS.filter((c) => r.cells[c.key].color !== "red").length, 0);
            const pct = totalCells ? Math.round((filled / totalCells) * 100) : 0;
            return (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#F7F7FA", border: "1px solid #E8E8EC", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#26262C" }}>
                {filled} / {totalCells} cases remplies · <span style={{ color: "#4E49FC" }}>{pct}%</span> des informations complétées
              </div>
            );
          })()}
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
        {/* placeholder non sélectionnable : ne compte pas comme une réponse */}
        <option value="" disabled hidden>— choisir —</option>
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
