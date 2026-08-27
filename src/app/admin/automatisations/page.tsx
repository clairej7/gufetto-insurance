export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { AutofillBatchButton } from "@/components/admin/autofill-batch-button";
import { IdentifyScanControls } from "@/components/admin/identify-scan-controls";
import { countIdentifyDossiers, getIdentifyHistory } from "@/lib/autofill-identify";
import { getAutofillHistory } from "@/lib/autofill-batch";
import { VerifyPrimesBatchButton } from "@/components/admin/verify-primes-batch-button";
import { OdrControls } from "@/components/admin/odr-controls";
import { PrimeBatchButton } from "@/components/admin/prime-batch-button";
import { PerimeBatchButton } from "@/components/admin/perime-batch-button";
import { getPrimeCleanHistory } from "@/lib/prime";
import { computePerimeState, getPerimeCleanHistory, ensurePerimeBaseline } from "@/lib/perime";
import { GhcImportControls } from "@/components/admin/ghc-import-controls";
import { computeGhcState, getGhcImportHistory, getGhcReviews } from "@/lib/ghc";
import { getCourtierRefState, getCourtierRefSample } from "@/lib/courtier-ref";
import { CourtierAuditControls } from "@/components/admin/courtier-audit-controls";
import { getRs4Volet1Count, getRs4Volet2Data, getRs4DetectorData, getRs4Volet3Data, getRs4Volet4Data, getRs4SendHistory } from "@/lib/rs4";
import { Rs4Controls } from "@/components/admin/rs4-controls";
import { getDevis5Volet1Data, getDevis5DocsToLoad, getDocLoadHistory, getDevis5NoDocs, getDevis5Volet4Data, getDevis5Volet2Data, getDevis5Auto6History } from "@/lib/devis5";
import { getDevis5Lots } from "@/lib/devis5-excel";
import { getDevis6TableData } from "@/lib/devis6";
import { Devis6Controls } from "@/components/admin/devis6-controls";
import { getDevis7TableData } from "@/lib/devis7";
import { getDevis7Volet2, getDevis7CsHistory } from "@/lib/devis7-cs";
import { Devis7Controls } from "@/components/admin/devis7-controls";
import { getDocsStats } from "@/lib/rs-docs";
import { Devis5Controls } from "@/components/admin/devis5-controls";
import { getExclusionState } from "@/lib/exclusions";
import { ExclusionsPanel } from "@/components/admin/exclusions-panel";
import { getOdrByPartner, getOdrSent, getOdrSendHistory, ODR_TEMPLATE_TEXT } from "@/lib/odr";
import { buildPiscine } from "@/lib/piscine";
import { PiscinePanel } from "@/components/admin/piscine-panel";
import { AutomationModeTabs } from "@/components/admin/automation-mode-tabs";

type Etat = "deploye" | "encours" | "attente";
const ETATS: Record<Etat, { label: string; bg: string; fg: string; dot: string }> = {
  deploye: { label: "Déployé",    bg: "#EFFBF2", fg: "#13762C", dot: "#34C759" },
  encours: { label: "En cours",   bg: "#FFF7EB", fg: "#955804", dot: "#F5A623" },
  attente: { label: "En attente", bg: "#FFF5F5", fg: "#CA1E12", dot: "#F26D6D" },
};

