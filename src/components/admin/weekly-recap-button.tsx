"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

// Déclenche manuellement la publication du recap hebdo (semaine passée) dans
// #team_insurance_fr. Le même endpoint est appelé automatiquement par le cron
// du lundi matin (Bearer CRON_SECRET).
export function WeeklyRecapButton() {
  const [sending, setSending] = useState(false);

  async function publier() {
    if (sending) return;
    if (!confirm("Publier le recap hebdo (semaine passée) dans #team_insurance_fr ?")) return;
    setSending(true);
    try {
      const res = await fetch("/api/cron/weekly-recap", { method: "POST", headers: { "Content-Type": "application/json" } });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; week?: number; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`Recap semaine ${j.week ?? ""} publié dans #team_insurance_fr.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la publication");
    } finally {
      setSending(false);
    }
  }

  return (
    <button onClick={publier} disabled={sending} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "none",
      fontSize: 13, fontWeight: 700, background: sending ? "#C9C8D3" : "#4E49FC", color: "#fff", cursor: sending ? "default" : "pointer",
    }}>
      {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publier le recap hebdo (#team_insurance_fr)
    </button>
  );
}
