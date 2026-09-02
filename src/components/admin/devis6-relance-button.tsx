"use client";

import { useState } from "react";
import { Loader2, BellRing } from "lucide-react";
import { toast } from "sonner";

// Déclenche manuellement les relances gestionnaire (auto 6) : relance en thread les
// propositions sans réponse (ni bouton, ni commentaire) depuis ≥ 24 h. On compte
// d'abord les éligibles (dry-run), puis on demande COMBIEN envoyer (défaut 1 → test).
// L'envoi automatique par le cron reste OFF tant que DEVIS6_RELANCE_ENABLED != true.
export function Devis6RelanceButton() {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      // 1) Dry-run : combien de dossiers sont éligibles ?
      const dry = await fetch("/api/cron/devis6-relances?dryRun=1", { method: "POST" });
      const dj = (await dry.json().catch(() => ({}))) as { success?: boolean; eligibles?: number; error?: string };
      if (!dry.ok || !dj.success) throw new Error(dj.error ?? "Échec");
      const n = dj.eligibles ?? 0;
      if (n === 0) { toast.info("Aucun dossier éligible à relancer (48 h sans réponse)."); return; }

      // 2) Combien envoyer ? (défaut 1 pour tester)
      const ans = window.prompt(`${n} dossier(s) éligible(s). Combien veux-tu relancer maintenant ? (1 = test, laisse le nombre total pour tous)`, "1");
      if (ans === null) return; // annulé
      const limit = Math.max(0, parseInt(ans, 10) || 0);
      if (limit === 0) { toast.info("Annulé (0 envoi)."); return; }

      // 3) Envoi réel, plafonné à `limit`.
      const res = await fetch(`/api/cron/devis6-relances?limit=${limit}`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; relances?: number; ignores?: number; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`${j.relances ?? 0} relance(s) envoyée(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec des relances");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={run} disabled={busy} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "none",
      fontSize: 13, fontWeight: 700, background: busy ? "#C9C8D3" : "#B4690E", color: "#fff", cursor: busy ? "default" : "pointer",
    }}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Relancer les gestios (2 j sans réponse)
    </button>
  );
}
