"use client";

import { useState } from "react";
import { Loader2, BellRing } from "lucide-react";
import { toast } from "sonner";

// Déclenche manuellement les relances gestionnaire (auto 6) : relance en thread
// les propositions de devis sans réponse depuis ≥ 2 jours. Le même endpoint est
// appelé automatiquement chaque jour par le cron interne (Bearer CRON_SECRET).
export function Devis6RelanceButton() {
  const [sending, setSending] = useState(false);

  async function relancer() {
    if (sending) return;
    if (!confirm("Relancer en thread Slack les gestionnaires sans réponse depuis ≥ 2 jours ?")) return;
    setSending(true);
    try {
      const res = await fetch("/api/cron/devis6-relances", { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; relances?: number; ignores?: number; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`${j.relances ?? 0} relance(s) postée(s) · ${j.ignores ?? 0} ignoré(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec des relances");
    } finally {
      setSending(false);
    }
  }

  return (
    <button onClick={relancer} disabled={sending} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "none",
      fontSize: 13, fontWeight: 700, background: sending ? "#C9C8D3" : "#B4690E", color: "#fff", cursor: sending ? "default" : "pointer",
    }}>
      {sending ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Relancer les gestios (2 j sans réponse)
    </button>
  );
}
