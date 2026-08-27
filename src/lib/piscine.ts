// Volet 4 « Piscine » de l'Automatisation 8.
//
// La Piscine est une VUE DOUBLON, en LECTURE, de tous les dossiers qu'une
// automatisation a mis de côté parce qu'ils réclament une intervention humaine
// (mail bloqué, relance suspendue, réponse à qualifier, divergence de donnée…).
//
// Principe d'architecture — « read-model dérivé » :
//   Chaque cas est RE-CALCULÉ à chaque rendu à partir de la source de vérité de
//   l'automatisation d'origine (les mêmes getters qui alimentent ses volets).
//   Il n'y a donc AUCUN état propre à la Piscine à maintenir : quand la condition
//   d'origine disparaît (mail corrigé, relance relancée, verdict validé,
//   divergence levée…), le cas quitte AUTOMATIQUEMENT la Piscine ET le volet
//   d'origine au chargement suivant. C'est ce qui garantit la synchro et le
//   « reroutage auto » demandés, sans risque de désynchronisation.
//
//   `buildPiscine` est une fonction PURE : elle ne fait aucune requête, elle
//   agrège des données déjà chargées par la page. Zéro requête en plus.

export type PiscineTone = "warn" | "danger" | "info";

export type PiscineCase = {
  id: string;
  auto: number;
  autoLabel: string;
  kind: string;
  kindLabel: string;
  tone: PiscineTone;
  coproNom: string;
  pipelineUrl: string | null; // fiche dossier (/pipeline/{id})
  frontUrl: string | null; // conversation Front si connue
  detail: string;
};

export type PiscineGroup = { auto: number; autoLabel: string; count: number };
export type PiscineState = { total: number; groups: PiscineGroup[]; cases: PiscineCase[] };

// --- Entrées minimales (découplées des types sources pour rester stable) ---
type OdrFlagged = { pipelineId: string; nom: string; adresse: string | null; numeroContrat: string | null };
type Rs4HoldRow = { pipelineId: string; nom: string; adresse: string | null; hold: boolean; holdReason: string };
type Rs4RelanceRow = {
  pipelineId: string;
  nom: string;
  adresse: string | null;
  relancePaused: boolean;
  devisMixup: boolean;
  replyConvUrl: string | null;
};
type CsRow = {
  pipelineId: string;
  nom: string;
  adresse: string | null;
  replyKind: string | null;
  proposedStatut: "accepte" | "refus" | null;
  snippet: string | null;
  convUrl: string | null;
};
type GhcReview = { id: string; buildingId: string; coproNom: string; kind: string; message: string };

export type PiscineInput = {
  odrFlagged: OdrFlagged[];
  rs4Holds: Rs4HoldRow[];
  rs4Relances: Rs4RelanceRow[];
  csReplies: CsRow[];
  ghcReviews: GhcReview[];
  ghcReviewLabel: Record<string, string>;
  // Résout le building_id d'une revue GHC vers un pipelineId (pour lier le nom au dossier).
  ghcPipelineByBuilding: Record<string, string>;
};

const pipelineUrl = (id: string) => `/pipeline/${id}`;

