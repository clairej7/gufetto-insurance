"use client";

// Automatisation 6 « Comparer les devis & préparer le mail au CS ».
// Suivi en UN SEUL tableau filtrable (remplace les 3 anciens volets), calqué sur
// le grand tableau de suivi manuel : recherche dossier, filtre gestionnaire,
// prix actuel (dernière prime payée récupérée via Front), prix des devis, et un
// bouton « Générer la comparaison » qui rejoue la comparaison Claude des fiches.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Devis = { assureur: string; prime: number | null };
type Row = {
  pipelineId: string; nom: string; adresse: string | null;
  gestionnaire: string | null; gestionnaireEmail: string | null;
  comparaisonFaite: boolean; primeConnue: number | null;
  devis1: Devis | null; devis2: Devis | null;
};
type Table = { total: number; faites: number; rows: Row[]; gestionnaires: string[] };

const fmtE = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, fontSize: 11, color: "#A2A1AF", position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap", textAlign: "left", borderBottom: "1px solid #E8E8EC" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12.5, borderTop: "1px solid #F1F1F4", verticalAlign: "middle" };
const laterBtn: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#A2A1AF", background: "#F4F4F7", border: "1px solid #E8E8EC", borderRadius: 8, padding: "5px 9px", cursor: "not-allowed", whiteSpace: "nowrap" };

// Récup de la dernière prime payée (Front) avec une file de concurrence bornée.
async function runQueue<T>(items: T[], worker: (t: T) => Promise<void>, concurrency = 4) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  }));
}

