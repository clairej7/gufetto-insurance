"use client";

// Automatisation 5 « Demande de devis » — Volet 1 : base défilable des dossiers
// concernés (Demande de devis + Comparaison des devis non encore lancée).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Row = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; numeroContrat: string | null; prime: number | null; courtier: string | null; gestionnaire: string | null; hasRs: boolean; hasContrat: boolean };
type Data = { total: number; prets: number; docsManquants: number; rows: Row[] };
type DocHist = { loadedAt: string; dossiers: number; created: number };
type NoDoc = { pipelineId: string; nom: string; adresse: string | null; checkedAt: string };
type DevisReplyKind = "devis_obtenu" | "traiter_manuel" | "pas_de_reponse" | "non_scanne";
type Demande = { eventId: string; pipelineId: string; nom: string; adresse: string | null; assureur: string; to: string | null; sentAt: string; jours: number; convUrl: string | null; scanEligible: boolean; replyKind: DevisReplyKind; replyConfirmed: boolean; replySnippet: string | null; scanned: boolean };
type Suivi = { envoyes: number; demandesTotal: number; devisObtenus: number; aTraiter: number; pasReponse: number; sansReponse10j: number; lastScanAt: string | null; demandes: Demande[] };
const AXA_ADDR = "achille.leboeuf@axa.fr";
const MILA_ADDR = "souscription@mila.fr";
const DR_META: Record<DevisReplyKind, { label: string; color: string; bg: string }> = {
  devis_obtenu: { label: "Devis obtenu", color: "#13762C", bg: "#EAF7EE" },
  traiter_manuel: { label: "À traiter manuellement", color: "#B4690E", bg: "#FDF0D5" },
  pas_de_reponse: { label: "Pas de réponse", color: "#8A1F2E", bg: "#FDECEA" },
  non_scanne: { label: "Non scanné", color: "#A2A1AF", bg: "#F7F7F8" },
};
type FieldKey = "prime" | "surface" | "periode" | "nature" | "activites" | "caracteristiques" | "proportion" | "pj";
type Volet2Row = { pipelineId: string; nom: string; adresse: string | null; passedAt: string; present: Record<FieldKey, boolean>; nb: number };
type Volet2 = { count: number; complets: number; taux: number; toFill: number; rows: Volet2Row[] };
const V2_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "prime", label: "Prime" }, { key: "surface", label: "Surface" }, { key: "periode", label: "Constr." }, { key: "nature", label: "Nature" },
  { key: "activites", label: "Activités" }, { key: "caracteristiques", label: "Caract." }, { key: "proportion", label: "Inoccupé" }, { key: "pj", label: "PJ" },
];

