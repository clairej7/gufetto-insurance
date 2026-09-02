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
      const dryRun = async (hours?: number) => {
        const q = `/api/cron/devis6-relances?dryRun=1${hours ? `&hours=${hours}` : ""}`;
        const r = await fetch(q, { method: "POST" });
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; eligibles?: number; error?: string };
        if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
        return j.eligibles ?? 0;
      };
      const send = async (limit: number, hours?: number) => {
        const q = `/api/cron/devis6-relances?limit=${limit}${hours ? `&hours=${hours}` : ""}`;
        const r = await fetch(q, { method: "POST" });
        const j = (await r.json().catch(() => ({}))) as { success?: boolean; relances?: number; error?: string };
        if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
        toast.success(`${j.relances ?? 0} relance(s) envoyée(s).`);
      };

      // 1) Dry-run au seuil normal (48 h).
      const n = await dryRun();
      if (n === 0) {
        // Mode TEST : rien à 48 h → propose 1 envoi sur un dossier ≥ 24 h.
        const n24 = await dryRun(24);
        if (n24 === 0) { toast.info("Aucun dossier éligible (même à 24 h sans réponse)."); return; }
        if (!confirm(`0 dossier à 48 h. ${n24} dossier(s) en attente depuis ≥ 24 h.\nEnvoyer 1 relance de TEST sur le plus récent d'entre eux ?`)) return;
        await send(1, 24);
        return;
      }

      // 2) Flux normal : combien envoyer ? (défaut 1)
      const ans = window.prompt(`${n} dossier(s) éligible(s) (48 h). Combien veux-tu relancer maintenant ? (1 = test, le nombre total pour tous)`, "1");
      if (ans === null) return;
      const limit = Math.max(0, parseInt(ans, 10) || 0);
      if (limit === 0) { toast.info("Annulé (0 envoi)."); return; }
      await send(limit);
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
