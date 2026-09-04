"use client";

// Mode « Pilote » — MAQUETTE esthétique uniquement (à remplir/coder ensuite).
// Vue façon n8n : funnel principal + parcours ODR + Piscine (+ bouton de déploiement).
// Chaque carte : titre / état (déployé = vert, non déployé = rouge) / % d'automatisation.
// Placeholder : tout en « Non déployé » + « 0% automatisé ». Clic → vue agrandie.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown, CircleDot, X, Rocket, Square, Loader2, History } from "lucide-react";

// Synthèse (description) par tâche automatisée, affichée dans le détail tâche.
const TASK_DETAIL: Record<string, string> = {
  remplissage_infos:
    "Une fois le mode Pilote déployé, cette tâche fait tourner l'Automatisation 1 (pré-remplissage depuis Front) en autonomie : elle traite 5 dossiers en « Identification » chaque minute, complète les informations manquantes (assureur, n° de contrat, mail courtier) et ne repasse jamais deux fois sur le même dossier, jusqu'à épuisement du lot ou arrêt manuel. À l'arrêt, un recap de session est archivé dans l'historique.",
  relancer_gestionnaires:
    "Une fois le mode Pilote déployé, cette tâche relance automatiquement (dans le thread Slack) les gestionnaires qui n'ont pas répondu à une proposition de devis depuis plus de 2 jours. UNE seule relance par dossier (elle sort de la boucle dès qu'une relance est envoyée). Avant chaque envoi, elle vérifie qu'il n'y a eu ni réponse, ni commentaire, ni réaction emoji sur le message — et ne relance jamais le week-end. Passe toutes les heures.",
};

// Type d'état renvoyé par /api/pilote/status.
type PiloteStats = { runs: number; traites: number; completes: number; sansInfo: number; erreurs: number; relances: number };
type PiloteRecap = { id: string; startedAt: string; endedAt: string; stats: PiloteStats };
type RecentItem = { nom: string; champs: string[]; wroteFields: boolean; at: string };
type PiloteStatus = { deployed: boolean; startedAt: string | null; stats: PiloteStats; recent: RecentItem[]; history: PiloteRecap[] };
// Libellés lisibles des champs complétés par l'autofill.
const CHAMP_LABEL: Record<string, string> = { assureurActuel: "assureur", numeroContrat: "n° contrat", contactCourtierEmail: "mail courtier", courtierActuel: "courtier", primeActuelle: "prime", adresse: "adresse" };
const champLabel = (k: string) => CHAMP_LABEL[k] ?? k;

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// 1 tâche = 1 ligne dans la vue agrandie d'une carte. Le % d'automatisation de la carte
// est DÉRIVÉ des tâches (automatisées / total) → il s'actualise tout seul dès qu'on
// bascule une tâche en « automatisé ». Les tâches se renseignent carte par carte ;
// pour l'instant toutes les listes sont vides → 0 %.
type Task = { key: string; name: string; automated: boolean };
// manualOnly = étape 100% manuelle par nature (jamais automatisée) → badge « Manuel »
// dédié au lieu du couple statut/%.
type CardData = { key: string; title: string; deployed: boolean; tasks: Task[]; manualOnly?: boolean };

// % automatisé d'une carte = part des tâches automatisées (0 si aucune tâche).
const pctOf = (c: CardData): number => (c.tasks.length ? Math.round((c.tasks.filter((t) => t.automated).length / c.tasks.length) * 100) : 0);

const FUNNEL: CardData[] = [
  { key: "identification", title: "Identification", deployed: false, tasks: [
    { key: "remplissage_infos", name: "Remplissage des informations manquantes", automated: true },
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
    { key: "relancer_gestionnaires", name: "Relancer les gestionnaires", automated: true },
  ] },
  { key: "validation_cs", title: "Validation du CS", deployed: false, tasks: [], manualOnly: true },
  { key: "signe", title: "Signé", deployed: false, tasks: [], manualOnly: true },
];

