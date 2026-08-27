"use client";

// Mode « Pilote » — MAQUETTE esthétique uniquement (à remplir/coder ensuite).
// Vue façon n8n : enchaînement des grandes étapes du funnel + parcours ODR + Piscine.
// Chaque carte : titre / état (déployé = vert, non déployé = rouge) / % d'automatisation.
// Placeholder : toutes les cartes en « Non déployé » + « 0% automatisé ».
// Clic sur une carte → vue agrandie (recouvre le board) avec les infos + « à venir ».

import { useState } from "react";
import { ChevronRight, CircleDot, X } from "lucide-react";

type CardData = { key: string; title: string; deployed: boolean; pct: number };

// Ligne 1 — grandes étapes du funnel (6 cartes chaînées).
const FUNNEL: CardData[] = [
  { key: "identification", title: "Identification", deployed: false, pct: 0 },
  { key: "rs", title: "Récupération du RS", deployed: false, pct: 0 },
  { key: "devis_demandes", title: "Demandes de devis", deployed: false, pct: 0 },
  { key: "devis_compare", title: "Comparaison des devis", deployed: false, pct: 0 },
  { key: "validation_cs", title: "Validation du CS", deployed: false, pct: 0 },
  { key: "signe", title: "Signé", deployed: false, pct: 0 },
];

// Ligne 2 — parcours ODR (3 cartes centrées, chaînées, branche depuis Identification).
const ODR: CardData[] = [
  { key: "odr_en_cours", title: "ODR en cours", deployed: false, pct: 0 },
  { key: "odr_envoye", title: "ODR envoyé", deployed: false, pct: 0 },
  { key: "odr_accepte", title: "ODR accepté", deployed: false, pct: 0 },
];

// Ligne 3 — Piscine (grande carte, flèche descendante autonome au-dessus).
const PISCINE: CardData = { key: "piscine", title: "Piscine", deployed: false, pct: 0 };

const GUTTER = 40;

