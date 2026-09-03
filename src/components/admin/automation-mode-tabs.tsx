"use client";

// Onglet Automatisations — deux MODES en tête de page :
//  • « Semi-Auto » : l'interface actuelle (les 8 automatisations, traitées à la main).
//  • « Pilote » : Gufetto qui tourne seul (mode autonome).
//
// Le choix est mémorisé (localStorage). VERROU : quand le mode Pilote est DÉPLOYÉ,
//  - on revient toujours sur Pilote (au rechargement / retour sur l'onglet) ;
//  - passer en Semi-Auto demande une confirmation qui STOPPE d'abord le Pilote.

import { useCallback, useEffect, useState } from "react";
import { Wrench, Rocket } from "lucide-react";
import { PiloteBoard } from "@/components/admin/pilote-board";

type Mode = "semi" | "pilote";
const STORAGE_KEY = "gufetto:automations:mode";

export function AutomationModeTabs({ semiAuto }: { semiAuto: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("semi");
  const [ready, setReady] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);

  const fetchDeployed = useCallback(async (): Promise<boolean> => {
    try { const r = await fetch("/api/pilote/status"); const j = await r.json(); return !!j?.deployed; } catch { return false; }
  }, []);

  // Au montage : si le Pilote est déployé → on force le mode Pilote (peu importe le
  // dernier choix mémorisé). Sinon on reprend le choix localStorage.
  useEffect(() => {
    let alive = true;
    (async () => {
      const dep = await fetchDeployed();
      if (!alive) return;
      setDeployed(dep);
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      setMode(dep ? "pilote" : (saved === "semi" || saved === "pilote" ? saved : "semi"));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [fetchDeployed]);

  // Suit l'état déployé (si on déploie/stoppe depuis le board).
  useEffect(() => {
    const t = setInterval(async () => setDeployed(await fetchDeployed()), 15_000);
    return () => clearInterval(t);
  }, [fetchDeployed]);

  function persist(m: Mode) { setMode(m); try { window.localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ } }

  function choose(m: Mode) {
    if (m === mode) return;
    if (m === "semi" && deployed) { setConfirmStop(true); return; } // verrou : confirmation requise
    persist(m);
  }

  async function stopAndSemi() {
    setStopping(true);
    try { await fetch("/api/pilote/stop", { method: "POST" }); } catch { /* ignore */ }
    setDeployed(false);
    setStopping(false);
    setConfirmStop(false);
    persist("semi");
  }

  const tab = (active: boolean): React.CSSProperties => ({
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "18px 20px",
    borderRadius: 14, cursor: "pointer", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em",
    border: active ? "1.5px solid #4E49FC" : "1.5px solid #E8E8EC", background: active ? "#4E49FC" : "#fff",
    color: active ? "#fff" : "#656576", boxShadow: active ? "0 4px 14px rgba(78,73,252,0.22)" : "none",
    transition: "all 0.15s ease", userSelect: "none",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={tab(mode === "semi")} onClick={() => choose("semi")}>
          <Wrench size={19} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
            <span>Semi-Auto</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>Les 8 automatisations, traitées à la main</span>
          </div>
        </div>
        <div style={tab(mode === "pilote")} onClick={() => choose("pilote")}>
          <Rocket size={19} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
            <span>Pilote{deployed ? " · en cours" : ""}</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>{deployed ? "Gufetto tourne en autonomie" : "Gufetto en autonomie"}</span>
          </div>
        </div>
      </div>

      <div style={{ display: !ready || mode === "semi" ? "block" : "none" }}>{semiAuto}</div>
      {ready && mode === "pilote" && <PiloteBoard />}

      {/* Confirmation avant de quitter le Pilote pour le Semi-Auto */}
      {confirmStop && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(16,16,24,0.35)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1000 }}>
          <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, boxShadow: "0 16px 48px rgba(16,16,24,0.24)", padding: "26px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, background: "#FFF5F5", alignItems: "center", justifyContent: "center" }}>
                <Rocket size={18} style={{ color: "#CA1E12" }} />
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#26262C" }}>Stopper le mode Pilote ?</span>
            </div>
            <p style={{ fontSize: 14, color: "#656576", lineHeight: 1.5, margin: "0 0 20px" }}>
              Le mode Pilote tourne actuellement en autonomie. Passer en Semi-Auto va <strong>l&apos;arrêter</strong> (un recap de session sera archivé).
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmStop(false)} disabled={stopping} style={{ fontSize: 14, fontWeight: 600, color: "#656576", background: "#fff", border: "1.5px solid #E8E8EC", borderRadius: 10, padding: "10px 18px", cursor: "pointer" }}>Non, rester en Pilote</button>
              <button onClick={stopAndSemi} disabled={stopping} style={{ fontSize: 14, fontWeight: 700, color: "#fff", background: "#CA1E12", border: "none", borderRadius: 10, padding: "10px 18px", cursor: stopping ? "wait" : "pointer", opacity: stopping ? 0.6 : 1 }}>{stopping ? "Arrêt…" : "Oui, stopper"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
