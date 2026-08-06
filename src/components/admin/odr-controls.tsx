"use client";

// Contrôles admin — Automatisation 2 (ODR). Par assureur : export CSV, preview PDF
// (cachet Matera), contrôle ANTI-DOUBLON obligatoire, puis envoi Front (1 mail/assureur,
// PDF joint) → passage en « ODR envoyées ». Option : inclure les ex-flaggés re-vérifiés.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Send, ChevronDown, AlertTriangle, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type OdrPartnerSummary = {
  key: "AXA" | "GENERALI" | "SADA" | "MILA";
  label: string;
  ready: number;
  missing: number;
  flagged: number;
  flaggedReady: number;
};
type SentRow = { adresse: string; numeroContrat: string };
type Dup = { pipelineId: string; nom: string; numeroContrat: string | null; against: string; by: "numero" | "adresse" };
type Issue = { pipelineId: string; nom: string; numeroContrat: string | null; assureur: string | null; issues: string[] };
type DedupState = "idle" | "checking" | "ok" | "dups";
type CohState = "idle" | "checking" | "ok" | "issues";

function PartnerRow({ p, sentCount }: { p: OdrPartnerSummary; sentCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [includeFlagged, setIncludeFlagged] = useState(true);
  const [sending, setSending] = useState(false);

  const [dedup, setDedup] = useState<DedupState>("idle");
  const [dups, setDups] = useState<Dup[]>([]);
  const [coh, setCoh] = useState<CohState>("idle");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [unflagged, setUnflagged] = useState(0);
  const [cohProgress, setCohProgress] = useState({ done: 0, total: 0 });

  const count = p.ready + (includeFlagged ? p.flaggedReady : 0);
  const pdfUrl = `/api/odr/pdf?partner=${p.key}${includeFlagged ? "&includeFlagged=1" : ""}`;
  const noReady = count === 0;

  // Toute modif du périmètre (flaggés) ré-arme les deux vérifications.
  function setFlagged(v: boolean) {
    setIncludeFlagged(v);
    setDedup("idle");
    setDups([]);
    setCoh("idle");
    setIssues([]);
  }

  // Vérification de cohérence des dossiers (assureur ↔ partenaire, n°) → débloque
  // le bouton « Prévisualiser & envoyer ».
  // Re-lecture Front par dossier → coûteux → on boucle par tranche (chunks) avec progression.
  async function verifyDossiers() {
    setCoh("checking");
    setCohProgress({ done: 0, total: 0 });
    const allIssues: Issue[] = [];
    let totalUnflagged = 0;
    let offset = 0;
    try {
      for (;;) {
        const res = await fetch("/api/odr/coherence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partner: p.key, offset, limit: 8 }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
        allIssues.push(...(j.issues || []));
        totalUnflagged += j.unflagged || 0;
        offset += j.count || 0;
        setCohProgress({ done: offset, total: j.total || 0 });
        if (j.done || (j.count ?? 0) === 0) break;
      }
      setIssues(allIssues);
      setUnflagged(totalUnflagged);
      setCoh(allIssues.length === 0 ? "ok" : "issues");
      if (totalUnflagged > 0) {
        toast.success(`${totalUnflagged} dossier(s) confirmé(s) — retiré(s) des flaggés.`);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de vérification");
      setCoh("idle");
    }
  }

  async function verify() {
    setDedup("checking");
    try {
      const res = await fetch(`/api/odr/dedup?partner=${p.key}${includeFlagged ? "&includeFlagged=1" : ""}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      setDups(j.duplicates || []);
      setDedup(j.ok ? "ok" : "dups");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de vérification");
      setDedup("idle");
    }
  }

  async function send() {
    if (dedup !== "ok") return;
    if (!to.trim()) return toast.error("Renseigne le mail destinataire");
    if (!window.confirm(`Envoyer l'ordre de remplacement à ${p.label} (${to}) pour ${count} contrat${count > 1 ? "s" : ""} ?\nLes dossiers passeront en « ODR envoyées ».`)) return;
    setSending(true);
    try {
      const res = await fetch("/api/odr/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner: p.key, to: to.trim(), subject: subject.trim() || undefined, includeFlagged }),
      });
      const j = await res.json();
      if (res.status === 409 && j.duplicates) {
        setDups(j.duplicates);
        setDedup("dups");
        throw new Error("Doublons détectés — envoi bloqué.");
      }
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      if (j.fallback && j.mailtoUrl) {
        window.open(j.mailtoUrl, "_blank");
        toast.success(`${j.sent} dossier(s) → « ODR envoyées » (Front non configuré : mail ouvert).`);
      } else {
        toast.success(`ODR envoyé à ${p.label} : ${j.sent} contrat(s) → « ODR envoyées ».`);
      }
      setOpen(false);
      setTo("");
      setDedup("idle");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  }

  // Les 2 boutons « Vérifier » sont bleus ; le résultat (vert/rouge) s'affiche
  // dans les bandeaux de statut sous la ligne. Un liseré vert quand la vérif est OK.
  const BLUE = { background: "#4E49FC", borderColor: "#4E49FC", color: "#fff" } as const;
  const bothOk = coh === "ok" && dedup === "ok";

  return (
    <div style={{ border: "1px solid #E8E8EC", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C", minWidth: 72 }}>{p.label}</span>
        <span style={{ fontSize: 13, color: "#4E4E58", flex: 1, minWidth: 200 }}>
          <strong style={{ color: "#13762C" }}>{p.ready}</strong> prêt{p.ready > 1 ? "s" : ""}
          {" · "}
          <span style={{ color: p.missing ? "#955804" : "#A2A1AF" }}>{p.missing} sans n°</span>
          {" · "}
          <span style={{ color: p.flagged ? "#CA1E12" : "#A2A1AF" }}>{p.flagged} flaggé{p.flagged > 1 ? "s" : ""}</span>
          {" · "}
          <span style={{ color: "#A2A1AF" }}>{sentCount} déjà envoyés</span>
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <a href={`/api/odr/export?partner=${p.key}&kind=ready`} style={{ textDecoration: "none", pointerEvents: p.ready ? "auto" : "none", opacity: p.ready ? 1 : 0.4 }}>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!p.ready}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </Button>
          </a>
          {p.missing > 0 && (
            <a href={`/api/odr/export?partner=${p.key}&kind=missing`} style={{ textDecoration: "none" }}>
              <Button variant="outline" size="sm" className="gap-1.5" style={{ color: "#955804", borderColor: "#F5D9A8" }}>
                <AlertTriangle className="h-3.5 w-3.5" /> Sans n°
              </Button>
            </a>
          )}
          {/* 1) Vérifier les dossiers (re-lecture Front + cohérence) — bleu */}
          <Button size="sm" className="gap-1.5" disabled={noReady || coh === "checking" || sending} onClick={verifyDossiers}
            style={{ ...BLUE, boxShadow: coh === "ok" ? "inset 0 0 0 2px #16A34A" : undefined }}>
            {coh === "checking" ? <RefreshCw className="h-3.5 w-3.5" /> : coh === "ok" ? <ShieldCheck className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {coh === "checking"
              ? `Vérification… ${cohProgress.total ? `${cohProgress.done}/${cohProgress.total}` : ""}`
              : coh === "idle" ? "Vérifier les dossiers" : "Revérifier les dossiers"}
          </Button>
          {/* 2) Vérifier les doublons — bleu */}
          <Button size="sm" className="gap-1.5" disabled={noReady || dedup === "checking" || sending} onClick={verify}
            style={{ ...BLUE, boxShadow: dedup === "ok" ? "inset 0 0 0 2px #16A34A" : undefined }}>
            {dedup === "checking" ? <RefreshCw className="h-3.5 w-3.5" /> : dedup === "ok" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {dedup === "checking" ? "Vérification…" : dedup === "idle" ? "Vérifier les doublons" : "Régénérer la vérification"}
          </Button>
          {/* 3) Prévisualiser & envoyer — cliquable/vert seulement quand les 2 vérifs sont OK */}
          <Button size="sm" className="gap-1.5" disabled={noReady || !bothOk} onClick={() => setOpen((v) => !v)}
            style={bothOk ? { background: "#16A34A", borderColor: "#16A34A", color: "#fff" } : {}}>
            <Send className="h-3.5 w-3.5" /> {open ? "Fermer" : "Prévisualiser & envoyer"}
          </Button>
        </div>
      </div>

      {/* Statut de la vérification des dossiers (cohérence) */}
      {coh === "ok" && (
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#13762C" }}>
          <FileText className="h-4 w-4" /> Dossiers vérifiés — assureur &amp; n° cohérents avec {p.label}
          {unflagged > 0 ? ` · ${unflagged} ex-flaggé${unflagged > 1 ? "s" : ""} confirmé${unflagged > 1 ? "s" : ""} et déflaggé${unflagged > 1 ? "s" : ""}` : ""}. « Prévisualiser &amp; envoyer » débloqué.
        </div>
      )}
      {coh === "issues" && issues.length > 0 && (
        <div style={{ marginTop: 10, border: "1px solid #F5D9A8", background: "#FFF7EB", borderRadius: 8, padding: "10px 12px", maxHeight: 220, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#955804", marginBottom: 6 }}>
            <AlertTriangle className="h-4 w-4" /> {issues.length} dossier{issues.length > 1 ? "s" : ""} avec incohérence — à corriger puis revérifier :
          </div>
          {issues.map((it) => (
            <div key={it.pipelineId} style={{ fontSize: 12.5, color: "#4E4E58", padding: "2px 0" }}>
              <a href={`/pipeline/${it.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "underline" }}>{it.nom}</a>
              <span style={{ marginLeft: 6, color: "#955804" }}>{it.issues.join(" ; ")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Statut de la vérification + liste des doublons */}
      {dedup === "ok" && (
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#13762C" }}>
          <ShieldCheck className="h-4 w-4" /> Aucun doublon — {count} contrat{count > 1 ? "s" : ""} prêt{count > 1 ? "s" : ""} à envoyer.
        </div>
      )}
      {dedup === "dups" && dups.length > 0 && (
        <div style={{ marginTop: 10, border: "1px solid #F3C2BE", background: "#FFF5F5", borderRadius: 8, padding: "10px 12px", maxHeight: 220, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#CA1E12", marginBottom: 6 }}>
            <ShieldAlert className="h-4 w-4" /> {dups.length} doublon{dups.length > 1 ? "s" : ""} avec des ODR déjà envoyés — envoi bloqué, à retirer puis régénérer :
          </div>
          {dups.map((d) => (
            <div key={d.pipelineId} style={{ fontSize: 12.5, color: "#4E4E58", padding: "2px 0" }}>
              <a href={`/pipeline/${d.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "underline" }}>{d.nom}</a>
              {" ↔ "}<span style={{ color: "#8A8A99" }}>{d.against}</span>
              <span style={{ marginLeft: 6, fontSize: 11, color: "#A2A1AF" }}>({d.by === "numero" ? "n° contrat" : "adresse"})</span>
            </div>
          ))}
        </div>
      )}

      {open && !noReady && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #E8E8EC", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input type="email" placeholder={`Mail contact ODR ${p.label}`} value={to} disabled={sending}
              onChange={(e) => setTo(e.target.value)} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: "#E8E8EC", minWidth: 240 }} />
            <input type="text" placeholder="Objet (optionnel)" value={subject} disabled={sending}
              onChange={(e) => setSubject(e.target.value)} className="rounded-md border px-2 py-1 text-sm" style={{ borderColor: "#E8E8EC", minWidth: 220, flex: 1 }} />
            {p.flagged > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#4E4E58" }}>
                <input type="checkbox" checked={includeFlagged} disabled={sending} onChange={(e) => setFlagged(e.target.checked)} />
                Inclure {p.flaggedReady} ex-flaggé{p.flaggedReady > 1 ? "s" : ""}
              </label>
            )}
          </div>

          <div style={{ fontSize: 12, color: "#A2A1AF" }}>
            Aperçu ({count} contrat{count > 1 ? "s" : ""}, cachet Matera inclus).{" "}
            <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "underline" }}>ouvrir dans un onglet</a>
          </div>
          <iframe key={pdfUrl} src={pdfUrl} title={`Aperçu ODR ${p.label}`}
            style={{ width: "100%", height: 380, border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff" }} />

          {/* Envoi — actif/vert seulement si la vérif anti-doublon est passée */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {dedup === "ok" ? (
              <Button size="sm" onClick={send} disabled={sending} className="gap-1.5"
                style={{ background: "#16A34A", borderColor: "#16A34A", color: "#fff" }}>
                <Send className="h-3.5 w-3.5" />
                {sending ? "Envoi…" : `Envoyer via Front (${count})`}
              </Button>
            ) : (
              <Button size="sm" disabled className="gap-1.5"
                style={dedup === "dups" ? { background: "#FBE9E7", borderColor: "#F3C2BE", color: "#CA1E12" } : {}}>
                <Send className="h-3.5 w-3.5" />
                {dedup === "dups" ? "Envoi bloqué (doublons)" : "Vérifie les doublons d'abord"}
              </Button>
            )}
            <span style={{ fontSize: 12, color: "#A2A1AF" }}>
              {dedup === "ok" ? "→ passage en « ODR envoyées »" : "Lance « Vérifier les doublons » pour débloquer l'envoi"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SentTable({ label, rows }: { label: string; rows: SentRow[] }) {
  return (
    <details style={{ border: "1px solid #E8E8EC", borderRadius: 8, overflow: "hidden" }}>
      <summary style={{ cursor: "pointer", padding: "8px 12px", background: "#FAFAFC", fontSize: 12.5, fontWeight: 600, color: "#26262C", listStyle: "none" }}>
        {label} — {rows.length} ODR déjà envoyé{rows.length > 1 ? "s" : ""}
      </summary>
      {rows.length > 0 ? (
        <div style={{ maxHeight: 260, overflowY: "auto", borderTop: "1px solid #E8E8EC" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#A2A1AF", textAlign: "left" }}>
                <th style={{ padding: "6px 12px", fontWeight: 600 }}>Adresse</th>
                <th style={{ padding: "6px 12px", fontWeight: 600 }}>Numéro de contrat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #F1F1F4" }}>
                  <td style={{ padding: "5px 12px", color: "#4E4E58" }}>{r.adresse}</td>
                  <td style={{ padding: "5px 12px", color: "#4E4E58", fontFamily: "ui-monospace, Menlo, monospace" }}>{r.numeroContrat || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: "10px 12px", fontSize: 12, color: "#A2A1AF", borderTop: "1px solid #E8E8EC" }}>
          Aucun ODR déjà envoyé stocké pour cet assureur.
        </div>
      )}
    </details>
  );
}

export function OdrControls({ template, partners, sent }: { template: string; partners: OdrPartnerSummary[]; sent: Record<string, SentRow[]> }) {
  const [showTpl, setShowTpl] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const totalReady = partners.reduce((s, p) => s + p.ready, 0);
  const totalMissing = partners.reduce((s, p) => s + p.missing, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: "#656576", margin: 0 }}>
        {totalReady} dossier{totalReady > 1 ? "s" : ""} ODR prêt{totalReady > 1 ? "s" : ""} à envoyer (avec n° de contrat)
        {totalMissing > 0 && <> · <span style={{ color: "#955804" }}>{totalMissing} bien en ODR mais sans n° à compléter</span></>}.
      </p>

      {/* Template consultable */}
      <div style={{ border: "1px solid #E8E8EC", borderRadius: 10, overflow: "hidden" }}>
        <button onClick={() => setShowTpl((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#FAFAFC", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#26262C" }}>
          <ChevronDown className="h-4 w-4" style={{ transform: showTpl ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
          Template ODR
        </button>
        {showTpl && (
          <pre style={{ margin: 0, padding: "14px 16px", fontSize: 12.5, lineHeight: "18px", color: "#4E4E58", whiteSpace: "pre-wrap", fontFamily: "ui-sans-serif, system-ui, sans-serif", borderTop: "1px solid #E8E8EC" }}>
            {template}
          </pre>
        )}
      </div>

      {/* ODR déjà envoyées (référence anti-doublon) */}
      <div style={{ border: "1px solid #E8E8EC", borderRadius: 10, overflow: "hidden" }}>
        <button onClick={() => setShowSent((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#FAFAFC", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#26262C" }}>
          <ChevronDown className="h-4 w-4" style={{ transform: showSent ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
          ODR déjà envoyées (référence anti-doublon)
        </button>
        {showSent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderTop: "1px solid #E8E8EC" }}>
            {partners.map((p) => (
              <SentTable key={p.key} label={p.label} rows={sent[p.key] || []} />
            ))}
          </div>
        )}
      </div>

      {/* Une ligne par assureur */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {partners.map((p) => (
          <PartnerRow key={p.key} p={p} sentCount={(sent[p.key] || []).length} />
        ))}
      </div>
    </div>
  );
}
