"use client";

// Automatisation 6 « Comparer les devis & préparer le mail au CS ».
// Suivi en UN SEUL tableau filtrable (remplace les 3 anciens volets), calqué sur
// le grand tableau de suivi manuel : recherche dossier, filtre gestionnaire,
// prix actuel (dernière prime payée récupérée via Front), prix des devis, et un
// bouton « Générer la comparaison » qui rejoue la comparaison Claude des fiches.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, RefreshCw, Sparkles, ExternalLink, Send, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { resolvePrimeReference } from "@/lib/devis-prime";

type Devis = { assureur: string; prime: number | null };
type Statut = "non_envoye" | "attente" | "valide" | "refus";
type Row = {
  pipelineId: string; nom: string; adresse: string | null;
  gestionnaire: string | null; gestionnaireEmail: string | null;
  comparaisonFaite: boolean; statut: Statut; statutComment: string | null; envoyeLe: string | null; contratPrime: number | null;
  devis1: Devis | null; devis2: Devis | null;
};
type Table = { total: number; faites: number; rows: Row[]; gestionnaires: string[] };

// Statut de réponse du gestionnaire (alimenté plus tard par un détecteur).
const STATUT: Record<Statut, { label: string; color: string; bg: string; border: string }> = {
  non_envoye: { label: "–", color: "#A2A1AF", bg: "#F7F7F8", border: "#E8E8EC" },
  attente: { label: "Attente", color: "#B4690E", bg: "#FDF0D5", border: "#F3D9A6" },
  valide: { label: "Validé !", color: "#13762C", bg: "#EAF7EE", border: "#B7E4C4" },
  refus: { label: "Refus", color: "#CA1E12", bg: "#FDECEA", border: "#F4A9A0" },
};

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
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [statutBusy, setStatutBusy] = useState<string | null>(null);
  const [sending7, setSending7] = useState(false);
  const prets = table.rows.filter((r) => r.statut === "valide").length;
  const aComparer = table.rows.filter((r) => !r.comparaisonFaite).length;
  const [genBatch, setGenBatch] = useState<{ running: boolean; done: number; total: number; ok: number; fail: number } | null>(null);

  // Auto-refresh : les réponses des gestionnaires arrivent depuis une autre page
  // (encart /valider-devis) → ce tableau, rendu au chargement, ne le sait pas. On
  // re-fetch périodiquement (45 s) et au retour de focus, en pause quand l'onglet
  // est masqué. router.refresh() rafraîchit les données serveur sans réinitialiser
  // les filtres locaux (l'état client est conservé).
  useEffect(() => {
    const refreshIfVisible = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = window.setInterval(refreshIfVisible, 45000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [router]);

  async function genererToutes() {
    const targets = table.rows.filter((r) => !r.comparaisonFaite).map((r) => r.pipelineId);
    if (!targets.length) return;
    setGenBatch({ running: true, done: 0, total: targets.length, ok: 0, fail: 0 });
    let ok = 0, fail = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        const res = await fetch("/api/devis6/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId: targets[i] }) });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean };
        if (res.ok && j.success) ok++; else fail++;
      } catch { fail++; }
      setGenBatch({ running: true, done: i + 1, total: targets.length, ok, fail });
    }
    setGenBatch({ running: false, done: targets.length, total: targets.length, ok, fail });
    toast.success(`${ok} comparaison(s) générée(s)${fail ? ` · ${fail} sans devis stocké / échec` : ""}.`);
    router.refresh();
  }

  async function envoyerAuto7() {
    if (prets === 0) return;
    setSending7(true);
    try {
      const res = await fetch("/api/devis6/send-to-auto7", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; moved?: number; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`${j.moved ?? 0} dossier(s) envoyé(s) à l'automatisation 7.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setSending7(false);
    }
  }
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

  async function envoyer(pipelineId: string) {
    setEnvoi(pipelineId);
    try {
      const res = await fetch("/api/devis6/notify-gestionnaire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId }) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success("Message posté dans le canal Slack.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi Slack");
    } finally {
      setEnvoi(null);
    }
  }

  // Mise à jour manuelle du statut (transmission/validation faite à la main).
  async function setStatut(pipelineId: string, statut: "attente" | "valide" | "refus") {
    setStatutBusy(pipelineId);
    try {
      const res = await fetch("/api/devis6/set-statut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId, statut }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; advanced?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Échec");
      toast.success(statut === "valide" ? "Validé par le gestionnaire → passé en Validation du CS (auto 7)." : statut === "refus" ? "Marqué refusé." : "Marqué transmis au gestionnaire.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setStatutBusy(null);
    }
  }

  const rows = table.rows
    .filter((r) => !q.trim() || `${r.adresse ?? ""} ${r.nom}`.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((r) => !gest || r.gestionnaire === gest)
    .filter((r) => compFilter === "tous" || (compFilter === "oui" ? r.comparaisonFaite : !r.comparaisonFaite));

  // Prix actuel = MÊME règle que la fiche : resolvePrimeReference(contrat, dernière
  // prime payée) → garde le + haut dans la bande de cohérence, bloque les écarts
  // anormaux. Tag : C = prime du contrat, DP = dernière prime payée.
  type Res = ReturnType<typeof resolvePrimeReference>;
  const prixInner = (res: Res, loading: boolean) => {
    if (res.flag === "bloque")
      return <span title={`Écart anormal (contrat ${fmtE(res.contrat)} vs dernière prime payée ${fmtE(res.primePayee)}) — à vérifier sur la fiche`} style={{ color: "#CA1E12", fontWeight: 700 }}>{fmtE(res.contrat)} ⚠</span>;
    if (res.value == null)
      return loading ? <Loader2 size={13} className="animate-spin" style={{ color: "#A2A1AF" }} /> : <span style={{ color: "#A2A1AF" }}>—</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
        {loading && <Loader2 size={11} className="animate-spin" style={{ color: "#C9C8D3" }} />}
        <strong style={{ color: "#26262C" }}>{fmtE(res.value)}</strong>
        <sup title={res.source === "prime" ? "dernière prime payée" : "prime du contrat"} style={{ fontSize: 9, color: "#A2A1AF", fontWeight: 700 }}>{res.source === "prime" ? "DP" : "C"}</sup>
      </span>
    );
  };
  // Cellule devis : prix en haut, nom de l'assureur juste en dessous.
  const devisCell = (d: Devis | null) => {
    if (!d) return <span style={{ color: "#A2A1AF" }}>—</span>;
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}>
        <strong style={{ color: "#26262C" }}>{fmtE(d.prime)}</strong>
        <span style={{ fontSize: 10, color: "#A2A1AF", fontWeight: 600 }}>{d.assureur}</span>
      </span>
    );
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      {/* Envoi par lot vers l'automatisation 7 (dossiers validés par le gestionnaire). */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={envoyerAuto7} disabled={prets === 0 || sending7}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#fff", background: prets === 0 ? "#A9D9B8" : sending7 ? "#5AA772" : "#13762C", border: "none", borderRadius: 10, padding: "9px 16px", cursor: prets === 0 || sending7 ? "default" : "pointer" }}>
          {sending7 ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Envoyer les {prets} dossier{prets > 1 ? "s" : ""} prêt{prets > 1 ? "s" : ""} à l&apos;automatisation 7
        </button>
        <span style={{ fontSize: 11.5, color: "#A2A1AF", marginLeft: 10 }}>Dossiers validés par le gestionnaire → passage en « Validation du CS » (auto 7).</span>
      </div>

      {/* Génération en masse des comparaisons manquantes (1 à 1, avec progression). */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={genererToutes} disabled={aComparer === 0 || genBatch?.running}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#fff", background: aComparer === 0 ? "#B8B5FD" : genBatch?.running ? "#7B77F5" : "#4E49FC", border: "none", borderRadius: 10, padding: "9px 16px", cursor: aComparer === 0 || genBatch?.running ? "default" : "pointer" }}>
          {genBatch?.running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {genBatch?.running ? `Génération… ${genBatch.done}/${genBatch.total}` : `Générer les ${aComparer} comparaison${aComparer > 1 ? "s" : ""}`}
        </button>
        <span style={{ fontSize: 11.5, color: "#A2A1AF", marginLeft: 10 }}>Comparaisons Claude des dossiers restants (celles sans devis stocké seront ignorées).</span>
        {(genBatch?.running || (genBatch && !genBatch.running)) && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, width: "100%", maxWidth: 420, overflow: "hidden", borderRadius: 999, background: "#EEE" }}>
              <div style={{ height: "100%", borderRadius: 999, transition: "width .2s", width: `${genBatch!.total ? Math.round((genBatch!.done / genBatch!.total) * 100) : 0}%`, background: "#4E49FC" }} />
            </div>
            <p style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>{genBatch!.done}/{genBatch!.total} · <b style={{ color: "#13762C" }}>{genBatch!.ok} générées</b>{genBatch!.fail ? ` · ${genBatch!.fail} ignorées (pas de devis stocké)` : ""}{genBatch!.running ? " · en cours…" : ""}</p>
          </div>
        )}
      </div>

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
              <th style={{ ...th, textAlign: "center" }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = prix[r.pipelineId];
              const res = resolvePrimeReference(r.contratPrime, st?.done ? st.montant : null);
              const prixVal = res.flag === "bloque" ? res.contrat : res.value;
              // Case la moins chère (Prix actuel / devis 1 / devis 2) → fond vert.
              const nums: [string, number][] = [];
              if (typeof prixVal === "number") nums.push(["actuel", prixVal]);
              if (typeof r.devis1?.prime === "number") nums.push(["d1", r.devis1.prime]);
              if (typeof r.devis2?.prime === "number") nums.push(["d2", r.devis2.prime]);
              const minKey = nums.length ? nums.reduce((a, b) => (b[1] < a[1] ? b : a))[0] : null;
              const GREEN = "#E7F7EC";
              const priceTd = (k: string): React.CSSProperties => ({ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", background: minKey === k ? GREEN : undefined });
              return (
              <tr key={r.pipelineId}>
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
                <td style={priceTd("actuel")}>{prixInner(res, !!st?.loading)}</td>
                <td style={priceTd("d1")}>{devisCell(r.devis1)}</td>
                <td style={priceTd("d2")}>{devisCell(r.devis2)}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => generer(r.pipelineId)} disabled={generating === r.pipelineId}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#fff", background: generating === r.pipelineId ? "#8784FD" : "#4E49FC", border: "none", borderRadius: 8, padding: "6px 10px", cursor: generating === r.pipelineId ? "default" : "pointer", whiteSpace: "nowrap" }}>
                    {generating === r.pipelineId ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {r.comparaisonFaite ? "Régénérer" : "Générer"}
                  </button>
                </td>
                <td style={{ ...td, color: "#656576", whiteSpace: "nowrap" }}>{r.gestionnaire || "—"}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  {r.envoyeLe ? (
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#13762C", background: "#EAF7EE", border: "1px solid #B7E4C4", borderRadius: 999, padding: "3px 11px", whiteSpace: "nowrap" }}>✓ Envoyé</span>
                      <span style={{ fontSize: 9.5, color: "#A2A1AF" }}>{new Date(r.envoyeLe).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                    </div>
                  ) : (
                    <button onClick={() => envoyer(r.pipelineId)} disabled={!r.comparaisonFaite || envoi === r.pipelineId}
                      title={r.comparaisonFaite ? "Poster le message des nouveaux devis dans le canal Slack" : "Génère d'abord la comparaison"}
                      style={r.comparaisonFaite
                        ? { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#fff", background: envoi === r.pipelineId ? "#7DA6C9" : "#0A6BB8", border: "none", borderRadius: 8, padding: "6px 10px", cursor: envoi === r.pipelineId ? "default" : "pointer", whiteSpace: "nowrap" }
                        : laterBtn}>
                      {envoi === r.pipelineId ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Envoyer
                    </button>
                  )}
                </td>
                <td style={{ ...td, textAlign: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {r.statutComment && <span title={`💬 ${r.statutComment}`} style={{ cursor: "help" }}>💬</span>}
                    {statutBusy === r.pipelineId ? <Loader2 size={12} className="animate-spin" /> : (
                      <select
                        value={r.statut === "non_envoye" ? "" : r.statut}
                        onChange={(e) => { const v = e.target.value; if (v === "attente" || v === "valide" || v === "refus") setStatut(r.pipelineId, v); }}
                        title="Mettre à jour le statut à la main (transmission / réponse du gestionnaire)"
                        style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 8px", cursor: "pointer",
                          color: r.statut === "non_envoye" ? "#656576" : STATUT[r.statut].color,
                          background: r.statut === "non_envoye" ? "#fff" : STATUT[r.statut].bg,
                          border: `1px solid ${r.statut === "non_envoye" ? "#E8E8EC" : STATUT[r.statut].border}` }}>
                        <option value="" disabled hidden>— statut —</option>
                        <option value="attente">Transmis au gestio</option>
                        <option value="valide">Validé par le gestio</option>
                        <option value="refus">Refusé</option>
                      </select>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#A2A1AF" }}>Aucun dossier ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: "#A2A1AF", margin: "8px 2px 0" }}>
        « Prix actuel » = même règle que la fiche : on garde le plus haut entre la prime du contrat (C) et la dernière prime payée (DP, mail de demande de devis), dans une bande de cohérence (écart anormal → ⚠ à vérifier sur la fiche). « Générer » rejoue la comparaison Claude des fiches sur les devis stockés ; le détail reste consultable sur la fiche.
      </p>
    </div>
  );
}