function StatusPill({ deployed, big }: { deployed: boolean; big?: boolean }) {
  const c = deployed
    ? { bg: "#EFFBF2", fg: "#13762C", dot: "#34C759", label: "Déployé" }
    : { bg: "#FFF5F5", fg: "#CA1E12", dot: "#F26D6D", label: "Non déployé" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: big ? "5px 12px" : "3px 9px", borderRadius: 999, fontSize: big ? 13 : 11, fontWeight: 600, background: c.bg, color: c.fg }}>
      <span style={{ width: big ? 7 : 6, height: big ? 7 : 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function PctBadge({ pct, big }: { pct: number; big?: boolean }) {
  return (
    <span style={{ fontSize: big ? 13 : 11, fontWeight: 700, color: "#4E49FC", background: "#F4F4FF", border: "1px solid #E4E4FB", borderRadius: 999, padding: big ? "5px 12px" : "3px 9px", whiteSpace: "nowrap" }}>
      {pct}% automatisé
    </span>
  );
}

function FlowCard({ data, onClick }: { data: CardData; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "13px 14px", boxShadow: "0 1px 3px rgba(16,16,24,0.05)", display: "flex", flexDirection: "column", gap: 10, minHeight: 94, cursor: "pointer", transition: "box-shadow 0.15s ease, transform 0.15s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(78,73,252,0.16)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(16,16,24,0.05)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 6, background: "#EEF0FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CircleDot size={13} style={{ color: "#4E49FC" }} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", lineHeight: 1.2 }}>{data.title}</span>
      </div>
      {/* Méta empilée → alignement identique pour toutes les cartes quelle que soit la largeur. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <StatusPill deployed={data.deployed} />
        <PctBadge pct={data.pct} />
      </div>
    </div>
  );
}

// Petit chevron horizontal dans la gouttière à droite d'une carte (chaînage).
function RightArrow() {
  return (
    <div style={{ position: "absolute", right: -(GUTTER - 6), top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", zIndex: 2 }}>
      <div style={{ width: GUTTER - 18, height: 2, background: "#C7C7D2" }} />
      <ChevronRight size={16} style={{ color: "#C7C7D2", marginLeft: -4 }} />
    </div>
  );
}

// Flèche verticale descendante autonome (au-dessus d'une carte).
function DownArrow({ height = 30 }: { height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 2, height, background: "#C7C7D2" }} />
      <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid #C7C7D2" }} />
    </div>
  );
}

export function PiloteBoard() {
  const [selected, setSelected] = useState<CardData | null>(null);

  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 10 };

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        border: "1px solid #E8E8EC",
        padding: "28px 40px 32px",
        backgroundColor: "#FBFBFD",
        backgroundImage: "radial-gradient(#DEDEE6 1.1px, transparent 1.1px)",
        backgroundSize: "22px 22px",
        overflowX: "auto",
      }}
    >
      <div style={{ minWidth: 940 }}>
        {/* Ligne 1 — funnel */}
        <div style={sectionLabel}>Funnel principal</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", columnGap: GUTTER, alignItems: "stretch" }}>
          {FUNNEL.map((c, i) => (
            <div key={c.key} style={{ position: "relative", gridColumn: i + 1, gridRow: 1 }}>
              <FlowCard data={c} onClick={() => setSelected(c)} />
              {i < FUNNEL.length - 1 && <RightArrow />}
            </div>
          ))}
        </div>

        {/* Ligne 2 — parcours ODR : branche en L depuis Identification (≈col 1) vers le centre */}
        <div style={{ ...sectionLabel, marginTop: 30 }}>Parcours ODR</div>
        <div style={{ position: "relative", paddingTop: 30 }}>
          {/* Connecteur en L : descend sous Identification puis rejoint le centre du groupe ODR. */}
          <div style={{ position: "absolute", top: 0, left: "6%", width: "44%", height: 22, borderLeft: "2px solid #C7C7D2", borderBottom: "2px solid #C7C7D2", borderBottomLeftRadius: 8 }} />
          <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)" }}><DownArrow height={8} /></div>
          {/* Les 3 cartes ODR centrées, chaînées entre elles. */}
          <div style={{ display: "flex", justifyContent: "center", gap: GUTTER + 8 }}>
            {ODR.map((c, i) => (
              <div key={c.key} style={{ position: "relative", width: 190 }}>
                <FlowCard data={c} onClick={() => setSelected(c)} />
                {i < ODR.length - 1 && <RightArrow />}
              </div>
            ))}
          </div>
        </div>

        {/* Ligne 3 — Piscine : grande carte + flèche descendante autonome au-dessus */}
        <div style={{ ...sectionLabel, marginTop: 30 }}>Piscine</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <DownArrow height={26} />
          <div
            onClick={() => setSelected(PISCINE)}
            style={{ width: "100%", maxWidth: 640, marginTop: 6, background: "#fff", border: "1px solid #E4E4EA", borderRadius: 14, padding: "18px 22px", boxShadow: "0 1px 3px rgba(16,16,24,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, transition: "box-shadow 0.15s ease, transform 0.15s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(78,73,252,0.16)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(16,16,24,0.05)"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "inline-flex", width: 26, height: 26, borderRadius: 7, background: "#EEF0FF", alignItems: "center", justifyContent: "center" }}>
                <CircleDot size={15} style={{ color: "#4E49FC" }} />
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Piscine</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusPill deployed={PISCINE.deployed} />
              <PctBadge pct={PISCINE.pct} />
            </div>
          </div>
        </div>

        {/* Ligne 4 — encart dossiers exclus (sous la ligne de flottaison, vide pour l'instant) */}
        <div style={{ ...sectionLabel, marginTop: 40 }}>Hors automatisation</div>
        <div style={{ background: "#fff", border: "1px dashed #D7D7DF", borderRadius: 12, padding: "20px 18px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", marginBottom: 4 }}>Dossiers exclus des automatisations</div>
          <p style={{ fontSize: 12.5, color: "#8A8A99", margin: 0 }}>À remplir — reprendra les mêmes infos que l&apos;encart de fin du mode Semi-Auto.</p>
        </div>
      </div>

      {/* Vue agrandie d'une carte (recouvre le board, pas tout l'écran) */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "absolute", inset: 0, background: "rgba(251,251,253,0.82)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, zIndex: 20, borderRadius: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: "100%", maxWidth: 620, background: "#fff", border: "1px solid #E4E4EA", borderRadius: 16, boxShadow: "0 12px 40px rgba(16,16,24,0.16)", padding: "26px 28px" }}
          >
            <button
              onClick={() => setSelected(null)}
              aria-label="Fermer"
              style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E8EC", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#656576" }}
            >
              <X size={16} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, background: "#EEF0FF", alignItems: "center", justifyContent: "center" }}>
                <CircleDot size={18} style={{ color: "#4E49FC" }} />
              </span>
              <span style={{ fontSize: 21, fontWeight: 700, color: "#26262C", letterSpacing: "-0.01em" }}>{selected.title}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <StatusPill deployed={selected.deployed} big />
              <PctBadge pct={selected.pct} big />
            </div>

            <div style={{ borderTop: "1px dashed #E8E8EC", paddingTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 10 }}>Détail de l&apos;étape</div>
              <p style={{ fontSize: 14, color: "#8A8A99", fontStyle: "italic", margin: 0 }}>À venir.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
