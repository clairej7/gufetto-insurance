"use client";

// Mode « Pilote » — MAQUETTE esthétique uniquement (à remplir/coder ensuite).
// Vue façon n8n : funnel principal + parcours ODR + Piscine (+ bouton de déploiement).
// Chaque carte : titre / état (déployé = vert, non déployé = rouge) / % d'automatisation.
// Placeholder : tout en « Non déployé » + « 0% automatisé ». Clic → vue agrandie.

import { useEffect, useRef, useState } from "react";
import { ChevronRight, CircleDot, X } from "lucide-react";

// 1 tâche = 1 ligne dans la vue agrandie d'une carte. Le % d'automatisation de la carte
// est DÉRIVÉ des tâches (automatisées / total) → il s'actualise tout seul dès qu'on
// bascule une tâche en « automatisé ». Les tâches se renseignent carte par carte ;
// pour l'instant toutes les listes sont vides → 0 %.
type Task = { key: string; name: string; automated: boolean };
type CardData = { key: string; title: string; deployed: boolean; tasks: Task[] };

// % automatisé d'une carte = part des tâches automatisées (0 si aucune tâche).
const pctOf = (c: CardData): number => (c.tasks.length ? Math.round((c.tasks.filter((t) => t.automated).length / c.tasks.length) * 100) : 0);

const FUNNEL: CardData[] = [
  { key: "identification", title: "Identification", deployed: false, tasks: [
    { key: "remplissage_infos", name: "Remplissage des informations manquantes", automated: false },
    { key: "identification_dossiers", name: "Identification des dossiers", automated: false },
  ] },
  { key: "rs", title: "Récupération du RS", deployed: false, tasks: [
    { key: "completion_mail_courtier", name: "Complétion du mail courtier", automated: false },
    { key: "envoi_demandes_courtiers", name: "Envoi des demandes aux courtiers", automated: false },
    { key: "detecteur_reponses", name: "Détecteur de réponse des courtiers", automated: false },
    { key: "boucles_relances", name: "Boucles de relances RS", automated: false },
  ] },
  { key: "devis_demandes", title: "Demandes de devis", deployed: false, tasks: [
    { key: "recup_docs_infos", name: "Récupération des documents & informations", automated: false },
    { key: "generation_excel_zip", name: "Génération de l'excel et du dossier zip", automated: false },
    { key: "envoi_demandes_assureurs", name: "Envoi des demandes aux assureurs", automated: false },
    { key: "detecteur_reponses_assureurs", name: "Détecteur de réponse des assureurs", automated: false },
  ] },
  { key: "devis_compare", title: "Comparaison des devis", deployed: false, tasks: [
    { key: "verif_primes", name: "Vérification des primes", automated: false },
    { key: "generation_comparaisons", name: "Génération des comparaisons", automated: false },
    { key: "transmission_gestionnaires", name: "Transmission aux gestionnaires", automated: false },
  ] },
  { key: "validation_cs", title: "Validation du CS", deployed: false, tasks: [] },
  { key: "signe", title: "Signé", deployed: false, tasks: [] },
];

const ODR: CardData[] = [
  { key: "odr_en_cours", title: "ODR en cours", deployed: false, tasks: [] },
  { key: "odr_envoye", title: "ODR envoyé", deployed: false, tasks: [] },
  { key: "odr_accepte", title: "ODR accepté", deployed: false, tasks: [] },
];

const PISCINE: CardData = { key: "piscine", title: "Piscine", deployed: false, tasks: [] };

const GUTTER = 40;
const CARD_H = 120;

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

