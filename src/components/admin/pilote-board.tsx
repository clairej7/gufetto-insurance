"use client";

// Mode « Pilote » — MAQUETTE esthétique uniquement (à remplir/coder ensuite).
// Vue façon n8n : on voit l'enchaînement des grandes étapes du funnel + le parcours ODR.
// Chaque carte : titre / état (déployé = vert, non déployé = rouge) / % d'automatisation.
// Pour l'instant : toutes les cartes en « Non déployé » + « 100% automatisé » (placeholder).

import { ChevronRight, CircleDot } from "lucide-react";

type CardData = { key: string; title: string; deployed: boolean; pct: number };

// Ligne 1 — grandes étapes du funnel (6 cartes chaînées).
const FUNNEL: CardData[] = [
  { key: "identification", title: "Identification", deployed: false, pct: 100 },
  { key: "rs", title: "Récupération du RS", deployed: false, pct: 100 },
  { key: "devis_demandes", title: "Demandes de devis", deployed: false, pct: 100 },
  { key: "devis_compare", title: "Comparaison des devis", deployed: false, pct: 100 },
  { key: "validation_cs", title: "Validation du CS", deployed: false, pct: 100 },
  { key: "signe", title: "Signé", deployed: false, pct: 100 },
];

// Ligne 2 — parcours ODR, aligné sous des colonnes précises de la ligne 1.
// col = index 1-based de la carte funnel sous laquelle la carte ODR se place.
const ODR: (CardData & { col: number })[] = [
  { key: "odr_en_cours", title: "ODR en cours", deployed: false, pct: 100, col: 2 }, // sous Récupération du RS
  { key: "odr_envoye", title: "ODR envoyé", deployed: false, pct: 100, col: 5 }, // sous Validation du CS
  { key: "odr_accepte", title: "ODR accepté", deployed: false, pct: 100, col: 6 }, // sous Signé
];

function StatusPill({ deployed }: { deployed: boolean }) {
  const c = deployed
    ? { bg: "#EFFBF2", fg: "#13762C", dot: "#34C759", label: "Déployé" }
    : { bg: "#FFF5F5", fg: "#CA1E12", dot: "#F26D6D", label: "Non déployé" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function FlowCard({ data }: { data: CardData }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "13px 14px", boxShadow: "0 1px 3px rgba(16,16,24,0.05)", display: "flex", flexDirection: "column", gap: 9, minHeight: 96 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 6, background: "#EEF0FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CircleDot size={13} style={{ color: "#4E49FC" }} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", lineHeight: 1.2 }}>{data.title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
        <StatusPill deployed={data.deployed} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#4E49FC", background: "#F4F4FF", border: "1px solid #E4E4FB", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
          {data.pct}% automatisé
        </span>
      </div>
    </div>
  );
}

// Chevron horizontal posé dans la gouttière à droite d'une carte.
function RightArrow() {
  return (
    <div style={{ position: "absolute", right: -34, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", zIndex: 2 }}>
      <div style={{ width: 22, height: 2, background: "#C7C7D2" }} />
      <ChevronRight size={16} style={{ color: "#C7C7D2", marginLeft: -4 }} />
    </div>
  );
}

export function PiloteBoard() {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid #E8E8EC",
        padding: "36px 40px",
        // Fond pointillé façon canvas n8n.
        backgroundColor: "#FBFBFD",
        backgroundImage: "radial-gradient(#DEDEE6 1.1px, transparent 1.1px)",
        backgroundSize: "22px 22px",
        overflowX: "auto",
      }}
    >
      <div style={{ minWidth: 940 }}>
        {/* Ligne 1 — funnel */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 12 }}>Funnel principal</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", columnGap: 48 }}>
          {FUNNEL.map((c, i) => (
            <div key={c.key} style={{ position: "relative", gridColumn: i + 1, gridRow: 1 }}>
              <FlowCard data={c} />
              {i < FUNNEL.length - 1 && <RightArrow />}
            </div>
          ))}
        </div>

        {/* Ligne 2 — parcours ODR (aligné en colonnes sous la ligne 1) */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", margin: "44px 0 12px" }}>Parcours ODR</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", columnGap: 48, position: "relative" }}>
          {ODR.map((c) => {
            // Flèche vers la carte ODR suivante (chaînage en cours → envoyé → accepté).
            const idx = ODR.findIndex((x) => x.key === c.key);
            const next = ODR[idx + 1];
            return (
              <div key={c.key} style={{ position: "relative", gridColumn: c.col, gridRow: 1 }}>
                {/* Branche descendante depuis la carte funnel du dessus (uniquement 1re carte ODR). */}
                {idx === 0 && (
                  <div style={{ position: "absolute", left: "50%", top: -44, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
                    <div style={{ width: 2, height: 30, background: "#C7C7D2" }} />
                    <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #C7C7D2" }} />
                  </div>
                )}
                <FlowCard data={c} />
                {next && (
                  // Connecteur horizontal jusqu'à la carte ODR suivante (peut franchir des colonnes vides).
                  <div style={{ position: "absolute", left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", zIndex: 2, width: `calc(${(next.col - c.col - 1)} * (100% + 48px) + 36px)` }}>
                    <div style={{ flex: 1, height: 2, background: "#C7C7D2" }} />
                    <ChevronRight size={16} style={{ color: "#C7C7D2", marginLeft: -4 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Ligne 3 — encart dossiers exclus (vide pour l'instant) */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", margin: "44px 0 12px" }}>Hors automatisation</div>
        <div style={{ background: "#fff", border: "1px dashed #D7D7DF", borderRadius: 12, padding: "20px 18px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", marginBottom: 4 }}>Dossiers exclus des automatisations</div>
          <p style={{ fontSize: 12.5, color: "#8A8A99", margin: 0 }}>À remplir — reprendra les mêmes infos que l&apos;encart de fin du mode Semi-Auto.</p>
        </div>
      </div>
    </div>
  );
}
