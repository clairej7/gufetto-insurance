"use client";

// Bandeau global : quand le mode Pilote tourne en autonomie, on prévient sur TOUS
// les onglets (sauf « Automatisations » où le board Pilote est déjà visible) de ne
// pas faire d'action manuelle sur les dossiers (le Pilote les traite tout seul).

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Rocket } from "lucide-react";

export function PiloteBanner() {
  const pathname = usePathname();
  const [deployed, setDeployed] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try { const r = await fetch("/api/pilote/status"); const j = await r.json(); if (alive) setDeployed(!!j?.deployed); } catch { /* ignore */ }
    };
    check();
    const t = setInterval(check, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!deployed || pathname.startsWith("/admin/automatisations")) return null;

  return (
    <div style={{ background: "#EEF0FF", borderBottom: "1px solid #D9D9F5", color: "#3A38B0" }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8" style={{ display: "flex", alignItems: "center", gap: 8, height: 38, fontSize: 13, fontWeight: 600 }}>
        <Rocket size={15} />
        <span>Mode Pilote en cours — ne pas faire d&apos;action manuelle sur les dossiers (Gufetto les traite en autonomie).</span>
      </div>
    </div>
  );
}
