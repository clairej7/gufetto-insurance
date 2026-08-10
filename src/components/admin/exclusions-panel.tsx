"use client";

// Encart « Dossiers exclus de toute automatisation » (bas de l'onglet
// Automatisations) : récap + ajout/retrait de gestionnaires ou copros.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Plus, X, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Row = { id: string; kind: string; value: string; label: string | null; createdAt: string };
type ExcludedCopro = { id: string; nom: string; adresse: string | null; gestionnaireNom: string | null };
type State = { gestionnaires: number; copros: number; totalCopros: number; rows: Row[]; coproList: ExcludedCopro[] };

export function ExclusionsPanel({ state }: { state: State }) {
  const router = useRouter();
  const [kind, setKind] = useState<"gestionnaire" | "copro">("gestionnaire");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const [q, setQ] = useState("");
  const coproList = state.coproList ?? [];
  const filtered = q.trim()
    ? coproList.filter((c) => `${c.nom} ${c.adresse ?? ""} ${c.gestionnaireNom ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : coproList;

  async function add() {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/exclusions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value, label }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      toast.success("Exclusion ajoutée.");
      setValue(""); setLabel("");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Retirer cette exclusion ? Les dossiers concernés repasseront dans les automatisations.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/exclusions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      toast.success("Exclusion retirée.");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 40, background: "#fff", border: "1px solid #F5C6C0", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Ban size={18} style={{ color: "#CA1E12" }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#26262C", margin: 0 }}>Dossiers exclus de toute automatisation</h3>
      </div>
      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 14px" }}>
        Ces gestionnaires / copros ne sont <strong>jamais</strong> touchés ni mailés par aucune automatisation (audit courtier, envoi RS, relances, ODR, devis, autofill…). Marqués 🚫 dans le pipeline.
        <br />
        <strong style={{ color: "#CA1E12" }}>{state.totalCopros}</strong> copro{state.totalCopros > 1 ? "s" : ""} exclue{state.totalCopros > 1 ? "s" : ""} · {state.gestionnaires} gestionnaire(s) · {state.copros} copro(s) spécifique(s).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {state.rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 10px", background: "#FAFAFC", border: "1px solid #F1F1F4", borderRadius: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: r.kind === "gestionnaire" ? "#FDF0D5" : "#EAF3FE", color: r.kind === "gestionnaire" ? "#B4690E" : "#1F6FE0" }}>{r.kind}</span>
            <span style={{ color: "#26262C", fontWeight: 600 }}>{r.label || r.value}</span>
            <span style={{ color: "#A2A1AF" }}>{r.value}</span>
            <button onClick={() => remove(r.id)} disabled={busy} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "#A2A1AF", display: "inline-flex" }} title="Retirer"><X size={15} /></button>
          </div>
        ))}
        {state.rows.length === 0 && <span style={{ fontSize: 13, color: "#A2A1AF", fontStyle: "italic" }}>Aucune exclusion.</span>}
      </div>

      {coproList.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setShowList((v) => !v)} style={{ fontSize: 13, fontWeight: 600, color: "#CA1E12", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {showList ? "▾" : "▸"} Voir les {coproList.length} copros exclues (recherche)
          </button>
          {showList && (
            <div style={{ marginTop: 8 }}>
              <div style={{ position: "relative", marginBottom: 8, maxWidth: 380 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vérifier si une adresse / copro est exclue…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                      {["Copropriété", "Adresse", "Gestionnaire"].map((h) => (
                        <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} style={{ borderTop: "1px solid #F1F1F4" }}>
                        <td style={{ padding: "6px 10px", color: "#26262C" }}>🚫 {c.nom}</td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{c.adresse || "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{c.gestionnaireNom || "—"}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={3} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucune copro exclue ne correspond.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as "gestionnaire" | "copro")} style={{ fontSize: 13, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8 }}>
          <option value="gestionnaire">Gestionnaire (email)</option>
          <option value="copro">Copro (ID)</option>
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "gestionnaire" ? "prenom.nom@matera.eu" : "coproId"} style={{ fontSize: 13, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, minWidth: 240 }} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé (optionnel)" style={{ fontSize: 13, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, minWidth: 160 }} />
        <Button onClick={add} disabled={busy || !value.trim()} size="sm">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Ajouter
        </Button>
      </div>
    </div>
  );
}
