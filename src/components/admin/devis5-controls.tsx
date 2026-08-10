"use client";

// Automatisation 5 « Demande de devis » — Volet 1 : base défilable des dossiers
// concernés (Demande de devis + Comparaison des devis non encore lancée).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

type Row = { pipelineId: string; nom: string; adresse: string | null; statut: "devis_demandes" | "devis_recus"; assureur: string | null; numeroContrat: string | null; prime: number | null; courtier: string | null; mail: string | null };
type Data = { total: number; demande: number; comparaison: number; rows: Row[] };
type DocHist = { loadedAt: string; dossiers: number; created: number };

const STATUT_LABEL: Record<Row["statut"], { label: string; bg: string; fg: string }> = {
  devis_demandes: { label: "Demande de devis", bg: "#EAF3FE", fg: "#1F6FE0" },
  devis_recus: { label: "Comparaison des devis", bg: "#F3EFFE", fg: "#6D3BEB" },
};

export function Devis5Controls({ data, toLoad, docHistory = [] }: { data: Data; toLoad: number; docHistory?: DocHist[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; created: number } | null>(null);
  const [showHist, setShowHist] = useState(false);
  const rows = q.trim()
    ? data.rows.filter((r) => `${r.adresse ?? ""} ${r.nom} ${r.assureur ?? ""} ${r.courtier ?? ""} ${r.numeroContrat ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : data.rows;

  async function loadDocs(onlyFive: boolean) {
    if (toLoad === 0) return;
    setLoading(true);
    setProg({ done: 0, total: onlyFive ? Math.min(5, toLoad) : toLoad, created: 0 });
    let offset = 0, created = 0, processed = 0;
    try {
      for (;;) {
        const res = await fetch("/api/devis5/load-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, limit: 5 }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
        const d = await res.json();
        offset = d.nextOffset; created += d.created; processed += d.processed;
        setProg({ done: processed, total: onlyFive ? Math.min(5, d.total) : d.total, created });
        if (d.done || onlyFive) break;
      }
      await fetch("/api/devis5/load-docs-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dossiers: processed, created }) });
      toast.success(`${created} document(s) chargé(s) sur ${processed} dossier(s).`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec du chargement"); } finally { setLoading(false); }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 1</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Dossiers concernés — chargement des documents</span>
      </div>
      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
        <strong>{data.total}</strong> dossier{data.total > 1 ? "s" : ""} à traiter · {data.demande} en « Demande de devis » · {data.comparaison} en « Comparaison des devis » (hors comparaisons déjà lancées).
      </p>
      <button onClick={() => setOpen((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▾" : "▸"} Parcourir les {data.total} dossiers
      </button>

      {/* Chargement en masse des docs (RS + contrat MRI) depuis Front → Gufetto */}
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => loadDocs(false)}
          disabled={loading || toLoad === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: toLoad === 0 ? "#B7B6E6" : "#4E49FC", border: "none", borderRadius: 8, padding: "8px 14px", cursor: loading || toLoad === 0 ? "default" : "pointer" }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Charger les documents des {toLoad} dossiers
        </button>
        <button
          onClick={() => loadDocs(true)}
          disabled={loading || toLoad === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#4E49FC", background: "#F5F5FF", border: "1px solid #D9D9F5", borderRadius: 8, padding: "8px 14px", cursor: loading || toLoad === 0 ? "default" : "pointer" }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Charger les docs de {Math.min(5, toLoad)} dossiers
        </button>
        {toLoad === 0 && <span style={{ fontSize: 12, color: "#13762C" }}>✓ Tous les documents disponibles sont chargés.</span>}
      </div>
      <p style={{ fontSize: 11.5, color: "#A2A1AF", margin: "6px 0 0" }}>
        Récupère automatiquement les RS et contrats MRI reçus des courtiers (Front) et les range dans chaque dossier. Idempotent : ne recharge pas ce qui est déjà là.
      </p>
      {loading && prog && (
        <div style={{ margin: "10px 0 0", maxWidth: 460 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#656576", marginBottom: 4 }}>
            <span>Chargement des documents… <strong style={{ color: "#13762C" }}>{prog.created}</strong> doc(s) récupéré(s)</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{prog.done} / {prog.total}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#E8E8EC", overflow: "hidden" }}>
            <div style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%`, height: "100%", background: "#4E49FC", transition: "width 200ms" }} />
          </div>
        </div>
      )}
      {docHistory.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowHist((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#656576", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {showHist ? "▾" : "▸"} Historique des chargements ({docHistory.length})
          </button>
          {showHist && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {docHistory.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: "#656576", display: "flex", gap: 8 }}>
                  <span style={{ color: "#26262C", fontVariantNumeric: "tabular-nums" }}>{new Date(h.loadedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span>→ <strong>{h.created}</strong> doc(s) sur {h.dossiers} dossier(s)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ position: "relative", marginBottom: 8, maxWidth: 380 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une copro / assureur / n° contrat…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                  {["Copropriété", "Étape", "Assureur actuel", "N° contrat", "Prime", "Courtier"].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = STATUT_LABEL[r.statut];
                  return (
                    <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
                      <td style={{ padding: "6px 10px", color: "#26262C" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                      <td style={{ padding: "6px 10px" }}><span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: s.bg, color: s.fg }}>{s.label}</span></td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.assureur || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.numeroContrat || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.prime != null ? `${r.prime.toLocaleString("fr-FR")} €` : "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.courtier || "—"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