export function Devis5Controls({ data, toLoad, docHistory = [], noDocs = [], docsStats, volet2, suivi }: { data: Data; toLoad: number; docHistory?: DocHist[]; noDocs?: NoDoc[]; docsStats?: { rs: number; contrat: number }; volet2?: Volet2; suivi?: Suivi }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showSuivi, setShowSuivi] = useState(false);
  const [scanningR, setScanningR] = useState(false);
  const [scanProg, setScanProg] = useState<{ done: number; total: number } | null>(null);

  async function scanReplies() {
    if (!suivi) return;
    setScanningR(true);
    setScanProg({ done: 0, total: 0 });
    let offset = 0, scanned = 0;
    try {
      for (;;) {
        const res = await fetch("/api/devis5/scan-replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, limit: 20 }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
        const d = await res.json();
        offset = d.nextOffset; scanned += d.scanned;
        setScanProg({ done: scanned, total: d.total });
        if (d.done) break;
      }
      toast.success(`Scan terminé — ${scanned} demande(s) analysée(s).`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec du scan"); } finally { setScanningR(false); }
  }

  async function confirmReply(eventId: string, kind: DevisReplyKind) {
    try {
      const res = await fetch("/api/devis5/confirm-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, kind }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      toast.success("Statut confirmé.");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); }
  }
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; created: number } | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [passing, setPassing] = useState(false);
  const [showV2, setShowV2] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extProg, setExtProg] = useState<{ done: number; total: number; filled: number } | null>(null);
  const [onlyIncomplet2, setOnlyIncomplet2] = useState(false);
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

  async function passToVolet2() {
    if (data.prets === 0) return;
    setPassing(true);
    try {
      const res = await fetch("/api/devis5/pass-to-volet2", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const d = await res.json();
      toast.success(`${d.passed} dossier(s) complet(s) passé(s) au volet 2.`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec du passage"); } finally { setPassing(false); }
  }

  async function extractInfos(onlyFive: boolean) {
    if (!volet2 || volet2.toFill === 0) return;
    setExtracting(true);
    setExtProg({ done: 0, total: onlyFive ? Math.min(5, volet2.toFill) : volet2.toFill, filled: 0 });
    let offset = 0, filled = 0, processed = 0;
    try {
      for (;;) {
        const res = await fetch("/api/devis5/extract-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, limit: 5 }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
        const d = await res.json();
        offset = d.nextOffset; filled += d.filled; processed += d.processed;
        setExtProg({ done: processed, total: onlyFive ? Math.min(5, d.total) : d.total, filled });
        if (d.done || onlyFive) break;
      }
      toast.success(`${filled} info(s) complétée(s) sur ${processed} dossier(s).`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'extraction"); } finally { setExtracting(false); }
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

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => setOpen((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {open ? "▾" : "▸"} Parcourir les {data.total} dossiers ({data.docsManquants} avec docs manquants — à traiter à la main)
        </button>
        <button onClick={() => router.refresh()} title="Rafraîchir — met à jour les statuts RS/contrat (prêts / manquants)" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#656576", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}><RefreshCw size={13} /> Rafraîchir</button>
      </div>

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

      {/* Passage des dossiers complets (RS + contrat) au volet 2 */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F1F4", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={passToVolet2}
          disabled={passing || data.prets === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: data.prets === 0 ? "#A9D9B8" : "#13762C", border: "none", borderRadius: 8, padding: "8px 14px", cursor: passing || data.prets === 0 ? "default" : "pointer" }}
        >
          {passing ? <Loader2 size={15} className="animate-spin" /> : <span style={{ fontSize: 15 }}>→</span>} Passer les {data.prets} dossiers complets au volet 2
        </button>
        <span style={{ fontSize: 11.5, color: "#A2A1AF" }}>Un dossier est complet quand il a le RS <strong>et</strong> le contrat MRI. Il quitte alors le volet 1.</span>
      </div>

      {/* ── Volet 2 — Récupération des infos nécessaires aux devis ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 2</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Récupération des infos nécessaires aux devis</span>
        </div>
        <p style={{ fontSize: 12.5, color: "#656576", margin: "0 0 12px" }}>
          Les 8 informations exigées par les assureurs pour chiffrer. « Compléter » les lit dans le <strong>contrat MRI</strong> (IA) et remplit <strong>uniquement les champs vides</strong> — jamais d&apos;écrasement d&apos;une saisie. Le reste se complète à la main sur la fiche.
        </p>

        {!volet2 || volet2.count === 0 ? (
          <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier dans le volet 2. Utilise « → Passer les dossiers complets au volet 2 » ci-dessus.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#4E49FC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{volet2.count}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>dossiers en volet 2</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{volet2.complets}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>complets (8/8)</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: volet2.toFill > 0 ? "#B4690E" : "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{volet2.toFill}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>incomplets</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{volet2.taux}%</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>taux de complétion</div></div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <button onClick={() => extractInfos(false)} disabled={extracting || volet2.toFill === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: volet2.toFill === 0 ? "#B7B6E6" : "#4E49FC", border: "none", borderRadius: 8, padding: "8px 14px", cursor: extracting || volet2.toFill === 0 ? "default" : "pointer" }}>
                {extracting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Compléter les infos des {volet2.toFill} dossiers
              </button>
              <button onClick={() => extractInfos(true)} disabled={extracting || volet2.toFill === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#4E49FC", background: "#F5F5FF", border: "1px solid #D9D9F5", borderRadius: 8, padding: "8px 14px", cursor: extracting || volet2.toFill === 0 ? "default" : "pointer" }}>
                {extracting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Compléter {Math.min(5, volet2.toFill)} dossiers
              </button>
              <button onClick={() => router.refresh()} title="Rafraîchir la complétion (après saisie manuelle sur les fiches)" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#656576", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}><RefreshCw size={13} /> Rafraîchir</button>
            </div>
            {extracting && extProg && (
              <div style={{ margin: "4px 0 10px", maxWidth: 460 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#656576", marginBottom: 4 }}>
                  <span>Lecture des contrats MRI… <strong style={{ color: "#13762C" }}>{extProg.filled}</strong> info(s) complétée(s)</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{extProg.done} / {extProg.total}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#E8E8EC", overflow: "hidden" }}>
                  <div style={{ width: `${extProg.total ? Math.round((extProg.done / extProg.total) * 100) : 0}%`, height: "100%", background: "#4E49FC", transition: "width 200ms" }} />
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <button onClick={() => setShowV2((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {showV2 ? "▾" : "▸"} Détail par dossier ({volet2.count})
              </button>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#B4690E", cursor: "pointer" }}>
                <input type="checkbox" checked={onlyIncomplet2} onChange={(e) => setOnlyIncomplet2(e.target.checked)} /> Incomplets seulement ({volet2.toFill})
              </label>
            </div>
            {showV2 && (
              <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                      <th style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Copropriété</th>
                      <th style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", textAlign: "center" }}>Compl.</th>
                      {V2_FIELDS.map((f) => (
                        <th key={f.key} style={{ padding: "7px 6px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", textAlign: "center", whiteSpace: "nowrap" }}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {volet2.rows.filter((r) => !onlyIncomplet2 || r.nb < 8).map((r) => (
                      <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: r.nb < 8 ? "#FFFBF3" : undefined }}>
                        <td style={{ padding: "6px 10px" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                        <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: r.nb === 8 ? "#13762C" : "#B4690E", whiteSpace: "nowrap" }}>{r.nb}/8</td>
                        {V2_FIELDS.map((f) => (
                          <td key={f.key} style={{ padding: "6px 6px", textAlign: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: r.present[f.key] ? "#13762C" : "#CA1E12" }}>{r.present[f.key] ? "✓" : "✗"}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                    {volet2.rows.filter((r) => !onlyIncomplet2 || r.nb < 8).length === 0 && (
                      <tr><td colSpan={2 + V2_FIELDS.length} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {volet2.complets > 0 && (
              <p style={{ fontSize: 11.5, color: "#13762C", margin: "8px 0 0" }}>✓ {volet2.complets} dossier{volet2.complets > 1 ? "s" : ""} complet{volet2.complets > 1 ? "s" : ""} — prêt{volet2.complets > 1 ? "s" : ""} pour le volet 3 (envoi).</p>
            )}
          </>
        )}
      </div>

      {/* ── Volet 3 — placeholder ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 3</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Prévisualisation &amp; envoi des mails aux assureurs</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>Contenu à venir</span>
        </div>
        <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>À construire : validation rapide des brouillons (AXA / Mila) par dossier puis envoi en masse.</p>
      </div>

      {/* ── Volet 4 — Suivi des demandes de devis ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 4</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Suivi des demandes de devis</span>
        </div>
        {!suivi || suivi.envoyes === 0 ? (
          <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucune demande de devis envoyée pour l&apos;instant.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12 }}>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#4E49FC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.envoyes}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>dossiers avec devis envoyé</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.demandesTotal}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>demandes (AXA + Mila)</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.devisObtenus}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>devis obtenus</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: suivi.aTraiter > 0 ? "#B4690E" : "#26262C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.aTraiter}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>à traiter manuellement</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: suivi.sansReponse10j > 0 ? "#CA1E12" : "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.sansReponse10j}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>sans réponse ≥ 10 j</div></div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <button onClick={scanReplies} disabled={scanningR}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: "#4E49FC", border: "none", borderRadius: 8, padding: "8px 14px", cursor: scanningR ? "default" : "pointer" }}>
                {scanningR ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Détecter les réponses (AXA / Mila)
              </button>
              <button onClick={() => setShowSuivi((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{showSuivi ? "▾ masquer" : `▸ détail des ${suivi.demandesTotal} demandes`}</button>
              {suivi.lastScanAt && <span style={{ fontSize: 11.5, color: "#A2A1AF" }}>dernier scan {new Date(suivi.lastScanAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            {scanningR && scanProg && (
              <div style={{ margin: "2px 0 10px", maxWidth: 420 }}>
                <div style={{ fontSize: 12, color: "#656576", marginBottom: 4 }}>Scan Front… {scanProg.done}{scanProg.total ? ` / ${scanProg.total}` : ""}</div>
                <div style={{ height: 8, borderRadius: 999, background: "#E8E8EC", overflow: "hidden" }}><div style={{ width: `${scanProg.total ? Math.round((scanProg.done / scanProg.total) * 100) : 10}%`, height: "100%", background: "#4E49FC", transition: "width 200ms" }} /></div>
              </div>
            )}
            <p style={{ fontSize: 11.5, color: "#A2A1AF", margin: "0 0 8px" }}>Le détecteur ne lit que les conversations avec <strong>{AXA_ADDR}</strong> (AXA) et <strong>{MILA_ADDR}</strong> (Mila). Le statut proposé est modifiable/confirmable au menu déroulant.</p>

            {showSuivi && (
              <div style={{ maxHeight: 460, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                      {["Copropriété", "Assureur", "Envoyé", "Depuis", "Statut", "Front"].map((h) => (
                        <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suivi.demandes.map((d) => (
                      <tr key={d.eventId} style={{ borderTop: "1px solid #F1F1F4", background: d.replyKind === "devis_obtenu" ? "#F4FBF6" : (d.replyKind === "pas_de_reponse" && d.jours >= 10) ? "#FDECEA" : undefined }}>
                        <td style={{ padding: "6px 10px" }}><a href={`/pipeline/${d.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{d.adresse || d.nom}</a></td>
                        <td style={{ padding: "6px 10px", color: "#656576", whiteSpace: "nowrap" }}>{d.assureur}</td>
                        <td style={{ padding: "6px 10px", color: "#656576", whiteSpace: "nowrap" }}>{new Date(d.sentAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 600, color: d.jours >= 10 ? "#CA1E12" : "#656576" }}>J+{d.jours}</td>
                        <td style={{ padding: "6px 10px" }}>
                          {d.scanEligible ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <select value={d.replyKind === "non_scanne" ? "" : d.replyKind}
                                onChange={(e) => confirmReply(d.eventId, e.target.value as DevisReplyKind)}
                                title={d.replySnippet ?? undefined}
                                style={{ fontSize: 11.5, fontWeight: 600, border: `1px solid ${DR_META[d.replyKind].bg}`, borderRadius: 8, padding: "4px 6px", background: DR_META[d.replyKind].bg, color: DR_META[d.replyKind].color, cursor: "pointer" }}>
                                <option value="" disabled>— à définir —</option>
                                <option value="devis_obtenu">Devis obtenu</option>
                                <option value="traiter_manuel">À traiter manuellement</option>
                                <option value="pas_de_reponse">Pas de réponse</option>
                              </select>
                              {d.replyConfirmed && <span title="Confirmé à la main" style={{ fontSize: 11, color: "#13762C" }}>✓</span>}
                            </div>
                          ) : <span style={{ fontSize: 11, color: "#A2A1AF" }} title={d.to ?? undefined}>hors périmètre</span>}
                        </td>
                        <td style={{ padding: "6px 10px" }}>{d.convUrl ? <a href={d.convUrl} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>↗</a> : <span style={{ color: "#A2A1AF" }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