export function Devis6Controls({ table }: { table: Table }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [gest, setGest] = useState("");        // filtre gestionnaire ("" = tous)
  const [compFilter, setCompFilter] = useState<"tous" | "oui" | "non">("tous");
  const [generating, setGenerating] = useState<string | null>(null);
  // Prix actuel (dernière prime payée) récupéré côté client, par dossier.
  const [prix, setPrix] = useState<Record<string, { loading: boolean; montant: number | null; done: boolean }>>({});
  const fetchedRef = useRef(false);

  async function fetchPrime(pipelineId: string) {
    setPrix((m) => ({ ...m, [pipelineId]: { loading: true, montant: m[pipelineId]?.montant ?? null, done: false } }));
    try {
      const res = await fetch("/api/devis/prime-payee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId }) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; montant?: number | null };
      setPrix((m) => ({ ...m, [pipelineId]: { loading: false, montant: j.success && j.montant != null ? j.montant : null, done: true } }));
    } catch {
      setPrix((m) => ({ ...m, [pipelineId]: { loading: false, montant: null, done: true } }));
    }
  }

  async function loadPrices() {
    await runQueue(table.rows.map((r) => r.pipelineId), fetchPrime, 4);
  }

  // Chargement auto des prix actuels au 1er montage (source = mail de demande de devis).
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void loadPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generer(pipelineId: string) {
    setGenerating(pipelineId);
    try {
      const res = await fetch("/api/devis6/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId }) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; devis?: Devis[]; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`Comparaison générée — ${j.devis?.length ?? 0} devis analysé(s).`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération");
    } finally {
      setGenerating(null);
    }
  }

  const rows = table.rows
    .filter((r) => !q.trim() || `${r.adresse ?? ""} ${r.nom}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((r) => !gest || r.gestionnaire === gest)
    .filter((r) => compFilter === "tous" || (compFilter === "oui" ? r.comparaisonFaite : !r.comparaisonFaite));

  const prixCell = (r: Row) => {
    const st = prix[r.pipelineId];
    if (st?.loading) return <Loader2 size={13} className="animate-spin" style={{ color: "#A2A1AF" }} />;
    if (st?.done && st.montant != null) return <strong style={{ color: "#26262C" }}>{fmtE(st.montant)}</strong>;
    // Pas de dernière prime trouvée → repli sur la prime connue en base.
    if (r.primeConnue != null) return <span title="Prime connue en base (dernière prime payée non retrouvée dans Front)" style={{ color: "#8A8A99" }}>{fmtE(r.primeConnue)}<span style={{ fontSize: 10, color: "#B4690E" }}> ?</span></span>;
    return <span style={{ color: "#A2A1AF" }}>—</span>;
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      {/* Barre de recherche / filtres */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un dossier…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
        </div>
        <select value={gest} onChange={(e) => setGest(e.target.value)} style={{ fontSize: 12, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", maxWidth: 220 }}>
          <option value="">Tous les gestionnaires</option>
          {table.gestionnaires.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={compFilter} onChange={(e) => setCompFilter(e.target.value as "tous" | "oui" | "non")} style={{ fontSize: 12, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff" }}>
          <option value="tous">Comparaison : toutes</option>
          <option value="oui">Comparaison : faite</option>
          <option value="non">Comparaison : à faire</option>
        </select>
        <button onClick={loadPrices} title="Recharger les prix actuels depuis Front" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#656576", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}><RefreshCw size={13} /> Prix actuels</button>
        <span style={{ fontSize: 11.5, color: "#A2A1AF", marginLeft: "auto" }}>{rows.length}/{table.total} dossier{table.total > 1 ? "s" : ""} · {table.faites} comparaison{table.faites > 1 ? "s" : ""} faite{table.faites > 1 ? "s" : ""}</span>
      </div>

      <div style={{ maxHeight: 560, overflow: "auto", border: "1px solid #E8E8EC", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={th}>Dossier</th>
              <th style={{ ...th, textAlign: "center" }}>Comparaison effectuée</th>
              <th style={{ ...th, textAlign: "right" }}>Prix actuel</th>
              <th style={{ ...th, textAlign: "right" }}>Prix devis 1</th>
              <th style={{ ...th, textAlign: "right" }}>Prix devis 2</th>
              <th style={{ ...th, textAlign: "center" }}>Générer</th>
              <th style={th}>Gestionnaire</th>
              <th style={{ ...th, textAlign: "center" }}>→ Gestionnaire</th>
              <th style={{ ...th, textAlign: "center" }}>→ Conseil syndical</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pipelineId} style={{ background: r.comparaisonFaite ? "#F7FBF8" : undefined }}>
                <td style={td}>
                  <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {r.adresse || r.nom} <ExternalLink size={11} style={{ opacity: 0.6 }} />
                  </a>
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  {r.comparaisonFaite
                    ? <span style={{ fontSize: 11, fontWeight: 800, color: "#13762C", background: "#EAF7EE", border: "1px solid #B7E4C4", borderRadius: 999, padding: "2px 9px" }}>OUI</span>
                    : <span style={{ fontSize: 11, fontWeight: 800, color: "#B4690E", background: "#FDF0D5", border: "1px solid #F3D9A6", borderRadius: 999, padding: "2px 9px" }}>NON</span>}
                </td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{prixCell(r)}</td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.devis1 ? <span title={r.devis1.assureur}><span style={{ color: "#A2A1AF", fontSize: 10.5 }}>{r.devis1.assureur.split(" ")[0]}</span> {fmtE(r.devis1.prime)}</span> : <span style={{ color: "#A2A1AF" }}>—</span>}</td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.devis2 ? <span title={r.devis2.assureur}><span style={{ color: "#A2A1AF", fontSize: 10.5 }}>{r.devis2.assureur.split(" ")[0]}</span> {fmtE(r.devis2.prime)}</span> : <span style={{ color: "#A2A1AF" }}>—</span>}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => generer(r.pipelineId)} disabled={generating === r.pipelineId}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#fff", background: generating === r.pipelineId ? "#8784FD" : "#4E49FC", border: "none", borderRadius: 8, padding: "6px 10px", cursor: generating === r.pipelineId ? "default" : "pointer", whiteSpace: "nowrap" }}>
                    {generating === r.pipelineId ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {r.comparaisonFaite ? "Régénérer" : "Générer"}
                  </button>
                </td>
                <td style={{ ...td, color: "#656576", whiteSpace: "nowrap" }}>{r.gestionnaire || "—"}</td>
                <td style={{ ...td, textAlign: "center" }}><button disabled title="À mettre en place — enverra la proposition au gestionnaire pour validation" style={laterBtn}>Envoyer <span style={{ opacity: 0.7 }}>(à venir)</span></button></td>
                <td style={{ ...td, textAlign: "center" }}><button disabled title="À mettre en place — prévisualisera et enverra le mail préparé aux membres du CS" style={laterBtn}>Prévisu + envoi CS <span style={{ opacity: 0.7 }}>(à venir)</span></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#A2A1AF" }}>Aucun dossier ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "#A2A1AF", margin: "8px 2px 0" }}>
        « Prix actuel » = dernière prime payée récupérée dans le mail de demande de devis (Front). « Générer » rejoue la comparaison Claude des fiches sur les devis stockés ; le détail reste consultable sur la fiche du dossier.
      </p>
    </div>
  );
}
