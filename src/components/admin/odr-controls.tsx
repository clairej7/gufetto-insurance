"use client";

// Contrôles admin — Automatisation 2 (ODR). Par assureur : export CSV des ODR non
// encore envoyés (+ liste des dossiers sans n°), aperçu/preview de la lettre remplie
// (PDF avec cachet Matera), et envoi Front (1 mail/assureur, PDF joint) qui passe les
// dossiers en « ODR envoyées ». Option : inclure les ex-flaggés re-vérifiés.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Send, ChevronDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type OdrPartnerSummary = {
  key: "AXA" | "GENERALI" | "SADA" | "MILA";
  label: string;
  ready: number;
  missing: number;
  flagged: number;
  flaggedReady: number; // flaggés qui ont un n° (donc réintégrables)
};

function PartnerRow({ p }: { p: OdrPartnerSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [includeFlagged, setIncludeFlagged] = useState(true); // re-vérifiés → inclus par défaut
  const [sending, setSending] = useState(false);

  const count = p.ready + (includeFlagged ? p.flaggedReady : 0);
  const pdfUrl = `/api/odr/pdf?partner=${p.key}${includeFlagged ? "&includeFlagged=1" : ""}`;
  const noReady = count === 0;

  async function send() {
    if (!to.trim()) return toast.error("Renseigne le mail destinataire");
    if (!window.confirm(`Envoyer l'ordre de remplacement à ${p.label} (${to}) pour ${count} contrat${count > 1 ? "s" : ""} ?\nLes dossiers passeront en « ODR envoyées ».`)) return;
    setSending(true);
    try {
      const res = await fetch("/api/odr/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner: p.key, to: to.trim(), includeFlagged }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
      if (json.fallback && json.mailtoUrl) {
        window.open(json.mailtoUrl, "_blank");
        toast.success(`${json.sent} dossier(s) → « ODR envoyées » (Front non configuré : mail ouvert dans ton client).`);
      } else {
        toast.success(`ODR envoyé à ${p.label} : ${json.sent} contrat(s) → « ODR envoyées ».`);
      }
      setOpen(false);
      setTo("");
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
            <input
              type="email"
              placeholder={`Mail contact ODR ${p.label}`}
              value={to}
              disabled={sending}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: "#E8E8EC", minWidth: 260 }}
            />
            {p.flagged > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#4E4E58" }}>
                <input type="checkbox" checked={includeFlagged} disabled={sending} onChange={(e) => setIncludeFlagged(e.target.checked)} />
                Inclure les {p.flaggedReady} ex-flaggé{p.flaggedReady > 1 ? "s" : ""} re-vérifié{p.flaggedReady > 1 ? "s" : ""}
              </label>
            )}
          </div>

          <div style={{ fontSize: 12, color: "#A2A1AF" }}>
            Aperçu de la lettre ({count} contrat{count > 1 ? "s" : ""}, cachet Matera inclus) — PDF joint à l&apos;envoi.{" "}
            <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "underline" }}>
              ouvrir dans un onglet
            </a>
          </div>
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            title={`Aperçu ODR ${p.label}`}
            style={{ width: "100%", height: 420, border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff" }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button size="sm" onClick={send} disabled={sending} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              {sending ? "Envoi…" : `Envoyer via Front (${count} contrat${count > 1 ? "s" : ""})`}
            </Button>
            <span style={{ fontSize: 12, color: "#A2A1AF" }}>→ passage en « ODR envoyées »</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function OdrControls({ template, partners }: { template: string; partners: OdrPartnerSummary[] }) {
  const [showTpl, setShowTpl] = useState(false);
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
        <button
          onClick={() => setShowTpl((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#FAFAFC", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#26262C" }}
        >
          <ChevronDown className="h-4 w-4" style={{ transform: showTpl ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
          Template ODR
        </button>
        {showTpl && (
          <pre style={{ margin: 0, padding: "14px 16px", fontSize: 12.5, lineHeight: "18px", color: "#4E4E58", whiteSpace: "pre-wrap", fontFamily: "ui-sans-serif, system-ui, sans-serif", borderTop: "1px solid #E8E8EC" }}>
            {template}
          </pre>
        )}
      </div>

      {/* Une ligne par assureur */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {partners.map((p) => (
          <PartnerRow key={p.key} p={p} />
        ))}
      </div>
    </div>
  );
}