export default async function AutomatisationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/pipeline");

  // Dossiers réellement éligibles au batch de l'automatisation 1 : "Identification"
  // (identifie), non archivés, et PAS déjà classés clos/gagnés (client MRI hors Wakam).
  const eligibleAuto1 = await prisma.insurancePipeline.count({
    where: {
      statut: "identifie",
      copro: {
        archivedAt: null,
        NOT: {
          clientMriStatut: "Insurance client",
          NOT: { assureurActuel: { contains: "wakam", mode: "insensitive" } },
        },
      },
    },
  });

  // Auto 1 Volet 1 « Remplissage » : historique des runs.
  const autofillHistory = (await getAutofillHistory()).map((h) => ({ ...h, date: h.date.toISOString() }));

  // Auto 1 Volet 2 « Identification des dossiers » : périmètre exact du scan + historique.
  const identifyTotal = await countIdentifyDossiers();
  const identifyHistory = (await getIdentifyHistory()).map((h) => ({ ...h, date: h.date.toISOString() }));

  // Dossiers en « Comparaison des devis » (devis_recus) dont on peut vérifier la prime.
  const eligibleAuto6 = await prisma.insurancePipeline.count({
    where: { statut: "devis_recus", copro: { archivedAt: null } },
  });

  // ODR non encore envoyés, groupés par assureur (Automatisation 2).
  const odrBuckets = await getOdrByPartner();
  const odrPartners = odrBuckets.map((b) => ({
    key: b.key,
    label: b.label,
    ready: b.ready.length,
    missing: b.missingNum.length,
    flagged: b.flagged.length,
    flaggedReady: b.flagged.filter((d) => d.numeroContrat).length,
    // Listes détaillées pour les menus déroulants cliquables (lien fiche par dossier).
    missingList: b.missingNum.map((d) => ({ pipelineId: d.pipelineId, nom: d.nom, adresse: d.adresse, numeroContrat: d.numeroContrat })),
    flaggedList: b.flagged.map((d) => ({ pipelineId: d.pipelineId, nom: d.nom, adresse: d.adresse, numeroContrat: d.numeroContrat })),
  }));
  // Ensemble « déjà envoyées » par assureur (docs fournis + base) pour les tables.
  const odrSent: Record<string, { adresse: string; numeroContrat: string }[]> = {};
  for (const b of odrBuckets) odrSent[b.key] = await getOdrSent(b.key);
  // Historique des envois ODR (une ligne par envoi).
  const odrHistory = await getOdrSendHistory();

  // Automatisation 8 « clean prime » : dossiers sans prime (copro active) + historique.
  const eligibleAuto8 = await prisma.insurancePipeline.count({
    where: { copro: { archivedAt: null, primeActuelle: null } },
  });
  // Non encore tentés (ce que le batch va réellement traiter).
  const eligibleAuto8Untried = await prisma.insurancePipeline.count({
    where: { copro: { archivedAt: null, primeActuelle: null, primeVerifTenteLe: null } },
  });
  const primeHistory = await getPrimeCleanHistory();
  // Composant « clean avis d'échéance » : compteurs live (concernés / résolus) + historique.
  await ensurePerimeBaseline();
  const perime = await computePerimeState();
  const perimeHistory = await getPerimeCleanHistory();
  // Volet 3 « correction GetHumanCall » : état source + historique imports + rapport.
  const ghcState = await computeGhcState();
  const ghcHistory = await getGhcImportHistory();
  const ghcReviews = await getGhcReviews();
  // Auto 3 — base de référence courtiers.
  const courtierState = await getCourtierRefState();
  const courtierSample = await getCourtierRefSample();
  const rs4Volet1Count = await getRs4Volet1Count();
  const rs4Volet2 = await getRs4Volet2Data();
  const rs4Detector = await getRs4DetectorData(Date.now());
  const rs4Volet3 = await getRs4Volet3Data(Date.now());
  const rs4Volet4 = await getRs4Volet4Data(Date.now());
  const rs4SendHistory = await getRs4SendHistory();
  const devis5Volet1 = await getDevis5Volet1Data();
  const devis5ToLoad = await getDevis5DocsToLoad();
  const devis5DocHistory = await getDocLoadHistory();
  const devis5NoDocs = await getDevis5NoDocs();
  const devis5Volet2 = await getDevis5Volet2Data();
  const devis5Suivi = await getDevis5Volet4Data(Date.now());
  const devis5Auto6History = await getDevis5Auto6History();
  const devis5Lots = await getDevis5Lots();
  const devis6Table = await getDevis6TableData();
  const devis7Table = await getDevis7TableData();
  const devis7Volet2 = await getDevis7Volet2();
  const devis7CsHistory = await getDevis7CsHistory();
  const docsStats = await getDocsStats();
  const exclusionState = await getExclusionState();
  const ghcReviewLabel: Record<string, string> = { assureur_divergent: "Assureur divergent", courtier_divergent: "Courtier divergent", numero_divergent: "N° divergent", echeance_divergente: "Échéance divergente", prime_divergente: "Prime divergente", prime_suspecte: "Prime suspecte", odr_conflit: "Conflit ODR", rs_vers_odr: "Devrait être ODR" };

  // Volet 4 « Piscine » : read-model dérivé en direct des sources déjà chargées
  // ci-dessus (aucune requête en plus, hormis la résolution des liens dossier GHC)
  // → synchro automatique avec les autos.
  const ghcBuildingIds = [...new Set(ghcReviews.map((rv) => rv.buildingId))];
  const ghcPipelines = ghcBuildingIds.length
    ? await prisma.insurancePipeline.findMany({ where: { copro: { buildingId: { in: ghcBuildingIds } } }, select: { id: true, copro: { select: { buildingId: true } } } })
    : [];
  const ghcPipelineByBuilding: Record<string, string> = {};
  for (const p of ghcPipelines) { const b = p.copro?.buildingId; if (b && !ghcPipelineByBuilding[b]) ghcPipelineByBuilding[b] = p.id; }
  const piscineState = buildPiscine({
    odrFlagged: odrBuckets.flatMap((b) => b.flagged.map((d) => ({ pipelineId: d.pipelineId, nom: d.nom, adresse: d.adresse, numeroContrat: d.numeroContrat }))),
    rs4Holds: rs4Volet2.rows.map((r) => ({ pipelineId: r.pipelineId, nom: r.nom, adresse: r.adresse, hold: r.hold, holdReason: r.holdReason })),
    rs4Relances: rs4Volet3.rows.map((r) => ({ pipelineId: r.pipelineId, nom: r.nom, adresse: r.adresse, relancePaused: r.relancePaused, devisMixup: r.devisMixup, replyConvUrl: r.replyConvUrl })),
    csReplies: devis7Volet2.rows.map((r) => ({ pipelineId: r.pipelineId, nom: r.nom, adresse: r.adresse, replyKind: r.replyKind, proposedStatut: r.proposedStatut, snippet: r.snippet, convUrl: r.convUrl })),
    ghcReviews: ghcReviews.map((rv) => ({ id: rv.id, buildingId: rv.buildingId, coproNom: rv.coproNom, kind: rv.kind, message: rv.message })),
    ghcReviewLabel,
    ghcPipelineByBuilding,
  });

  // Lien de téléchargement d'une version GHC en historique :
  //  - upload self-service (fileName = chemin de stockage) → route de download ;
  //  - versions historiques v1/v2 → fichiers statiques committés dans /public/ghc.
  const GHC_STATIC_FILES: Record<string, string> = {
    v1: "/ghc/GHC-cleaning-contrats-assurance-v1.xlsx",
    v2: "/ghc/GHC-cleaning-contrats-assurance-v2.xlsx",
  };
  const ghcHistoryHref = (h: { id: string; label: string; fileName: string | null }): string | null => {
    if (h.fileName && h.fileName.startsWith("ghc-imports/")) return `/api/ghc/download?run=${h.id}`;
    return GHC_STATIC_FILES[h.label?.toLowerCase()] ?? null;
  };
  const eur0 = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €";

  const automations: {
    n: number;
    nom: string;
    etat: Etat;
    description: string[];
  }[] = [
    {
      n: 1,
      nom: "Pré-remplissage depuis Front",
      etat: "deploye",
      description: [
        "Pour chaque copropriété, l'automatisation interroge Front (l'ensemble des échanges rattachés au dossier via le building_id) et en extrait les 3 informations clés du contrat d'assurance : le mail du courtier/assureur, le nom de l'assureur porteur, et le numéro de contrat.",
        "Elle écrit ces informations dans le dossier en mode « fill-if-empty » (elle ne remplace jamais une donnée déjà présente), pose un cliquet pour protéger ces champs des synchros Omni nocturnes, puis aiguille automatiquement le dossier : assureur partenaire (AXA, Generali, SADA, Mila) → ODR ; dossier fiable mais non partenaire → Récupération du RS ; sinon → reste en Identification.",
        "Les cas ambigus sont signalés pour revue manuelle plutôt que traités à l'aveugle : courtier trouvé dans le champ assureur (corrigé + noté), ex-assuré Matera / probable Wakam, ou conflit de porteur (« Possible faux ODR »). Le batch ci-dessous ne touche jamais un dossier déjà gagné/client.",
      ],
    },
    {
      n: 2,
      nom: "ODR — Ordre de Remplacement",
      etat: "deploye",
      description: [
        "Lorsqu'une copropriété est déjà assurée chez l'un des 4 partenaires (AXA, Generali, SADA, Mila), Matera peut devenir directement le nouveau courtier via un Ordre de Remplacement — sans passer par la demande de RS ni par les devis. C'est un raccourci majeur du pipeline.",
        "L'identification et le rangement des dossiers dans l'étape « ODR en cours » sont déjà assurés par l'automatisation 1 (les deux sont fusionnées sur la partie routage).",
        "L'envoi de l'ordre de remplacement est désormais outillé (contrôles ci-dessous) : par assureur, on sort la liste des copros en « ODR en cours » avec leur n° de contrat, on génère la lettre ODR remplie (PDF) et on l'envoie directement via Front — les dossiers passent alors en « ODR envoyées ». Les garde-fous sont en place : les dossiers « Possible faux ODR » (le champ assureur contredit le porteur) et « Probable Wakam » sont exclus de l'envoi, et ceux sans n° de contrat sont isolés (ils ne peuvent pas figurer dans la lettre tant que le numéro n'est pas récupéré).",
        "Trois étapes ODR dans le pipeline : « ODR en cours » (ordre identifié) → « ODR envoyées » (ordre transmis à l'assureur, en attente de réponse — encore ACTIF) → « ODR acceptés » (l'assureur a validé). Les deux premières sont dans les dossiers actifs ; « ODR acceptés » est un DEAL GAGNÉ (compté à gauche de « Signé » et « Clos »), même si notre mandat de courtier ne démarre qu'à l'échéance du contrat actuel. Le remplissage de « ODR envoyées » et « ODR acceptés » se fera à partir des listes d'ordres passés / acceptés par AXA / Generali / SADA / Mila ; le suivi détaillé par assureur est visible dans la carte « Suivi des ODR » du Tracking.",
      ],
    },
    {
      n: 3,
      nom: "Complétion du mail courtier",
      etat: "deploye",
      description: [
        "Cette automatisation s'applique uniquement à l'étape « Récupération du RS » (RS en cours). Son but : mieux trouver le mail du courtier lorsqu'il est correctement identifié, afin de pouvoir ensuite envoyer plus facilement le mail de demande de RS (automatisation 4). Elle fait deux choses, en s'appuyant sur une base de référence de courtiers et d'assureurs.",
        "1) Filtre de vérification courtier / assureur : chaque dossier arrivant du pré-remplissage est repassé au crible. L'assureur trouvé à l'étape précédente est vérifié dans la base ; s'il s'agit en réalité d'un courtier (erreur fréquente), le dossier est renvoyé à l'étape « Identification » plutôt que de rester bloqué en RS avec une donnée fausse.",
        "2) Complétion du mail courtier : quand les infos sont bonnes mais que le mail du courtier manque (non récupéré via Front), l'automatisation le complète à partir de cette même base (adresses de contact connues par cabinet / compagnie). Objectif : maximiser la part de dossiers réellement contactables avant l'envoi des demandes de RS, au lieu de les laisser bloqués faute d'adresse exploitable.",
      ],
    },
    {
      n: 4,
      nom: "Envoi des demandes de RS",
      etat: "deploye",
      description: [
        "Envoie automatiquement les demandes de relevé de sinistralité (RS) aux courtiers / assureurs via Front, à partir des infos remplies par l'automatisation 1.",
        "Gère le cycle complet : relances automatiques en l'absence de réponse, puis traitement des réponses entrantes — remercier, enregistrer le RS reçu, faire avancer le dossier à l'étape suivante, et archiver l'échange.",
        "C'est le cœur historique du projet : automatiser l'étape RS, aujourd'hui faite à la main par les gestionnaires.",
      ],
    },
    {
      n: 5,
      nom: "Demande de devis",
      etat: "deploye",
      description: [
        "Prépare et envoie les demandes de devis. Volet 1 : centralise les dossiers en « Demande des devis » et récupère les pièces (RS + contrat MRI). Volet 2 : construit le tableau Excel exigé par AXA (11 colonnes), rempli automatiquement depuis Gufetto + le contrat MRI (code couleur sûr/à vérifier/manquant), éditable, puis export .xlsx. Volet 3 : chaque Excel généré devient un lot ; on l'envoie à l'assureur puis on le marque « envoyé » (chaque dossier compte alors comme demande envoyée).",
        "L'envoi ne fait pas avancer le dossier : il reste en « Demande des devis » jusqu'à réception d'un devis (bouton « Devis obtenu » ou détecteur automatique).",
      ],
    },
    {
      n: 6,
      nom: "Comparer les devis et prévenir le gestionnaire",
      etat: "deploye",
      description: [
        "À l'étape « Comparaison des devis », la base de comparaison retient désormais la DERNIÈRE PRIME RÉELLEMENT PAYÉE (récupérée dans le mail de demande de devis envoyé à l'assureur, via le marqueur gufetto-ref) plutôt que la prime du contrat, souvent périmée. Sans ça, les devis paraissaient plus chers que la réalité.",
        "Sur chaque dossier, le bouton « Vérifier le montant » récupère cette prime, la propage partout (carte « Contrat actuel », comparatif détaillé) et régénère automatiquement la recommandation au Conseil Syndical — aucune analyse ne peut plus partir avec l'ancien chiffre erroné. Une règle de cohérence protège les cas étranges (écart anormal contrat/prime → vérification manuelle).",
        "Encore en cours : l'application automatique du bon montant à chaque dossier (sans clic), l'automatisation complète de la comparaison et la préparation/l'envoi du mail au CS. Le contrôle admin ci-dessous permet déjà de vérifier d'un coup toutes les comparaisons en cours.",
      ],
    },
    {
      n: 7,
      nom: "Envois et suivi des propositions au CS",
      etat: "deploye",
      description: [
        "Les dossiers arrivent ici dès que le gestionnaire valide la proposition (auto 6) → passage à l'étape « Validation CS ». On y prépare/envoie le mail au Conseil Syndical et on suit sa réponse.",
        "Statut CS « refus » → dossier passé automatiquement en « Perdu ». Statut CS « accepté » + résiliation envoyée « oui » → dossier passé en « Clos ». La ligne reste affichée pour le suivi.",
      ],
    },
    {
      n: 8,
      nom: "Agent de nettoyage de la data & remontée des cas étranges",
      etat: "deploye",
      description: [
        "Agent de nettoyage de la donnée — un seul des composants de l'automatisation finale. Trois volets sont en ligne ci-dessous : « clean prime », « clean avis d'échéance (données périmées) » et « correction GetHumanCall ».",
        "Volet 1 — « clean prime » : beaucoup de dossiers n'ont pas de prime renseignée, ce qui fausse les montants (historique ODR, dashboards Tracking). Sur chaque fiche copro sans prime : mention rouge « aucune prime renseignée » + bouton « Vérifier la prime » (cherche dans Front un avis d'échéance / relance impayé). Trouvé clairement → prime écrite ; incertain → prime écrite + « à vérifier » ; rien → inchangé. Aucun changement d'étape.",
        "Volet 2 — « clean avis d'échéance » : les dossiers dont l'échéance est dépassée depuis plusieurs mois/années trahissent une donnée périmée (import Omni ancien). Chaque fiche concernée porte une mention rouge « Donnée périmée » + un bouton « Vérifier la donnée » qui cherche dans Front une info plus récente (assureur / courtier / prime / échéance) ; si trouvée → remplit, aiguille le statut (Identification → RS / ODR) et retire la mention ; sinon → stand-by. Au fur et à mesure que la donnée est nettoyée sur Matera, les dossiers sont récupérés automatiquement.",
        "Volet 3 — « correction GetHumanCall » : import des données nettoyées par les agents Get Human Call (appels aux assureurs). Mode FILL-ONLY : on ne remplit QUE les champs vides (assureur / courtier / n° / prime / échéance) — jamais d'écrasement (la donnée GHC contient encore des erreurs). Tout champ déjà rempli qui diffère est remonté en DIVERGENCE dans le rapport « À contrôler » pour arbitrage manuel. Les dossiers en « Identification » sont aiguillés (ODR si assureur partenaire, RS si non-partenaire). Chaque info remplie porte un check vert « GHC » sur la fiche. À chaque nouvelle version de l'excel : un nouvel import (ligne d'historique).",
        "Contrôles admin ci-dessous pour chaque volet (identification + vérification en masse, compteurs en direct). Les données récupérées / corrigées sont protégées de la synchro Omni du lendemain (cliquets contrat / échéance + statut). Les dashboards du Tracking se mettent à jour automatiquement.",
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={session.user} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#26262C", letterSpacing: "-0.02em" }}>
            Automatisations
          </h1>
          <p className="text-sm mt-1" style={{ color: "#656576" }}>
            Les 8 automatisations du parcours MRI — état d&apos;avancement et contrôles admin.
          </p>
        </div>

        <AutomationModeTabs semiAuto={
        <>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {automations.map((a) => {
            const etat = ETATS[a.etat];
            return (
              <div
                key={a.n}
                style={{
                  background: "#fff", border: "1px solid #E8E8EC", borderRadius: 12,
                  padding: "20px 24px", boxShadow: "0 1px 2px rgba(13,22,63,.05)",
                }}
              >
                {/* En-tête : n° + nom + badge état */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <span style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: "#F5F5FF",
                    color: "#4E49FC", fontSize: 14, fontWeight: 700, display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {a.n}
                  </span>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: "#26262C", flex: 1 }}>
                    Automatisation {a.n} — {a.nom}
                  </h2>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
                    padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: etat.bg, color: etat.fg,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: etat.dot }} />
                    {etat.label}
                  </span>
                </div>

                {/* Description — repliée par défaut pour ne pas polluer la carte */}
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>
                    Description
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 900, marginTop: 10 }}>
                    {a.description.map((p, i) => (
                      <p key={i} style={{ fontSize: 13, lineHeight: "20px", color: "#4E4E58", margin: 0 }}>
                        {p}
                      </p>
                    ))}
                  </div>
                </details>

                {/* Auto 4 : volets (vérification échantillon, envoi, relances). */}
                {a.n === 4 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>Contrôles admin</summary>
                    <Rs4Controls volet1Count={rs4Volet1Count} volet2={rs4Volet2} detector={rs4Detector} volet3={rs4Volet3} volet4={rs4Volet4} sendHistory={rs4SendHistory} />
                  </details>
                )}
                {a.n === 5 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>Contrôles admin</summary>
                    <Devis5Controls data={devis5Volet1} toLoad={devis5ToLoad} docHistory={devis5DocHistory} noDocs={devis5NoDocs} docsStats={docsStats} volet2={devis5Volet2} suivi={devis5Suivi} auto6History={devis5Auto6History} lots={devis5Lots} />
                  </details>
                )}

                {/* Contrôles admin — pour l'instant uniquement l'auto 1 (le batch). */}
                {a.n === 1 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>
                      Contrôles admin
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      {/* VOLET 1 — remplissage des informations manquantes (autofill Front) */}
                      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 1</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Remplissage des informations manquantes</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                        {eligibleAuto1} dossier{eligibleAuto1 > 1 ? "s" : ""} en « Identification » encore à pré-remplir
                        (hors dossiers déjà clients / gagnés). Un dossier tenté n'est pas repassé tant que tout
                        l'échantillon n'a pas été parcouru (curseur persistant).
                      </p>
                      <AutofillBatchButton defaultTarget={Math.min(5, eligibleAuto1) || 5} stock={eligibleAuto1} history={autofillHistory} />

                      {/* VOLET 2 — identification des dossiers (routage validé à la main) */}
                      <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px dashed #E8E8EC", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 2</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Identification des dossiers</span>
                      </div>
                      <IdentifyScanControls total={identifyTotal} history={identifyHistory} />
                    </div>
                  </details>
                )}

                {/* Contrôles admin — automatisation 2 : ODR (export / template / envoi). */}
                {a.n === 2 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>
                      Contrôles admin
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <OdrControls template={ODR_TEMPLATE_TEXT} partners={odrPartners} sent={odrSent} history={odrHistory} />
                    </div>
                  </details>
                )}

                {a.n === 3 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>
                      Contrôles admin
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#26262C", marginBottom: 4 }}>Base de référence courtiers / assureurs</div>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 4px" }}>
                        <strong>{courtierState.courtiers}</strong> courtier{courtierState.courtiers > 1 ? "s" : ""} · <strong style={{ color: "#13762C" }}>{courtierState.courtiersAvecMail}</strong> avec mail type, {courtierState.courtiersSansMail} sans.
                      </p>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 4px" }}>
                        <strong>{courtierState.assureurs}</strong> compagnie{courtierState.assureurs > 1 ? "s" : ""} d&apos;assurance — garde-fou : on ne demande pas le RS à une compagnie, elle renvoie vers le courtier.
                        {courtierState.total === 0 && " Base vide — à alimenter : (1) import, (2) scraping Front."}
                      </p>
                      {courtierState.decouverts > 0 && (
                        <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                          dont <strong style={{ color: "#B4690E" }}>{courtierState.decouverts}</strong> découvert{courtierState.decouverts > 1 ? "s" : ""} via Front (destinataires réels des demandes de RS) — <em>à vérifier</em>, dont les cas « agent général » (GAN, Allianz, MMA…).
                        </p>
                      )}
                      {courtierState.total > 0 && (
                        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 300, border: "1px solid #E8E8EC", borderRadius: 8 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <thead>
                              <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                                {["Nom", "Type", "Mail principal", "Autres mails", "Vu"].map((h, i) => (
                                  <th key={i} style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {courtierSample.map((c) => {
                                const autres = (c.emailsAll ? c.emailsAll.split(";") : []).length;
                                const estAssureur = c.type === "assureur";
                                return (
                                  <tr key={c.id} style={{ borderTop: "1px solid #F1F1F4" }}>
                                    <td style={{ padding: "6px 12px", color: "#26262C", fontWeight: estAssureur ? 400 : 600 }}>
                                      {c.nom}
                                      {c.source === "front" && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#FDF0D5", color: "#B4690E" }}>à vérifier</span>}
                                    </td>
                                    <td style={{ padding: "6px 12px" }}>
                                      <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: estAssureur ? "#FDECEA" : "#EAF3FE", color: estAssureur ? "#CA1E12" : "#1F6FE0" }}>{estAssureur ? "assureur" : "courtier"}</span>
                                    </td>
                                    <td style={{ padding: "6px 12px", color: c.email ? "#26262C" : estAssureur ? "#A2A1AF" : "#CA1E12" }}>{c.email ?? (estAssureur ? "—" : "manquant")}</td>
                                    <td style={{ padding: "6px 12px", color: "#A2A1AF" }}>{autres > 1 ? `+${autres - 1}` : "—"}</td>
                                    <td style={{ padding: "6px 12px", color: "#A2A1AF", textAlign: "right" }}>{c.occurrences || "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p style={{ fontSize: 12, color: "#A2A1AF", marginTop: 10 }}>Base alimentée. L&apos;audit ci-dessous applique cette base aux dossiers en « Récupération du RS ».</p>
                      <CourtierAuditControls />
                    </div>
                  </details>
                )}

                {/* Contrôle admin — automatisation 6 : vérifier toutes les comparaisons. */}
                {a.n === 6 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>
                      Contrôles admin
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                        {eligibleAuto6} comparaison{eligibleAuto6 > 1 ? "s" : ""} de devis en cours — vérifie la dernière prime payée de chacune (via Front) et repère celles à recaler ou les cas étranges. Lecture seule.
                      </p>
                      <VerifyPrimesBatchButton stock={eligibleAuto6} />
                    </div>
                    <Devis6Controls table={devis6Table} />
                  </details>
                )}

                {/* Contrôle admin — automatisation 7 : suivi des propositions au CS. */}
                {a.n === 7 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content" }}>
                      Contrôles admin
                    </summary>
                    <Devis7Controls table={devis7Table} volet2={devis7Volet2} csHistory={devis7CsHistory} />
                  </details>
                )}

                {/* Contrôle admin — automatisation 8 : clean prime. */}
                {a.n === 8 && (
                  <details style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 0", userSelect: "none", width: "fit-content", marginBottom: 10 }}>
                      Contrôles admin
                    </summary>
                    <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 1</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Clean prime</span>
                    </div>
                    <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                      {eligibleAuto8} dossier{eligibleAuto8 > 1 ? "s" : ""} sans prime renseignée (copro active) — dont{" "}
                      <strong>{eligibleAuto8Untried}</strong> jamais tenté{eligibleAuto8Untried > 1 ? "s" : ""} (les runs ne traitent que ceux-là).
                    </p>
                    <PrimeBatchButton stock={eligibleAuto8Untried} />

                    {/* Historique clean prime */}
                    {primeHistory.length > 0 && (
                      <details style={{ marginTop: 16 }}>
                        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#26262C", marginBottom: 6, userSelect: "none", width: "fit-content" }}>Historique ({primeHistory.length})</summary>
                        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 190, border: "1px solid #E8E8EC", borderRadius: 8 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                            <thead>
                              <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                                <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Date</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Sans prime / total</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Taux</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Primes connues</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Résolus (run)</th>
                                <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Montant ajouté</th>
                              </tr>
                            </thead>
                            <tbody>
                              {primeHistory.map((h, i) => (
                                <tr key={i} style={{ borderTop: "1px solid #F1F1F4" }}>
                                  <td style={{ padding: "6px 12px", color: "#4E4E58", whiteSpace: "nowrap" }}>
                                    {new Date(h.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                    {i === primeHistory.length - 1 && <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 999, background: "#F1F1F4", color: "#8A8A99" }}>baseline</span>}
                                  </td>
                                  <td style={{ padding: "6px 12px", color: "#26262C", textAlign: "right" }}>{h.sansPrime} / {h.total}</td>
                                  <td style={{ padding: "6px 12px", color: h.taux > 0.3 ? "#955804" : "#13762C", textAlign: "right" }}>{Math.round(h.taux * 100)} %</td>
                                  <td style={{ padding: "6px 12px", color: "#26262C", textAlign: "right" }}>{eur0(h.primeConnue)}</td>
                                  <td style={{ padding: "6px 12px", color: "#13762C", fontWeight: 600, textAlign: "right" }}>{h.resolved > 0 ? `+${h.resolved}` : "—"}</td>
                                  <td style={{ padding: "6px 12px", color: "#13762C", fontWeight: 600, textAlign: "right" }}>{h.montantAdded > 0 ? `+${eur0(h.montantAdded)}` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}

                    {/* Volet 2 — Clean avis d'échéance (données périmées) */}
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 2</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Clean avis d&apos;échéance (données périmées)</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                        Dossiers actifs dont l'échéance est dépassée depuis plus de 6 mois → donnée jugée périmée. La fiche affiche
                        « Donnée périmée » + « Vérifier la donnée » (recherche Front d'une info plus récente ; si trouvée → remplit,
                        aiguille le statut et retire la mention). Curseur persistant : les runs ne reprennent que de nouveaux dossiers.
                      </p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                        <div style={{ minWidth: 150, border: "1px solid #E8E8EC", borderRadius: 8, padding: "8px 12px", background: "#fff" }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#CA1E12" }}>{perime.concerned}</div>
                          <div style={{ fontSize: 11.5, color: "#656576" }}>dossiers concernés{perime.untried ? ` · ${perime.untried} jamais tentés` : ""}</div>
                        </div>
                        <div style={{ minWidth: 150, border: "1px solid #E8E8EC", borderRadius: 8, padding: "8px 12px", background: "#fff" }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#13762C" }}>{perime.resolved}</div>
                          <div style={{ fontSize: 11.5, color: "#656576" }}>dossiers résolus</div>
                        </div>
                      </div>
                      <PerimeBatchButton stock={perime.untried} />

                      {/* Historique clean avis d'échéance */}
                      {perimeHistory.length > 0 && (
                        <details style={{ marginTop: 16 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#26262C", marginBottom: 6, userSelect: "none", width: "fit-content" }}>Historique ({perimeHistory.length})</summary>
                          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 190, border: "1px solid #E8E8EC", borderRadius: 8 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Date</th>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Concernés</th>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Résolus (cumul)</th>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, textAlign: "right", position: "sticky", top: 0, background: "#FAFAFC" }}>Résolus (run)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {perimeHistory.map((h, i) => (
                                  <tr key={i} style={{ borderTop: "1px solid #F1F1F4" }}>
                                    <td style={{ padding: "6px 12px", color: "#4E4E58", whiteSpace: "nowrap" }}>
                                      {new Date(h.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                      {i === perimeHistory.length - 1 && <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 999, background: "#F1F1F4", color: "#8A8A99" }}>baseline</span>}
                                    </td>
                                    <td style={{ padding: "6px 12px", color: "#26262C", textAlign: "right" }}>{h.concerned}</td>
                                    <td style={{ padding: "6px 12px", color: "#26262C", textAlign: "right" }}>{h.resolvedTotal}</td>
                                    <td style={{ padding: "6px 12px", color: "#13762C", fontWeight: 600, textAlign: "right" }}>{h.resolved > 0 ? `+${h.resolved}` : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Volet 3 — Correction GetHumanCall (GHC) */}
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 3</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Correction GetHumanCall (GHC)</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
                        Import des données nettoyées par les agents Get Human Call (appels aux assureurs). GHC = source prioritaire :
                        assureur / courtier / n° / prime / échéance sont écrasés (fill + correction), les dossiers en « Identification »
                        sont aiguillés (ODR / RS), les données récupérées sont protégées d&apos;Omni. Une nouvelle version de l&apos;excel = un
                        nouvel import (ligne d&apos;historique ci-dessous).
                      </p>
                      <p style={{ fontSize: 12.5, color: "#656576", margin: "0 0 12px" }}>
                        Source courante : <strong>{ghcState.sourceRows}</strong> contrats en base
                        {" · "}<strong>{ghcState.dossiersAvecGhc}</strong> dossier{ghcState.dossiersAvecGhc > 1 ? "s" : ""} portent une donnée GHC.
                      </p>
                      <GhcImportControls sourceRows={ghcState.sourceRows} currentVersionHref="/ghc/GHC-cleaning-contrats-assurance-v2.xlsx" />

                      {/* Historique des imports GHC */}
                      {ghcHistory.length > 0 && (
                        <details style={{ marginTop: 16 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#26262C", marginBottom: 6, userSelect: "none", width: "fit-content" }}>Historique des imports ({ghcHistory.length})</summary>
                          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 190, border: "1px solid #E8E8EC", borderRadius: 8 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                                  {["Version", "Date", "Dossiers", "Assureurs", "Primes", "Courtiers", "Échéances", "→ ODR", "→ RS", "Diverg.", "Cas part."].map((h, i) => (
                                    <th key={i} style={{ padding: "7px 10px", fontWeight: 600, textAlign: i <= 1 ? "left" : "right", position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {ghcHistory.map((h) => (
                                  <tr key={h.id} style={{ borderTop: "1px solid #F1F1F4" }}>
                                    <td style={{ padding: "6px 10px", color: "#26262C", fontWeight: 600 }}>
                                      {ghcHistoryHref(h) ? (
                                        <a href={ghcHistoryHref(h)!} download title="Télécharger cet excel" style={{ color: "#4E49FC", textDecoration: "none" }}>{h.label} ↓</a>
                                      ) : (
                                        h.label
                                      )}
                                    </td>
                                    <td style={{ padding: "6px 10px", color: "#4E4E58", whiteSpace: "nowrap" }}>{new Date(h.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                                    <td style={{ padding: "6px 10px", color: "#26262C", textAlign: "right" }}>{h.dossiersClean}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{h.assureursMaj}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{h.primesMaj}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{h.courtiersMaj}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{h.echeancesMaj}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#955804", fontWeight: 600 }}>{h.versOdr || "—"}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: "#13762C", fontWeight: 600 }}>{h.versRs || "—"}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: h.divergences ? "#CA1E12" : "#A2A1AF" }}>{h.divergences || "—"}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", color: h.casParticuliers ? "#CA1E12" : "#A2A1AF" }}>{h.casParticuliers || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}

                      {/* Rapport : divergences + cas particuliers à contrôler */}
                      {ghcReviews.length > 0 && (
                        <details style={{ marginTop: 16 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#26262C", marginBottom: 6, userSelect: "none", width: "fit-content" }}>À contrôler — divergences &amp; cas particuliers ({ghcReviews.length})</summary>
                          <div style={{ overflowY: "auto", maxHeight: 220, border: "1px solid #E8E8EC", borderRadius: 8 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Type</th>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Copropriété</th>
                                  <th style={{ padding: "7px 12px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>Détail</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ghcReviews.map((rv) => (
                                  <tr key={rv.id} style={{ borderTop: "1px solid #F1F1F4" }}>
                                    <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>
                                      <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: rv.kind === "prime_divergente" ? "#FEF3C7" : "#FDECEA", color: rv.kind === "prime_divergente" ? "#955804" : "#CA1E12" }}>
                                        {ghcReviewLabel[rv.kind] ?? rv.kind}
                                      </span>
                                    </td>
                                    <td style={{ padding: "6px 12px", color: "#26262C" }}>{rv.coproNom}</td>
                                    <td style={{ padding: "6px 12px", color: "#4E4E58" }}>{rv.message}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Volet 4 — Piscine (cas nécessitant une intervention manuelle) */}
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 4</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Piscine — cas à traiter à la main</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                        Vue centralisée de tous les dossiers bloqués par une automatisation (digressions, retenues, incohérences).
                        C&apos;est une vue <strong>doublon</strong> : les cas restent dans leur automatisation d&apos;origine. Traiter un cas
                        ici (ou dans l&apos;auto d&apos;origine) le retire des deux vues automatiquement.
                      </p>
                      <PiscinePanel state={piscineState} />
                    </div>

                    {/* Volet 5 — Agent détection d'anomalies */}
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>VOLET 5</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Agent de détection d&apos;anomalies</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#8A8A99", margin: 0, fontStyle: "italic" }}>À venir au fur et à mesure des automatisations finales.</p>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
        <ExclusionsPanel state={{ ...exclusionState, rows: exclusionState.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) }} />
        </>
        } />
      </main>
    </div>
  );
}
