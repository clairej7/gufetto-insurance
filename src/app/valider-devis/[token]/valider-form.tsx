"use client";

import { useState } from "react";

type Choix = "valide" | "refus";

export function ValiderForm({ token, defaultChoix }: { token: string; defaultChoix: Choix | null }) {
  const [choix, setChoix] = useState<Choix | null>(defaultChoix);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Choix | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!choix) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/valider-devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, reponse: choix, comment }) });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) throw new Error(j.error ?? "Échec");
      setDone(choix);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur, réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ marginTop: 18, padding: "16px", borderRadius: 12, background: done === "valide" ? "#EAF7EE" : "#FDECEA", border: `1px solid ${done === "valide" ? "#B7E4C4" : "#F4A9A0"}`, textAlign: "center" }}>
        <div style={{ fontSize: 28 }}>{done === "valide" ? "✅" : "🚫"}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#26262C", marginTop: 4 }}>
          {done === "valide" ? "Merci — transmission au CS confirmée." : "Noté — la proposition ne sera pas envoyée."}
        </div>
        <div style={{ fontSize: 13, color: "#656576", marginTop: 4 }}>L&apos;équipe assurance a été prévenue. Tu peux fermer cette page.</div>
      </div>
    );
  }

  const optBtn = (val: Choix, label: string, activeBg: string, activeBorder: string, activeColor: string) => {
    const on = choix === val;
    return (
      <button onClick={() => setChoix(val)} style={{
        flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
        background: on ? activeBg : "#fff", border: `2px solid ${on ? activeBorder : "#E8E8EC"}`, color: on ? activeColor : "#656576",
      }}>{label}</button>
    );
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#26262C", marginBottom: 8 }}>Valides-tu la transmission au Conseil Syndical ?</div>
      <div style={{ display: "flex", gap: 10 }}>
        {optBtn("valide", "✅ Confirmer la transmission au CS", "#EAF7EE", "#13762C", "#13762C")}
        {optBtn("refus", "🚫 Ne pas envoyer", "#FDECEA", "#CA1E12", "#CA1E12")}
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#656576" }}>Commentaire (optionnel)</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="Une précision pour l'équipe assurance…"
          style={{ width: "100%", marginTop: 6, fontSize: 14, padding: "10px 12px", border: "1px solid #E8E8EC", borderRadius: 10, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 13, color: "#CA1E12" }}>{error}</div>}

      <button onClick={submit} disabled={!choix || submitting} style={{
        marginTop: 14, width: "100%", padding: "13px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 800,
        background: !choix || submitting ? "#C9C8D3" : "#4E49FC", color: "#fff", cursor: !choix || submitting ? "default" : "pointer",
      }}>{submitting ? "Envoi…" : "Valider ma réponse"}</button>
    </div>
  );
}
