"use client";

// Automatisation 5 « Demande de devis » — Volet 1 : base défilable des dossiers
// concernés (Demande de devis + Comparaison des devis non encore lancée).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

type Row = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; numeroContrat: string | null; prime: number | null; courtier: string | null; gestionnaire: string | null; hasRs: boolean; hasContrat: boolean };
type Data = { total: number; prets: number; docsManquants: number; rows: Row[] };
type DocHist = { loadedAt: string; dossiers: number; created: number };
type NoDoc = { pipelineId: string; nom: string; adresse: string | null; checkedAt: string };

export function Devis5Controls({ data, toLoad, docHistory = [], noDocs = [], docsStats }: { data: Data; toLoad: number; docHistory?: DocHist[]; noDocs?: NoDoc[]; docsStats?: { rs: number; contrat: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; created: number } | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [showNoDocs, setShowNoDocs] = useState(false);
  const rows = data.rows
    .filter((r) => !onlyMissing || !r.hasRs || !r.hasContrat)
    .filter((r) => !q.trim() || `${r.adresse ?? ""} ${r.nom} ${r.assureur ?? ""} ${r.courtier ?? ""} ${r.numeroContrat ?? ""} ${r.gestionnaire ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

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
        <strong>{data.total}</strong> dossier{data.total > 1 ? "s" : ""} en « Demande de devis » à traiter (hors devis déjà envoyés).
      </p>
      <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, color: "#13762C", background: "#EAF7EE", border: "1px solid #B7E4C4" }}>✓ {data.prets} prêts (RS + contrat)</span>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, color: "#B4690E", background: "#FDF0D5", border: "1px solid #F3D9A6" }}>⚠ {data.docsManquants} docs manquants</span>
        {docsStats && <span style={{ fontSize: 11, color: "#A2A1AF", alignSelf: "center" }}>· {docsStats.rs} RS / {docsStats.contrat} contrats stockés depuis le début</span>}
      </div>
      <br/>
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

      {noDocs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowNoDocs((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#B4690E", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {showNoDocs ? "▾" : "▸"} Dossiers sans document trouvé ({noDocs.length}) — à traiter à la main
          </button>
          {showNoDocs && (
            <div style={{ marginTop: 6 }}>
              <p style={{ fontSize: 11, color: "#A2A1AF", margin: "0 0 6px" }}>Aucun RS/contrat trouvé sur Front (pas de réponse courtier, ou réponse sans pièce jointe). Exclus du chargement auto — récupère-les à la main sur la fiche (bouton « Récupérer ») une fois le courtier relancé.</p>
              <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #F3D9A6", borderRadius: 8, background: "#FFFBF3" }}>
                {noDocs.map((r) => (
                  <div key={r.pipelineId} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderTop: "1px solid #F6ECD5", fontSize: 12 }}>
                    <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a>
                    <span style={{ color: "#A2A1AF", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{new Date(r.checkedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 380 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une copro / assureur / gestionnaire…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#B4690E", cursor: "pointer" }}>
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Docs manquants seulement ({data.docsManquants})
            </label>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                  {["Copropriété", "RS", "Contrat", "Assureur actuel", "N° contrat", "Prime", "Courtier", "Gestionnaire"].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const chip = (ok: boolean) => <span style={{ fontSize: 11, fontWeight: 700, color: ok ? "#13762C" : "#CA1E12" }}>{ok ? "✓" : "✗"}</span>;
                  return (
                    <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: (!r.hasRs || !r.hasContrat) ? "#FFFBF3" : undefined }}>
                      <td style={{ padding: "6px 10px", color: "#26262C" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>{chip(r.hasRs)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>{chip(r.hasContrat)}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.assureur || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.numeroContrat || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.prime != null ? `${r.prime.toLocaleString("fr-FR")} €` : "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.courtier || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576", whiteSpace: "nowrap" }}>{r.gestionnaire || "—"}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={8} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Volet 2 — placeholder ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 2</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Récupération des infos nécessaires aux devis</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>Contenu à venir</span>
        </div>
        <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>À construire : rassembler les informations requises par les assureurs pour chiffrer (surface, période de construction, activités, sinistralité…).</p>
      </div>

      {/* ── Volet 3 — placeholder ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 3</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Envoi des demandes aux assureurs</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>Contenu à venir</span>
        </div>
        <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>À construire : envoi des demandes de devis aux assureurs (AXA / Mila) avec les infos et documents rattachés.</p>
      </div>
    </div>
  );
}
