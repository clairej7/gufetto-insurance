"use client";

// Automatisation 7 « Envois et suivi des propositions au CS ». Tableau des dossiers
// validés par le gestionnaire (arrivés depuis l'auto 6).
//  - Mails CS   : statut (Retrouvé / Aucun) — rempli proactivement côté agent.
//  - Prévisu CS : ouvre une modale de prévisualisation du mail au CS (pré-rempli
//                 avec les mails du CS) → « Envoyer au CS ».
//  - Envoi CS   : statut (Envoyé + date) une fois l'envoi fait depuis la modale.
//  - Statut CS + Résiliation éditables → transitions auto (perdu / clos) serveur.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ExternalLink, Users, Eye, Mail, Loader2, X, RefreshCw, Paperclip, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getPdfSignedUrl } from "@/lib/actions";

type CsStatut = "accepte" | "refus" | null;
type Resiliation = "oui" | "non" | "-" | null;
type Member = { name: string; email: string };
type Row = {
  pipelineId: string; nom: string; adresse: string | null;
  gestioReponse: "valide" | "refus" | null; gestioComment: string | null;
  gestionnaireNom: string | null;
  csMembers: Member[]; csMembersSyncedAt: string | null; csSentAt: string | null;
  csStatut: CsStatut; resiliation: Resiliation; statutPipeline: string;
};
type Table = { total: number; rows: Row[] };
type CsReplyRow = { pipelineId: string; nom: string; adresse: string | null; replyKind: "accepte" | "refus" | "autre" | null; snippet: string | null; from: string | null; at: string | null; convUrl: string | null; proposedStatut: "accepte" | "refus" | null };
type Volet2 = { total: number; awaiting: number; withReply: number; rows: CsReplyRow[]; lastScanAt: string | null };
type CsHistoryEntry = { pipelineId: string; nom: string; adresse: string | null; value: string; at: string; by: string };

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, fontSize: 11, color: "#A2A1AF", position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap", textAlign: "left", borderBottom: "1px solid #E8E8EC" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12.5, borderTop: "1px solid #F1F1F4", verticalAlign: "middle" };
const sel: React.CSSProperties = { fontSize: 12, padding: "5px 8px", border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff" };
const greyBtn: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#A2A1AF", background: "#F4F4F7", border: "1px solid #E8E8EC", borderRadius: 8, padding: "5px 9px", cursor: "not-allowed", whiteSpace: "nowrap" };
const blueBtn: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: "#fff", background: "#4E49FC", border: "1px solid #4E49FC", borderRadius: 8, padding: "5px 11px", cursor: "pointer", whiteSpace: "nowrap" };
const foundPill: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#0A6BB8", background: "#E7F2FB", border: "1px solid #BEDDF3", borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" };

