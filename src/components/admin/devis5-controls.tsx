"use client";

// Automatisation 5 « Demande de devis » — Volet 1 : base défilable des dossiers
// concernés (Demande de devis + Comparaison des devis non encore lancée).

import { useState } from "react";
import { Search } from "lucide-react";

type Row = { pipelineId: string; nom: string; adresse: string | null; statut: "devis_demandes" | "devis_recus"; assureur: string | null; numeroContrat: string | null; prime: number | null; courtier: string | null; mail: string | null };
type Data = { total: number; demande: number; comparaison: number; rows: Row[] };

const STATUT_LABEL: Record<Row["statut"], { label: string; bg: string; fg: string }> = {
  devis_demandes: { label: "Demande de devis", bg: "#EAF3FE", fg: "#1F6FE0" },
  devis_recus: { label: "Comparaison des devis", bg: "#F3EFFE", fg: "#6D3BEB" },
};

export function Devis5Controls({ data }: { data: Data }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rows = q.trim()
    ? data.rows.filter((r) => `${r.adresse ?? ""} ${r.nom} ${r.assureur ?? ""} ${r.courtier ?? ""} ${r.numeroContrat ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : data.rows;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#26262C", margin: "0 0 8px" }}>
        <span style={{ color: "#A2A1AF" }}>Volet 1 — </span>Dossiers concernés
      </div>
      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
        <strong>{data.total}</strong> dossier{data.total > 1 ? "s" : ""} à traiter · {data.demande} en « Demande de devis » · {data.comparaison} en « Comparaison des devis » (hors comparaisons déjà lancées).
      </p>
      <button onClick={() => setOpen((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▾" : "▸"} Parcourir les {data.total} dossiers
      </button>
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