function TaskStatus({ automated, big }: { automated: boolean; big?: boolean }) {
  const c = automated
    ? { bg: "#EFFBF2", fg: "#13762C", dot: "#34C759", label: "Automatisé" }
    : { bg: "#FFF5F5", fg: "#CA1E12", dot: "#F26D6D", label: "Non automatisé" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: big ? "5px 12px" : "3px 9px", borderRadius: 999, fontSize: big ? 13 : 11.5, fontWeight: 600, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
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
      style={{ background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "13px 14px", boxShadow: "0 1px 3px rgba(16,16,24,0.05)", display: "flex", flexDirection: "column", gap: 10, height: CARD_H, boxSizing: "border-box", cursor: "pointer", transition: "box-shadow 0.15s ease, transform 0.15s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(78,73,252,0.16)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(16,16,24,0.05)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: 6, background: "#EEF0FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CircleDot size={13} style={{ color: "#4E49FC" }} />
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", lineHeight: 1.2 }}>{data.title}</span>
      </div>
      {/* Méta poussée en bas → alignement + taille identiques pour toutes les cartes. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginTop: "auto" }}>
        <StatusPill deployed={data.deployed} />
        <PctBadge pct={pctOf(data)} />
      </div>
    </div>
  );
}

// Chevron horizontal dans la gouttière à droite d'une carte (chaînage inter-cartes).
function RightArrow() {
  return (
    <div style={{ position: "absolute", right: -(GUTTER - 6), top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", zIndex: 2 }}>
      <div style={{ width: GUTTER - 18, height: 2, background: "#C7C7D2" }} />
      <ChevronRight size={16} style={{ color: "#C7C7D2", marginLeft: -4 }} />
    </div>
  );
}

// Entonnoir : les dossiers à traiter à la main se déversent dans la Piscine.
function Funnel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="70" height="58" viewBox="0 0 70 58" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* petits « dossiers » qui tombent */}
        <rect x="20" y="0" width="9" height="7" rx="1.5" fill="#C7C7D2" />
        <rect x="41" y="0" width="9" height="7" rx="1.5" fill="#DADAE3" />
        <rect x="31" y="3" width="9" height="7" rx="1.5" fill="#B9B9C6" />
        {/* corps de l'entonnoir */}
        <path d="M6 14 H64 L41 38 V50 H29 V38 Z" fill="#EEF0FF" stroke="#B9B9C6" strokeWidth="1.5" strokeLinejoin="round" />
        {/* pointe vers la carte */}
        <path d="M29 50 H41 L35 57 Z" fill="#B9B9C6" />
      </svg>
    </div>
  );
}

export function PiloteBoard() {
  const [selected, setSelected] = useState<CardData | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const close = () => { setSelected(null); setSelectedTask(null); };

  // Mesure des coins pour tracer la flèche diagonale Identification → ODR en cours.
  const wrapRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<HTMLDivElement>(null);
  const odrRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    function measure() {
      const w = wrapRef.current, a = idRef.current, b = odrRef.current;
      if (!w || !a || !b) return;
      const wr = w.getBoundingClientRect(), ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      setLine({
        x1: ar.right - wr.left, // coin bas-droit d'Identification
        y1: ar.bottom - wr.top,
        x2: br.left - wr.left, // coin haut-gauche d'ODR en cours
        y2: br.top - wr.top,
      });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const diag = line
    ? { dist: Math.hypot(line.x2 - line.x1, line.y2 - line.y1), ang: (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI }
    : null;

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
        {/* Funnel + ODR dans un même conteneur relatif → la flèche diagonale les relie. */}
        <div ref={wrapRef} style={{ position: "relative" }}>
          {/* Ligne 1 — funnel */}
          <div style={sectionLabel}>Funnel principal</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", columnGap: GUTTER, alignItems: "stretch" }}>
            {FUNNEL.map((c, i) => (
              <div key={c.key} ref={i === 0 ? idRef : undefined} style={{ position: "relative", gridColumn: i + 1, gridRow: 1 }}>
                <FlowCard data={c} onClick={() => setSelected(c)} />
                {i < FUNNEL.length - 1 && <RightArrow />}
              </div>
            ))}
          </div>

          {/* Ligne 2 — parcours ODR (cartes centrées) */}
          <div style={{ ...sectionLabel, marginTop: 34 }}>Parcours ODR</div>
          <div style={{ display: "flex", justifyContent: "center", gap: GUTTER + 8 }}>
            {ODR.map((c, i) => (
              <div key={c.key} ref={i === 0 ? odrRef : undefined} style={{ position: "relative", width: 190 }}>
                <FlowCard data={c} onClick={() => setSelected(c)} />
                {i < ODR.length - 1 && <RightArrow />}
              </div>
            ))}
          </div>

          {/* Flèche diagonale Identification → ODR en cours (même style que les inter-cartes). */}
          {diag && line && (
            <div style={{ position: "absolute", left: line.x1, top: line.y1, width: diag.dist, height: 0, transform: `rotate(${diag.ang}deg)`, transformOrigin: "0 50%", display: "flex", alignItems: "center", pointerEvents: "none", zIndex: 3 }}>
              <div style={{ flex: 1, height: 2, background: "#C7C7D2" }} />
              <ChevronRight size={16} style={{ color: "#C7C7D2", marginLeft: -4 }} />
            </div>
          )}
        </div>

        {/* Ligne 3 — Piscine : entonnoir + grande carte */}
        <div style={{ ...sectionLabel, marginTop: 34 }}>Piscine</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Funnel />
          <div
            onClick={() => setSelected(PISCINE)}
            style={{ width: "100%", maxWidth: 640, marginTop: 4, background: "#fff", border: "1px solid #E4E4EA", borderRadius: 14, padding: "18px 22px", boxShadow: "0 1px 3px rgba(16,16,24,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, transition: "box-shadow 0.15s ease, transform 0.15s ease" }}
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
              <PctBadge pct={pctOf(PISCINE)} />
            </div>
          </div>
        </div>

        {/* Ligne 4 — bouton de déploiement (inactif pour l'instant) */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
          <button
            type="button"
            onClick={() => { /* inactif — le mode Pilote n'est pas encore déployable */ }}
            title="Bientôt"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, color: "#fff", background: "#4E49FC", border: "none", borderRadius: 12, padding: "14px 30px", cursor: "pointer", boxShadow: "0 4px 14px rgba(78,73,252,0.22)", opacity: 0.55 }}
          >
            <CircleDot size={17} />
            Déployer le mode Pilote
          </button>
        </div>

        {/* Séparateur pointillé + distance avant l'encart Hors automatisation */}
        <div style={{ borderTop: "2px dashed #D7D7DF", margin: "44px 0 28px" }} />

        {/* Ligne 5 — encart dossiers exclus (vide pour l'instant) */}
        <div style={sectionLabel}>Hors automatisation</div>
        <div style={{ background: "#fff", border: "1px dashed #D7D7DF", borderRadius: 12, padding: "20px 18px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", marginBottom: 4 }}>Dossiers exclus des automatisations</div>
          <p style={{ fontSize: 12.5, color: "#8A8A99", margin: 0 }}>À remplir — reprendra les mêmes infos que l&apos;encart de fin du mode Semi-Auto.</p>
        </div>
      </div>

      {/* Vue agrandie d'une carte (recouvre le board, pas tout l'écran) */}
      {selected && (
        <div
          onClick={close}
          style={{ position: "absolute", inset: 0, background: "rgba(251,251,253,0.82)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, zIndex: 20, borderRadius: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", width: "100%", maxWidth: 620, maxHeight: "100%", overflowY: "auto", background: "#fff", border: "1px solid #E4E4EA", borderRadius: 16, boxShadow: "0 12px 40px rgba(16,16,24,0.16)", padding: "26px 28px" }}
          >
            <button
              onClick={close}
              aria-label="Fermer"
              style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E8EC", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#656576", zIndex: 1 }}
            >
              <X size={16} />
            </button>

            {!selectedTask ? (
              /* Niveau 1 — détail de la carte : infos + liste des tâches */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span style={{ display: "inline-flex", width: 34, height: 34, borderRadius: 9, background: "#EEF0FF", alignItems: "center", justifyContent: "center" }}>
                    <CircleDot size={18} style={{ color: "#4E49FC" }} />
                  </span>
                  <span style={{ fontSize: 21, fontWeight: 700, color: "#26262C", letterSpacing: "-0.01em" }}>{selected.title}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
                  <StatusPill deployed={selected.deployed} big />
                  <PctBadge pct={pctOf(selected)} big />
                </div>

                <div style={{ borderTop: "1px dashed #E8E8EC", paddingTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 12 }}>
                    Tâches{selected.tasks.length ? ` (${selected.tasks.filter((t) => t.automated).length}/${selected.tasks.length} automatisées)` : ""}
                  </div>
                  {selected.tasks.length === 0 ? (
                    <p style={{ fontSize: 14, color: "#8A8A99", fontStyle: "italic", margin: 0 }}>Aucune tâche renseignée pour l&apos;instant.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {selected.tasks.map((t) => (
                        <div
                          key={t.key}
                          onClick={() => setSelectedTask(t)}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 14px", border: "1px solid #E8E8EC", borderRadius: 10, cursor: "pointer", background: "#fff", transition: "background 0.12s ease" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#FAFAFC"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>{t.name}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <TaskStatus automated={t.automated} />
                            <ChevronRight size={15} style={{ color: "#C7C7D2" }} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Niveau 2 — détail d'une tâche (vide pour l'instant) */
              <>
                <button
                  onClick={() => setSelectedTask(null)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}
                >
                  <ChevronRight size={15} style={{ transform: "rotate(180deg)" }} /> Retour aux tâches
                </button>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 8 }}>{selected.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#26262C", letterSpacing: "-0.01em" }}>{selectedTask.name}</span>
                  <TaskStatus automated={selectedTask.automated} big />
                </div>
                <div style={{ borderTop: "1px dashed #E8E8EC", paddingTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 10 }}>Détail de la tâche</div>
                  <p style={{ fontSize: 14, color: "#8A8A99", fontStyle: "italic", margin: 0 }}>
                    À venir (ex. : nombre de dossiers qui se traitent automatiquement dans le temps une fois déployé).
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
