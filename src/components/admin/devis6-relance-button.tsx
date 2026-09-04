"use client";

import { useState } from "react";
import { Loader2, BellRing, X } from "lucide-react";
import { toast } from "sonner";

// Relances gestionnaire (auto 6) — Semi-Auto, déclenchement MANUEL. Au clic on compte
// les éligibles (dry-run) puis on ouvre un panneau proposant : « 1 relance (test) » OU
// « toutes les X ». Relance en thread Slack les propositions sans réponse (ni bouton,
// ni commentaire, ni réaction) depuis ≥ 48 h. (Le mode Pilote fait la même chose seul.)
export function Devis6RelanceButton() {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);   // éligibles à 48 h
  const [count24, setCount24] = useState<number | null>(null); // secours : ≥ 24 h

  const dryRun = async (hours?: number): Promise<number> => {
    const q = `/api/cron/devis6-relances?dryRun=1${hours ? `&hours=${hours}` : ""}`;
    const r = await fetch(q, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; eligibles?: number; error?: string };
    if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
    return j.eligibles ?? 0;
  };

  const send = async (limit: number, hours?: number) => {
    setBusy(true);
    try {
      const q = `/api/cron/devis6-relances?limit=${limit}${hours ? `&hours=${hours}` : ""}`;
      const r = await fetch(q, { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; relances?: number; error?: string };
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`${j.relances ?? 0} relance(s) envoyée(s).`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec des relances");
    } finally {
      setBusy(false);
    }
  };

  async function toggle() {
    if (open) { setOpen(false); return; }
    setBusy(true);
    try {
      const n = await dryRun();
      setCount(n);
      setCount24(n === 0 ? await dryRun(24) : null);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  const optBtn = (primary: boolean): React.CSSProperties => ({
    width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer",
    border: primary ? "none" : "1.5px solid #E8E8EC", background: primary ? "#B4690E" : "#fff", color: primary ? "#fff" : "#26262C",
  });

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={toggle} disabled={busy} style={{
        display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "none",
        fontSize: 13, fontWeight: 700, background: busy ? "#C9C8D3" : "#B4690E", color: "#fff", cursor: busy ? "default" : "pointer",
      }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />} Relancer les gestios (2 j sans réponse)
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 40, width: 320, background: "#fff", border: "1px solid #E8E8EC", borderRadius: 12, boxShadow: "0 8px 28px rgba(16,16,24,0.14)", padding: 16 }}>
          <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ position: "absolute", top: 10, right: 10, width: 26, height: 26, borderRadius: 7, border: "1px solid #E8E8EC", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#656576" }}>
            <X size={14} />
          </button>
          {count !== null && count > 0 ? (
            <>
              <div style={{ fontSize: 13, color: "#26262C", fontWeight: 700, marginBottom: 3 }}>{count} dossier{count > 1 ? "s" : ""} éligible{count > 1 ? "s" : ""}</div>
              <div style={{ fontSize: 12, color: "#8A8A99", marginBottom: 12 }}>Sans réponse depuis ≥ 2 jours. Choisis l&apos;envoi :</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => send(1)} disabled={busy} style={optBtn(false)}>Envoyer <strong>1 relance</strong> (test)</button>
                <button onClick={() => send(count)} disabled={busy} style={optBtn(true)}>Envoyer <strong>les {count} relances</strong></button>
              </div>
            </>
          ) : count24 && count24 > 0 ? (
            <>
              <div style={{ fontSize: 13, color: "#26262C", fontWeight: 700, marginBottom: 3 }}>0 dossier à 48 h</div>
              <div style={{ fontSize: 12, color: "#8A8A99", marginBottom: 12 }}>{count24} en attente depuis ≥ 24 h (pour un test).</div>
              <button onClick={() => send(1, 24)} disabled={busy} style={optBtn(false)}>Envoyer <strong>1 relance de test</strong> (≥ 24 h)</button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#8A8A99" }}>Aucun dossier éligible à relancer.</div>
          )}
        </div>
      )}
    </div>
  );
}