const ETAPE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  envoye_cs: { label: "Validation CS", color: "#4E49FC", bg: "#EEF0FF", border: "#D9D9F5" },
  refuse: { label: "Perdu", color: "#CA1E12", bg: "#FDECEA", border: "#F4A9A0" },
  termine: { label: "Clos", color: "#13762C", bg: "#EAF7EE", border: "#B7E4C4" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export function Devis7Controls({ table, volet2, csHistory }: { table: Table; volet2: Volet2; csHistory: CsHistoryEntry[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewRow, setPreviewRow] = useState<Row | null>(null);
  const [fetchingCs, setFetchingCs] = useState(false);
  const [scanningCs, setScanningCs] = useState(false);
  const [csHistOpen, setCsHistOpen] = useState(false);

  async function scanCs() {
    setScanningCs(true);
    try {
      let offset = 0; let found = 0;
      for (let i = 0; i < 30; i++) {
        const res = await fetch("/api/devis7/scan-cs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, limit: 15 }) });
        const j = (await res.json().catch(() => ({}))) as { done?: boolean; nextOffset?: number; found?: number; error?: string };
        if (!res.ok) throw new Error(j.error ?? "Échec");
        found += j.found ?? 0;
        if (j.done) break;
        offset = j.nextOffset ?? offset + 15;
      }
      toast.success(`Scan terminé : ${found} réponse(s) CS détectée(s).`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setScanningCs(false); }
  }

  async function setCsVerdict(pipelineId: string, verdict: "accord" | "refus") {
    const label = verdict === "accord" ? "Accord → dossier SIGNÉ" : "Refus → dossier PERDU";
    if (!confirm(`Confirmer : ${label} ?`)) return;
    setBusy(pipelineId + "v2");
    try {
      const res = await fetch("/api/devis7/cs-verdict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId, verdict }) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(verdict === "accord" ? "Accord enregistré → dossier signé." : "Refus enregistré → dossier perdu.");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setBusy(null); }
  }

  async function fetchCsMembers() {
    setFetchingCs(true);
    try {
      const res = await fetch("/api/devis7/fetch-cs-members", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { withMembers?: number; processed?: number; totalMembers?: number; materaConfigure?: boolean; error?: string };
      if (!res.ok || j.materaConfigure === false) throw new Error(j.error ?? "Échec");
      toast.success(`Membres du CS récupérés : ${j.withMembers ?? 0} dossier(s) renseigné(s) (${j.totalMembers ?? 0} membres) sur ${j.processed ?? 0} sans données.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setFetchingCs(false);
    }
  }

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
      {/* VOLET 1 — Transmission des propositions au CS */}
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 1</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Transmission des propositions au CS</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un dossier…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
        </div>
        <button onClick={fetchCsMembers} disabled={fetchingCs} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 8, padding: "7px 12px", cursor: fetchingCs ? "default" : "pointer" }}>
          {fetchingCs ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} Retrouver les membres du CS
        </button>
        <span title="La récupération Matera nécessite une requête manuelle (pas de token côté app pour l'instant)" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#B4690E", background: "#FDF0D5", border: "1px solid #F3D9A6", borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" }}>
          <AlertTriangle size={13} /> Requête manuelle à faire
        </span>
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
              const found = r.csMembers.length > 0;
              const checked = !!r.csMembersSyncedAt;
              return (
                <tr key={r.pipelineId}>
                  <td style={td}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", fontWeight: 600 }}>{r.adresse || r.nom}</a></td>
                  <td style={{ ...td, textAlign: "center" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>Voir <ExternalLink size={11} /></a></td>
                  <td style={{ ...td, textAlign: "center" }}>
                    {r.gestioReponse === "valide" ? (
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#13762C" }}>Validé ✅</span>
                        {r.gestionnaireNom && <div style={{ fontSize: 10, color: "#A2A1AF", marginTop: 1 }}>{r.gestionnaireNom}</div>}
                      </div>
                    ) : r.gestioReponse === "refus" ? (
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#CA1E12" }}>Refus 🚫</span>
                        {r.gestionnaireNom && <div style={{ fontSize: 10, color: "#A2A1AF", marginTop: 1 }}>{r.gestionnaireNom}</div>}
                      </div>
                    ) : <span style={{ color: "#A2A1AF" }}>—</span>}
                  </td>
                  <td style={{ ...td, maxWidth: 220, color: "#656576" }} title={r.gestioComment ?? ""}>{r.gestioComment ? (r.gestioComment.length > 60 ? r.gestioComment.slice(0, 60) + "…" : r.gestioComment) : <span style={{ color: "#A2A1AF" }}>—</span>}</td>

                  {/* Mails CS — statut (rempli proactivement) */}
                  <td style={{ ...td, textAlign: "center" }}>
                    {found ? <span style={foundPill} title={r.csMembers.map((m) => m.email).join(", ")}>Retrouvé · {r.csMembers.length}</span>
                      : checked ? <span style={{ fontSize: 11, color: "#A2A1AF" }} title="Aucun membre du CS renseigné dans Matera">Aucun</span>
                      : <span style={{ color: "#C0C0C9" }}>—</span>}
                  </td>

                  {/* Prévisu CS — bleu si mails trouvés */}
                  <td style={{ ...td, textAlign: "center" }}>
                    <button
                      disabled={!found}
                      onClick={() => found && setPreviewRow(r)}
                      title={found ? "Prévisualiser le mail au CS" : "Mails du CS non trouvés"}
                      style={found ? blueBtn : greyBtn}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Eye size={12} /> Prévisu</span>
                    </button>
                  </td>

                  {/* Envoi CS — statut (Envoyé + date) après envoi depuis la modale */}
                  <td style={{ ...td, textAlign: "center" }}>
                    {r.csSentAt ? (
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#13762C" }}>Envoyé ✓</span>
                        <div style={{ fontSize: 10, color: "#A2A1AF", marginTop: 1 }}>{fmtDate(r.csSentAt)}</div>
                      </div>
                    ) : <button disabled title="L'envoi se fait depuis la fenêtre « Prévisu »" style={greyBtn}>Envoyer</button>}
                  </td>

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

      {/* VOLET 2 — Suivi des réponses du CS */}
      <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px dashed #E8E8EC", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 2</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Suivi des réponses du CS</span>
        <button onClick={scanCs} disabled={scanningCs} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#fff", background: "#4E49FC", border: "none", borderRadius: 8, padding: "7px 12px", cursor: scanningCs ? "default" : "pointer" }}>
          {scanningCs ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Détecter les réponses (Front)
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#656576", margin: "0 0 10px" }}>
        {volet2.awaiting} dossier{volet2.awaiting > 1 ? "s" : ""} en attente de réponse du CS · <strong>{volet2.withReply}</strong> avec une réponse détectée{volet2.lastScanAt ? ` · dernier scan ${fmtDate(volet2.lastScanAt)}` : ""}. Une réponse = message entrant d'un membre du CS. Le statut proposé est à <strong>valider</strong>.
      </p>
      {volet2.rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier en attente de réponse du CS.</p>
      ) : (
      <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #E8E8EC", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead><tr>
            {["Dossier", "Front", "Dernière réponse CS", "Verdict proposé", "Valider le Statut CS"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {volet2.rows.map((r) => {
              const b = r.replyKind === "accepte" ? { l: "Accepté", c: "#13762C", bg: "#EAF7EE", bd: "#B7E4C4" } : r.replyKind === "refus" ? { l: "Refus", c: "#CA1E12", bg: "#FDECEA", bd: "#F4A9A0" } : r.replyKind === "autre" ? { l: "À lire", c: "#B4690E", bg: "#FDF0D5", bd: "#F3D9A6" } : null;
              const vbusy = busy === r.pipelineId + "v2";
              return (
                <tr key={r.pipelineId}>
                  <td style={td}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none", fontWeight: 600 }}>{r.adresse || r.nom}</a></td>
                  <td style={td}>{r.convUrl ? <a href={r.convUrl} target="_blank" rel="noreferrer" title="Ouvrir la conversation dans Front" style={{ color: "#4E49FC", textDecoration: "none", fontWeight: 600 }}>Front ↗</a> : <span style={{ color: "#C7C7D1" }}>—</span>}</td>
                  <td style={{ ...td, maxWidth: 360 }}>
                    {r.replyKind ? (
                      <>
                        <div style={{ color: "#656576" }}>{r.snippet || "(voir conversation)"}</div>
                        <div style={{ fontSize: 10.5, color: "#A2A1AF", marginTop: 2 }}>{r.from ?? ""}{r.at ? ` · ${fmtDate(r.at)}` : ""}</div>
                      </>
                    ) : <span style={{ color: "#C7C7D1" }}>—</span>}
                  </td>
                  <td style={td}>{b ? <span style={{ fontSize: 11, fontWeight: 700, color: b.c, background: b.bg, border: `1px solid ${b.bd}`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{b.l}</span> : <span style={{ color: "#C7C7D1" }}>—</span>}</td>
                  <td style={td}>
                    <select disabled={vbusy} value="" onChange={(e) => { const v = e.target.value; if (v === "accord" || v === "refus") setCsVerdict(r.pipelineId, v); }}
                      style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", cursor: vbusy ? "default" : "pointer" }}>
                      <option value="">{vbusy ? "…" : "Traiter à la main"}</option>
                      <option value="accord">Accord → signé</option>
                      <option value="refus">Refus → perdu</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Historique des Statut CS validés (trace conservée) */}
      <div style={{ marginTop: 12, borderTop: "1px solid #F1F1F4", paddingTop: 10 }}>
        <button onClick={() => setCsHistOpen((o) => !o)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
          {csHistOpen ? "▾" : "▸"} Historique des statuts CS validés ({csHistory.length})
        </button>
        {csHistOpen && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {csHistory.length === 0 && <p style={{ fontSize: 12, color: "#A2A1AF" }}>Aucun statut CS validé pour l&apos;instant.</p>}
            {csHistory.map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: "#656576", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: "#26262C" }}>{fmtDate(h.at)}</span>
                <a href={`/pipeline/${h.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none", fontWeight: 600 }}>{h.adresse || h.nom}</a>
                <span style={{ fontWeight: 700, color: h.value === "refus" ? "#CA1E12" : "#13762C" }}>{h.value === "accepte" ? "Accepté" : h.value === "refus" ? "Refus" : h.value}</span>
                <span style={{ color: "#A2A1AF" }}>{h.by}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewRow && <PreviewModal row={previewRow} onClose={() => setPreviewRow(null)} onSent={() => { setPreviewRow(null); router.refresh(); }} />}
    </div>
  );
}

// ─── Modale de prévisualisation du mail au CS ─────────────────────────────────
type PreviewData = {
  copro: { nom: string; adresse: string | null; contactCsNom: string | null; primeActuelle: number | null; primePayee: number | null; gestionnaireEmail: string | null; gestionnaireNom: string | null };
  contratActuel: Record<string, unknown>;
  devis: { assureur: string; primeTTC: number; data: Record<string, unknown> }[];
  recommandeAssureur: string | null;
  csEmails: string; pack: { storagePath: string; name: string }[]; subject: string;
  prime?: { flag: "ok" | "bloque"; value: number | null; contrat: number | null; primePayee: number | null; ratio: number | null; source: string };
};

const fmtEur = (n: number | null | undefined) => (n == null ? "?" : Math.round(n).toLocaleString("fr-FR") + " €");

function PreviewModal({ row, onClose, onSent }: { row: Row; onClose: () => void; onSent: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewData | null>(null);
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);

  async function apercu(storagePath: string) {
    setOpeningPdf(storagePath);
    try {
      const url = await getPdfSignedUrl(storagePath);
      if (url) window.open(url, "_blank"); else toast.error("PDF indisponible");
    } catch { toast.error("PDF indisponible"); }
    setOpeningPdf(null);
  }

  const generate = useCallback(async (d: PreviewData) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/devis/recommend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copro: d.copro, contratActuel: d.contratActuel, devis: d.devis, recommandeAssureur: d.recommandeAssureur ?? undefined }),
      });
      const j = (await res.json()) as { success?: boolean; recommendation?: string; error?: string };
      if (j.success && j.recommendation) setBody(j.recommendation);
      else setError(j.error ?? "Génération impossible");
    } catch { setError("Erreur réseau (génération)"); }
    setGenerating(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/devis7/preview?pipelineId=${row.pipelineId}`);
        const j = (await res.json()) as PreviewData & { success?: boolean; error?: string };
        if (!res.ok || !j.success) throw new Error(j.error ?? "Chargement impossible");
        if (cancelled) return;
        setData(j); setTo(j.csEmails || ""); setSubject(j.subject);
        if (!j.devis?.length) { setError("Aucun devis enregistré pour ce dossier."); setLoading(false); return; }
        setLoading(false);
        generate(j);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Erreur"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [row.pipelineId, generate]);

  async function send() {
    if (!to.trim() || !body.trim()) { toast.error("Destinataire et corps requis"); return; }
    if (data?.prime?.flag === "bloque") { toast.error("Prime de référence incohérente — envoi bloqué. Corrige la prime d'abord."); return; }
    const pack = data?.pack ?? [];
    if (!pack.length) { toast.error("Aucune pièce jointe — envoi bloqué"); return; }
    if (!confirm(`Envoyer la proposition au conseil syndical ?\n\nÀ : ${to}\nPièces jointes : ${pack.length}`)) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("to", to);
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("refTag", `${row.pipelineId}:reco_cs`);
      // Joint tout le pack : le 1er en « devis », les suivants en « extra[] ».
      let attached = 0;
      for (let i = 0; i < pack.length; i++) {
        try {
          const fr = await fetch(`/api/storage/download?path=${encodeURIComponent(pack[i].storagePath)}`);
          if (fr.ok) { fd.append(i === 0 ? "devis" : "extra", await fr.blob(), `${pack[i].name}.pdf`); attached++; }
        } catch { /* PJ best-effort */ }
      }
      if (!attached) { toast.error("Échec du chargement des pièces jointes — envoi annulé"); setSending(false); return; }
      const res = await fetch("/api/front/draft", { method: "POST", body: fd });
      const j = (await res.json()) as { success?: boolean; fallback?: boolean; mailtoUrl?: string; error?: string };
      if (!j.success) throw new Error(j.error ?? "Échec de l'envoi");
      if (j.fallback && j.mailtoUrl) window.open(j.mailtoUrl, "_blank");
      await fetch("/api/devis7/mark-sent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId: row.pipelineId, to }) });
      toast.success("Proposition envoyée au CS !");
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,20,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 12px 40px rgba(13,22,63,.25)", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mail size={16} style={{ color: "#4E49FC" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#26262C" }}>Mail au conseil syndical — {row.adresse || row.nom}</span>
          </div>
          <button onClick={onClose} style={{ color: "#A2A1AF", background: "none", border: "none", cursor: "pointer" }}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#8784FD", fontSize: 13, padding: "24px 0" }}><Loader2 size={16} className="animate-spin" /> Chargement du dossier…</div>
        ) : error ? (
          <div style={{ fontSize: 13, color: "#CA1E12", padding: "16px 0" }}>{error}</div>
        ) : (
          <>
            {data?.recommandeAssureur && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#26262C" }}>⭐ Recommandation : <span style={{ color: "#4E49FC" }}>{data.recommandeAssureur}</span></span>
                <button onClick={() => data && generate(data)} disabled={generating} style={{ fontSize: 11.5, fontWeight: 600, color: "#8784FD", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><RefreshCw size={12} /> Regénérer</button>
              </div>
            )}
            {data?.prime?.flag === "bloque" && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", border: "1px solid #F4C9CF", background: "#FDEEF0", borderRadius: 10, fontSize: 12, color: "#B4243A", lineHeight: 1.45 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>Prime de référence incohérente — envoi bloqué.</strong> Le contrat extrait indique {fmtEur(data.prime.contrat)} mais la dernière prime payée est {fmtEur(data.prime.primePayee)} (écart ×{data.prime.ratio?.toFixed(1) ?? "?"}). La comparaison affichée serait trompeuse (sens économie/surcoût potentiellement inversé). Vérifie le vrai montant payé sur la fiche avant d&apos;envoyer.
                </span>
              </div>
            )}
            <label style={{ fontSize: 11, fontWeight: 600, color: "#656576" }}>Corps du mail — modifiable avant envoi</label>
            <div style={{ position: "relative", marginTop: 4 }}>
              {generating && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#8784FD", fontSize: 13, borderRadius: 10, zIndex: 1 }}><Loader2 size={16} className="animate-spin" /> Génération de l'email…</div>}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={13} style={{ width: "100%", borderRadius: 10, border: "1px solid #E8E8EC", padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5, resize: "vertical", background: "#FAFAFA", color: "#26262C", fontFamily: "inherit" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#656576" }}>Destinataires (CS)</label>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="membre1@cs.fr, membre2@cs.fr" style={{ width: "100%", fontSize: 12, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, marginTop: 4 }} />
                <p style={{ fontSize: 10.5, color: "#A2A1AF", margin: "3px 0 0" }}>Pré-rempli avec les membres du CS. Plusieurs adresses séparées par une virgule.</p>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#656576" }}>Objet</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, marginTop: 4 }} />
              </div>
            </div>

            {/* Pièces jointes : le pack selon l'assureur reco. Envoi bloqué si vide. */}
            {(data?.pack?.length ?? 0) > 0 ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#656576" }}>Pièces jointes ({data!.pack.length}) — {data?.recommandeAssureur ?? "assureur recommandé"}</div>
                {data!.pack.map((pj) => (
                  <div key={pj.storagePath} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid #D9D9F5", background: "#F5F5FF", borderRadius: 10 }}>
                    <Paperclip size={14} style={{ color: "#4E49FC", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "#26262C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={pj.name}>{pj.name}</div>
                    <button onClick={() => apercu(pj.storagePath)} disabled={!!openingPdf} style={{ fontSize: 11.5, fontWeight: 600, color: "#4E49FC", background: "#fff", border: "1px solid #D9D9F5", borderRadius: 8, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>{openingPdf === pj.storagePath ? "Ouverture…" : "Aperçu"}</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "1px solid #F4C9CF", background: "#FDEEF0", borderRadius: 10, fontSize: 12, color: "#B4243A" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} /> Aucune pièce jointe stockée pour ce dossier — l&apos;envoi au CS est bloqué (le devis doit être joint).
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={{ fontSize: 12.5, fontWeight: 600, color: "#656576", background: "#F4F4F7", border: "1px solid #E8E8EC", borderRadius: 8, padding: "9px 14px", cursor: "pointer" }}>Annuler</button>
              <button onClick={send} disabled={sending || generating || !to.trim() || !body.trim() || !(data?.pack?.length) || data?.prime?.flag === "bloque"} style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#fff", background: "#4E49FC", border: "none", borderRadius: 8, padding: "9px 14px", cursor: sending ? "wait" : "pointer", opacity: sending || generating || !to.trim() || !body.trim() || !(data?.pack?.length) || data?.prime?.flag === "bloque" ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {sending ? <><Loader2 size={14} className="animate-spin" /> Envoi…</> : <><Mail size={14} /> Envoyer au CS</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
