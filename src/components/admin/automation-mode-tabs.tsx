"use client";

// Onglet Automatisations — deux MODES en tête de page :
//  • « Semi-Auto » : l'interface actuelle (les 8 automatisations, traitées à la main
//    étape par étape grâce aux outils préparés). C'est le mode opérationnel du jour.
//  • « Pilote » : la cible long terme — Gufetto qui tourne seul au maximum de % possible
//    (jamais 100 %, certaines étapes restent manuelles). Vierge pour l'instant, on le
//    construira progressivement.
//
// Le choix est mémorisé (localStorage) pour rester d'un chargement à l'autre.

import { useEffect, useState } from "react";
import { Wrench, Rocket } from "lucide-react";
import { PiloteBoard } from "@/components/admin/pilote-board";

type Mode = "semi" | "pilote";
const STORAGE_KEY = "gufetto:automations:mode";

export function AutomationModeTabs({ semiAuto }: { semiAuto: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("semi");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (saved === "semi" || saved === "pilote") setMode(saved);
    setReady(true);
  }, []);

  function choose(m: Mode) {
    setMode(m);
    try { window.localStorage.setItem(STORAGE_KEY, m); } catch { /* ignore */ }
  }

  const tab = (m: Mode, active: boolean): React.CSSProperties => ({
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "18px 20px",
    borderRadius: 14,
    cursor: "pointer",
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    border: active ? "1.5px solid #4E49FC" : "1.5px solid #E8E8EC",
    background: active ? "#4E49FC" : "#fff",
    color: active ? "#fff" : "#656576",
    boxShadow: active ? "0 4px 14px rgba(78,73,252,0.22)" : "none",
    transition: "all 0.15s ease",
    userSelect: "none",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={tab("semi", mode === "semi")} onClick={() => choose("semi")}>
          <Wrench size={19} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
            <span>Semi-Auto</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>Les 8 automatisations, traitées à la main</span>
          </div>
        </div>
        <div style={tab("pilote", mode === "pilote")} onClick={() => choose("pilote")}>
          <Rocket size={19} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
            <span>Pilote</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>Gufetto en autonomie (à construire)</span>
          </div>
        </div>
      </div>

      {/* Rendu : on garde le contenu Semi-Auto monté (déjà rendu côté serveur) mais masqué
          en mode Pilote, pour ne pas le re-fetcher au retour. Avant hydratation → Semi-Auto. */}
      <div style={{ display: !ready || mode === "semi" ? "block" : "none" }}>{semiAuto}</div>

      {ready && mode === "pilote" && <PiloteBoard />}
    </div>
  );
}
