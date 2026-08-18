"use client";

// Automatisation 7 « Envois et suivi des propositions au CS ». Tableau des dossiers
// validés par le gestionnaire (arrivés depuis l'auto 6). Statut CS + Résiliation
// éditables → transitions auto (perdu / clos) côté serveur.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type CsStatut = "accepte" | "refus" | null;
type Resiliation = "oui" | "non" | "-" | null;
type Row = {
  pipelineId: string; nom: string; adresse: string | null;
  gestioReponse: "valide" | "refus" | null; gestioComment: string | null;
  csStatut: CsStatut; resiliation: Resiliation; statutPipeline: string;
};
type Table = { total: number; rows: Row[] };

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, fontSize: 11, color: "#A2A1AF", position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap", textAlign: "left", borderBottom: "1px solid #E8E8EC" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12.5, borderTop: "1px solid #F1F1F4", verticalAlign: "middle" };
const laterBtn: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#A2A1AF", background: "#F4F4F7", border: "1px solid #E8E8EC", borderRadius: 8, padding: "5px 9px", cursor: "not-allowed", whiteSpace: "nowrap" };
const sel: React.CSSProperties = { fontSize: 12, padding: "5px 8px", border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff" };

const ETAPE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  envoye_cs: { label: "Validation CS", color: "#4E49FC", bg: "#EEF0FF", border: "#D9D9F5" },
  refuse: { label: "Perdu", color: "#CA1E12", bg: "#FDECEA", border: "#F4A9A0" },
  termine: { label: "Clos", color: "#13762C", bg: "#EAF7EE", border: "#B7E4C4" },
};

export function Devis7Controls({ table }: { table: Table }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatut(pipelineId: string, field: "cs_statut" | "resiliation", value: string) {
    setBusy(pipelineId + field);
    try {
      const res = await fetch("/api/devis7/statut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId, field, value }) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success("Mis à jour.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(null);
    }
  }

  const rows = table.rows.filter((r) => !q.trim() || `${r.adresse ?? ""} ${r.nom}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un dossier…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
        </div>
        <span style={{ fontSize: 11.5, color: "#A2A1AF", marginLeft: "auto" }}>{rows.length}/{table.total} dossier{table.total > 1 ? "s" : ""}</span>
      </div>

      {table.total === 0 ? (
        <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier pour l&apos;instant. Les dossiers arrivent ici quand le gestionnaire valide la proposition en automatisation 6.</p>
      ) : (
      <div style={{ maxHeight: 560, overflow: "auto", border: "1px solid #E8E8EC", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
          <thead>
            <tr>
              <th style={th}>Dossier</th>
              <th style={{ ...th, textAlign: "center" }}>Comparaison</th>
              <th style={{ ...th, textAlign: "center" }}>Réponse gestionnaire</th>
              <th style={th}>Commentaire gestionnaire</th>
              <th style={{ ...th, textAlign: "center" }}>Mails CS</th>
              <th style={{ ...th, textAlign: "center" }}>Prévisu CS</th>
              <th style={{ ...th, textAlign: "center" }}>Envoi CS</th>
              <th style={{ ...th, textAlign: "center" }}>Statut CS</th>
              <th style={{ ...th, textAlign: "center" }}>Résiliation envoyée</th>
              <th style={{ ...th, textAlign: "center" }}>Étape</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const et = ETAPE[r.statutPipeline] ?? { label: r.statutPipeline, color: "#656576", bg: "#F1F1F4", border: "#E0E0E6" };
              const resilForced = r.csStatut === "refus";
              return (
                <tr key={r.pipelineId}>
                  <td style={td}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", fontWeight: 600 }}>{r.adresse || r.nom}</a></td>
                  <td style={{ ...td, textAlign: "center" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>Voir <ExternalLink size={11} /></a></td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {r.gestioReponse === "valide" ? <span style={{ fontSize: 11, fontWeight: 700, color: "#13762C" }}>Validé ✅</span> : r.gestioReponse === "refus" ? <span style={{ fontSize: 11, fontWeight: 700, color: "#CA1E12" }}>Refus 🚫</span> : <span style={{ color: "#A2A1AF" }}>—</span>}
                  </td>
                  <td style={{ ...td, maxWidth: 220, color: "#656576" }} title={r.gestioComment ?? ""}>{r.gestioComment ? (r.gestioComment.length > 60 ? r.gestioComment.slice(0, 60) + "…" : r.gestioComment) : <span style={{ color: "#A2A1AF" }}>—</span>}</td>
                  <td style={{ ...td, textAlign: "center" }}><button disabled title="À venir — récupérer les mails du conseil syndical (Matera)" style={laterBtn}>Retrouver</button></td>
                  <td style={{ ...td, textAlign: "center" }}><button disabled title="À venir — prévisualiser le mail au CS" style={laterBtn}>Prévisu</button></td>
                  <td style={{ ...td, textAlign: "center" }}><button disabled title="À venir — envoyer le mail au CS" style={laterBtn}>Envoyer</button></td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <select value={r.csStatut ?? ""} disabled={busy === r.pipelineId + "cs_statut"} onChange={(e) => setStatut(r.pipelineId, "cs_statut", e.target.value)} style={sel}>
                      <option value="">—</option>
                      <option value="accepte">Accepté</option>
                      <option value="refus">Refus</option>
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {resilForced ? <span style={{ color: "#A2A1AF", fontWeight: 700 }}>–</span> : (
                      <select value={r.resiliation ?? ""} disabled={busy === r.pipelineId + "resiliation"} onChange={(e) => setStatut(r.pipelineId, "resiliation", e.target.value)} style={sel}>
                        <option value="">—</option>
                        <option value="oui">Oui</option>
                        <option value="non">Non</option>
                      </select>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 700, color: et.color, background: et.bg, border: `1px solid ${et.border}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{et.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      <p style={{ fontSize: 11, color: "#A2A1AF", margin: "8px 2px 0" }}>
        Statut CS « refus » → dossier passé en <strong>Perdu</strong> (résiliation forcée à «-»). Statut CS « accepté » + résiliation « oui » → dossier passé en <strong>Clos</strong>. La ligne reste affichée ici.
      </p>
    </div>
  );
}