const ODR: CardData[] = [
  { key: "odr_en_cours", title: "ODR en cours", deployed: false, tasks: [
    { key: "verifier_infos", name: "Vérifier les infos", automated: false },
    { key: "retrouver_infos_manquantes", name: "Retrouver les infos manquantes", automated: false },
  ] },
  { key: "odr_envoye", title: "ODR envoyé", deployed: false, tasks: [
    { key: "verifier_doublons", name: "Vérifier les doublons", automated: false },
    { key: "envoyer_partenaires", name: "Envoyer aux partenaires", automated: false },
  ] },
  { key: "odr_accepte", title: "ODR accepté", deployed: false, tasks: [], manualOnly: true },
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

function ManualBadge({ big }: { big?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: big ? "5px 12px" : "3px 9px", borderRadius: 999, fontSize: big ? 13 : 11, fontWeight: 700, background: "#4E49FC", color: "#fff", whiteSpace: "nowrap", maxWidth: "100%" }}>
      <span style={{ width: big ? 7 : 6, height: big ? 7 : 6, borderRadius: "50%", background: "#fff", flexShrink: 0 }} />
      {big ? "Manuel — pas d'automatisation" : "Manuel"}
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
        {data.manualOnly ? (
          <ManualBadge />
        ) : (
          <>
            <StatusPill deployed={data.deployed} />
            <PctBadge pct={pctOf(data)} />
          </>
        )}
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

  // État Pilote (déployé ?, stats en cours, historique) + actions déployer/stopper.
  const [status, setStatus] = useState<PiloteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [recap, setRecap] = useState<PiloteRecap | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const deployed = !!status?.deployed;

  const load = useCallback(async () => {
    try { const r = await fetch("/api/pilote/status"); const j = await r.json(); if (j?.success) setStatus(j as PiloteStatus); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Rafraîchit les stats en direct quand c'est déployé.
  useEffect(() => { if (!deployed) return; const t = setInterval(load, 15_000); return () => clearInterval(t); }, [deployed, load]);

  // MOTEUR (secours fiable) côté client : tant que le mode est déployé ET cette page
  // ouverte, on déclenche un cycle (5 dossiers) chaque minute. Indispensable tant que
  // le service cron Railway n'a pas repris la nouvelle config. L'autofill est idempotent
  // (curseur autofillTenteLe) → aucun double traitement même avec plusieurs onglets.
  const ticking = useRef(false);
  useEffect(() => {
    if (!deployed) return;
    const tick = async () => {
      if (ticking.current) return;
      ticking.current = true;
      try { await fetch("/api/cron/pilote-identification", { method: "POST" }); await load(); }
      catch { /* réseau */ } finally { ticking.current = false; }
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [deployed, load]);

  const deploy = async () => { setBusy(true); try { const r = await fetch("/api/pilote/deploy", { method: "POST" }); const j = await r.json(); if (j?.success) setStatus(j as PiloteStatus); } finally { setBusy(false); } };
  const stop = async () => { setBusy(true); try { const r = await fetch("/api/pilote/stop", { method: "POST" }); const j = await r.json(); if (j?.recap) setRecap(j.recap as PiloteRecap); await load(); } finally { setBusy(false); } };

  // Reflète l'état déployé sur toute carte ayant au moins une tâche automatisée.
  const withDeploy = (c: CardData): CardData => (c.tasks.some((t) => t.automated) ? { ...c, deployed } : c);

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
                <FlowCard data={withDeploy(c)} onClick={() => setSelected(withDeploy(c))} />
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

        {/* Ligne 4 — bouton déployer / stopper + stats en direct */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 40 }}>
          <button
            type="button"
            onClick={deployed ? stop : deploy}
            disabled={busy}
            style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, color: "#fff", background: deployed ? "#CA1E12" : "#4E49FC", border: "none", borderRadius: 12, padding: "14px 30px", cursor: busy ? "wait" : "pointer", boxShadow: deployed ? "0 4px 14px rgba(202,30,18,0.22)" : "0 4px 14px rgba(78,73,252,0.22)", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <Loader2 size={17} /> : deployed ? <Square size={16} /> : <Rocket size={17} />}
            {deployed ? "Stopper le mode Pilote" : "Déployer le mode Pilote"}
          </button>
          {deployed && status && (
            <div style={{ fontSize: 12.5, color: "#656576", textAlign: "center" }}>
              🟢 En autonomie depuis {status.startedAt ? fmtDateTime(status.startedAt) : "—"} · <strong>{status.stats.traites}</strong> dossiers traités · <strong>{status.stats.completes}</strong> infos complétées · <strong>{status.stats.relances}</strong> relances gestio
            </div>
          )}
        </div>

        {/* Historique des sessions Pilote (menu déroulant) */}
        {status && status.history.length > 0 && (
          <div style={{ marginTop: 22, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
            <button onClick={() => setHistOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}>
              <History size={15} /> Historique des sessions Pilote ({status.history.length})
              <ChevronDown size={15} style={{ transform: histOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {histOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {status.history.map((h) => (
                  <div key={h.id} style={{ border: "1px solid #E8E8EC", borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#26262C", marginBottom: 4 }}>Session Pilote {fmtDateTime(h.startedAt)} – {fmtDateTime(h.endedAt)}</div>
                    <div style={{ fontSize: 12.5, color: "#656576" }}><strong>{h.stats.traites}</strong> dossiers traités · <strong>{h.stats.completes}</strong> infos complétées · <strong>{h.stats.relances}</strong> relances gestio · {h.stats.sansInfo} sans info · {h.stats.erreurs} erreurs · {h.stats.runs} cycles</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                  {selected.manualOnly ? (
                    <ManualBadge big />
                  ) : (
                    <>
                      <StatusPill deployed={selected.deployed} big />
                      <PctBadge pct={pctOf(selected)} big />
                    </>
                  )}
                </div>

                <div style={{ borderTop: "1px dashed #E8E8EC", paddingTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#8A8A99", textTransform: "uppercase", marginBottom: 12 }}>
                    Tâches{!selected.manualOnly && selected.tasks.length ? ` (${selected.tasks.filter((t) => t.automated).length}/${selected.tasks.length} automatisées)` : ""}
                  </div>
                  {selected.manualOnly ? (
                    <p style={{ fontSize: 14, color: "#8A8A99", fontStyle: "italic", margin: 0 }}>Étape 100% manuelle — pas d&apos;automatisation prévue.</p>
                  ) : selected.tasks.length === 0 ? (
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
                  {TASK_DETAIL[selectedTask.key] ? (
                    <p style={{ fontSize: 14, color: "#3A3A44", lineHeight: 1.55, margin: 0 }}>{TASK_DETAIL[selectedTask.key]}</p>
                  ) : (
                    <p style={{ fontSize: 14, color: "#8A8A99", fontStyle: "italic", margin: 0 }}>À venir (ex. : nombre de dossiers qui se traitent automatiquement dans le temps une fois déployé).</p>
                  )}
                  {selectedTask.key === "remplissage_infos" && deployed && status && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#34C759", boxShadow: "0 0 0 4px rgba(52,199,89,0.18)" }} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#13762C" }}>Suivi en direct</span>
                        <span style={{ fontSize: 12, color: "#8A8A99" }}>· {status.stats.traites} traités · {status.stats.completes} complétés · {status.stats.runs} cycles</span>
                      </div>
                      {status.recent.length === 0 ? (
                        <p style={{ fontSize: 13, color: "#8A8A99", fontStyle: "italic", margin: 0 }}>En attente du prochain cycle (5 dossiers par minute)…</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", border: "1px solid #E8E8EC", borderRadius: 10, padding: 8, background: "#FAFAFC" }}>
                          {status.recent.map((it, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "8px 10px", background: "#fff", border: "1px solid #EEEEF2", borderRadius: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#26262C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.nom}</div>
                                <div style={{ fontSize: 12, color: it.wroteFields ? "#13762C" : "#8A8A99", marginTop: 2 }}>
                                  {it.wroteFields ? `✓ ${it.champs.map(champLabel).join(", ")}` : "aucune info trouvée"}
                                </div>
                              </div>
                              <span style={{ fontSize: 11, color: "#B0B0BC", whiteSpace: "nowrap" }}>{new Date(it.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p style={{ fontSize: 11.5, color: "#B0B0BC", margin: "8px 0 0" }}>Actualisé automatiquement · cadence 5 dossiers / minute.</p>
                    </div>
                  )}
                  {selectedTask.key === "relancer_gestionnaires" && deployed && status && (
                    <div style={{ marginTop: 16, background: "#EFFBF2", border: "1px solid #CDEFD6", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#13762C" }}>
                      🟢 Active depuis {status.startedAt ? fmtDateTime(status.startedAt) : "—"} — <strong>{status.stats.relances}</strong> relance(s) gestio envoyée(s). Scan Slack + envoi toutes les heures.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recap de session affiché à l'arrêt du mode Pilote */}
      {recap && (
        <div onClick={() => setRecap(null)} style={{ position: "absolute", inset: 0, background: "rgba(251,251,253,0.9)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, zIndex: 30, borderRadius: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 480, background: "#fff", border: "1px solid #E4E4EA", borderRadius: 16, boxShadow: "0 12px 40px rgba(16,16,24,0.18)", padding: "26px 28px" }}>
            <button onClick={() => setRecap(null)} aria-label="Fermer" style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E8EC", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#656576" }}>
              <X size={16} />
            </button>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: "#13762C", textTransform: "uppercase", marginBottom: 6 }}>Session Pilote terminée</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#26262C", marginBottom: 18 }}>{fmtDateTime(recap.startedAt)} – {fmtDateTime(recap.endedAt)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Dossiers traités", value: recap.stats.traites, accent: "#4E49FC" },
                { label: "Infos complétées", value: recap.stats.completes, accent: "#13762C" },
                { label: "Relances gestio", value: recap.stats.relances, accent: "#4E49FC" },
                { label: "Sans info trouvée", value: recap.stats.sansInfo, accent: "#8A8A99" },
                { label: "Erreurs", value: recap.stats.erreurs, accent: recap.stats.erreurs > 0 ? "#CA1E12" : "#8A8A99" },
              ].map((s) => (
                <div key={s.label} style={{ border: "1px solid #E8E8EC", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.accent }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#656576", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: "#8A8A99", marginTop: 14 }}>{recap.stats.runs} cycles de traitement · archivé dans l&apos;historique des sessions Pilote.</div>
          </div>
        </div>
      )}
    </div>
  );
}
