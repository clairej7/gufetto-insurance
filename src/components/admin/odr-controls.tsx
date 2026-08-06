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
type DedupState = "idle" | "checking" | "ok" | "dups";

function PartnerRow({ p, sentCount }: { p: OdrPartnerSummary; sentCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [includeFlagged, setIncludeFlagged] = useState(true);
  const [sending, setSending] = useState(false);

  const [dedup, setDedup] = useState<DedupState>("idle");
  const [dups, setDups] = useState<Dup[]>([]);

  const count = p.ready + (includeFlagged ? p.flaggedReady : 0);
  const pdfUrl = `/api/odr/pdf?partner=${p.key}${includeFlagged ? "&includeFlagged=1" : ""}`;
  const noReady = count === 0;

  // Toute modif du périmètre (flaggés) ré-arme la vérification.
  function setFlagged(v: boolean) {
    setIncludeFlagged(v);
    setDedup("idle");
    setDups([]);
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
          <Button size="sm" className="gap-1.5" disabled={noReady} onClick={() => setOpen((v) => !v)}>
            <Send className="h-3.5 w-3.5" /> {open ? "Fermer" : "Prévisualiser & envoyer"}
          </Button>
        </div>
      </div>

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

          {/* Contrôle anti-doublon — obligatoire avant l'envoi */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={dedup === "checking" || sending} onClick={verify}>
              {dedup === "dups" || dedup === "ok" ? <RefreshCw className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {dedup === "checking" ? "Vérification…" : dedup === "idle" ? "Vérifier l'absence de doublon" : "Régénérer la vérification"}
            </Button>
            {dedup === "ok" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#13762C" }}>
                <ShieldCheck className="h-4 w-4" /> Aucun doublon — {count} à envoyer
              </span>
            )}
            {dedup === "dups" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#CA1E12" }}>
                <ShieldAlert className="h-4 w-4" /> {dups.length} doublon{dups.length > 1 ? "s" : ""} — envoi bloqué
              </span>
            )}
          </div>

          {dedup === "dups" && dups.length > 0 && (
            <div style={{ border: "1px solid #F3C2BE", background: "#FFF5F5", borderRadius: 8, padding: "10px 12px", maxHeight: 200, overflowY: "auto" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#CA1E12", marginBottom: 6 }}>
                Doublons avec des ODR déjà envoyés (à retirer avant d&apos;envoyer) :
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

          {/* Envoi — vert si vérif OK, rouge/bloqué si doublons, gris tant que non vérifié */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <span style={{ fontSize: 12, color: "#A2A1AF" }}>→ passage en « ODR envoyées »</span>
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