export function buildPiscine(input: PiscineInput): PiscineState {
  const cases: PiscineCase[] = [];

  // 1) Auto 2 — ODR à revoir : marqueurs « Possible faux ODR » / « Probable Wakam »
  //    posés par l'identification, non encore levés. Source : buckets ODR (flagged).
  for (const d of input.odrFlagged) {
    cases.push({
      id: `2:odr_flag:${d.pipelineId}`,
      auto: 2,
      autoLabel: "Auto 2 — ODR",
      kind: "odr_flag",
      kindLabel: "ODR à revoir (faux ODR / Wakam)",
      tone: "warn",
      coproNom: d.adresse || d.nom,
      pipelineUrl: pipelineUrl(d.pipelineId),
      frontUrl: null,
      detail: "Assureur incohérent avec le porteur ODR — vérifier avant envoi.",
    });
  }

  // 2) Auto 4 — mail courtier bloqué : le plan d'envoi RS est en « hold »
  //    (mail blacklisté, domaine perso, = mail du CS, courtier introuvable…).
  for (const r of input.rs4Holds) {
    if (!r.hold) continue;
    cases.push({
      id: `4:mail_bloque:${r.pipelineId}`,
      auto: 4,
      autoLabel: "Auto 4 — Envoi RS",
      kind: "mail_bloque",
      kindLabel: "Mail courtier bloqué",
      tone: "danger",
      coproNom: r.adresse || r.nom,
      pipelineUrl: pipelineUrl(r.pipelineId),
      frontUrl: null,
      detail: r.holdReason || "Envoi retenu — mail courtier à corriger à la main.",
    });
  }

  // 3) Auto 4 — relance suspendue à la main + mélange devis/RS détecté.
  for (const r of input.rs4Relances) {
    if (r.relancePaused) {
      cases.push({
        id: `4:relance_pause:${r.pipelineId}`,
        auto: 4,
        autoLabel: "Auto 4 — Relances RS",
        kind: "relance_pause",
        kindLabel: "Relance en pause",
        tone: "info",
        coproNom: r.adresse || r.nom,
        pipelineUrl: pipelineUrl(r.pipelineId),
        frontUrl: r.replyConvUrl,
        detail: "Sortie manuellement de la boucle de relance — à trancher.",
      });
    }
    if (r.devisMixup) {
      cases.push({
        id: `4:devis_mixup:${r.pipelineId}`,
        auto: 4,
        autoLabel: "Auto 4 — Relances RS",
        kind: "devis_mixup",
        kindLabel: "Mélange devis / RS",
        tone: "warn",
        coproNom: r.adresse || r.nom,
        pipelineUrl: pipelineUrl(r.pipelineId),
        frontUrl: r.replyConvUrl,
        detail: "Un devis semble être arrivé à la place d'un RS — à vérifier.",
      });
    }
  }

  // 4) Auto 7 — réponse du CS à qualifier : réponse détectée mais pas un accord net
  //    (refus, ou « autre » non classé) → décision manuelle avant de faire avancer.
  for (const r of input.csReplies) {
    if (!r.replyKind) continue;
    if (r.proposedStatut === "accepte") continue; // accord net : géré au volet, pas un blocage
    cases.push({
      id: `7:cs_a_qualifier:${r.pipelineId}`,
      auto: 7,
      autoLabel: "Auto 7 — Suivi CS",
      kind: "cs_a_qualifier",
      kindLabel: r.proposedStatut === "refus" ? "Réponse CS : refus" : "Réponse CS à qualifier",
      tone: r.proposedStatut === "refus" ? "danger" : "warn",
      coproNom: r.adresse || r.nom,
      pipelineUrl: pipelineUrl(r.pipelineId),
      frontUrl: r.convUrl,
      detail: r.snippet ? r.snippet.slice(0, 160) : "Réponse du conseil syndical à traiter.",
    });
  }

  // 5) Auto 8 (V3) — divergences & cas particuliers GHC à contrôler.
  for (const rv of input.ghcReviews) {
    const pid = input.ghcPipelineByBuilding[rv.buildingId];
    cases.push({
      id: `8:ghc:${rv.id}`,
      auto: 8,
      autoLabel: "Auto 8 — GHC",
      kind: rv.kind,
      kindLabel: input.ghcReviewLabel[rv.kind] ?? rv.kind,
      tone: "warn",
      coproNom: rv.coproNom,
      pipelineUrl: pid ? pipelineUrl(pid) : null,
      frontUrl: null,
      detail: rv.message,
    });
  }

  // Regroupement par automatisation (pour les compteurs / filtres).
  const groupsMap = new Map<number, PiscineGroup>();
  for (const c of cases) {
    const g = groupsMap.get(c.auto);
    if (g) g.count += 1;
    else groupsMap.set(c.auto, { auto: c.auto, autoLabel: c.autoLabel.replace(/ —.*$/, ""), count: 1 });
  }
  const groups = [...groupsMap.values()].sort((a, b) => a.auto - b.auto);

  return { total: cases.length, groups, cases };
}
