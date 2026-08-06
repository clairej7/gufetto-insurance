export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { AutofillBatchButton } from "@/components/admin/autofill-batch-button";
import { VerifyPrimesBatchButton } from "@/components/admin/verify-primes-batch-button";
import { OdrControls } from "@/components/admin/odr-controls";
import { getOdrByPartner, getOdrSent, getOdrSendHistory, ODR_TEMPLATE_TEXT } from "@/lib/odr";

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
  }));
  // Ensemble « déjà envoyées » par assureur (docs fournis + base) pour les tables.
  const odrSent: Record<string, { adresse: string; numeroContrat: string }[]> = {};
  for (const b of odrBuckets) odrSent[b.key] = await getOdrSent(b.key);
  // Historique des envois ODR (une ligne par envoi).
  const odrHistory = await getOdrSendHistory();

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
      etat: "attente",
      description: [
        "Cette automatisation s'applique uniquement à l'étape « Récupération du RS » (RS en cours). Son but : mieux trouver le mail du courtier lorsqu'il est correctement identifié, afin de pouvoir ensuite envoyer plus facilement le mail de demande de RS (automatisation 4). Elle fait deux choses, en s'appuyant sur une base de référence de courtiers et d'assureurs.",
        "1) Filtre de vérification courtier / assureur : chaque dossier arrivant du pré-remplissage est repassé au crible. L'assureur trouvé à l'étape précédente est vérifié dans la base ; s'il s'agit en réalité d'un courtier (erreur fréquente), le dossier est renvoyé à l'étape « Identification » plutôt que de rester bloqué en RS avec une donnée fausse.",
        "2) Complétion du mail courtier : quand les infos sont bonnes mais que le mail du courtier manque (non récupéré via Front), l'automatisation le complète à partir de cette même base (adresses de contact connues par cabinet / compagnie). Objectif : maximiser la part de dossiers réellement contactables avant l'envoi des demandes de RS, au lieu de les laisser bloqués faute d'adresse exploitable.",
      ],
    },
    {
      n: 4,
      nom: "Envoi des demandes de RS",
      etat: "attente",
      description: [
        "Envoie automatiquement les demandes de relevé de sinistralité (RS) aux courtiers / assureurs via Front, à partir des infos remplies par l'automatisation 1.",
        "Gère le cycle complet : relances automatiques en l'absence de réponse, puis traitement des réponses entrantes — remercier, enregistrer le RS reçu, faire avancer le dossier à l'étape suivante, et archiver l'échange.",
        "C'est le cœur historique du projet : automatiser l'étape RS, aujourd'hui faite à la main par les gestionnaires.",
      ],
    },
    {
      n: 5,
      nom: "Demande de devis",
      etat: "encours",
      description: [
        "Envoie les demandes de devis aux assureurs partenaires (AXA & Mila), réceptionne les deux devis, et fait avancer le dossier vers l'étape « Comparaison des devis ».",
        "La base de comparaison s'appuie sur la dernière prime réellement payée par la copropriété (récupérée via Front), pour évaluer le gain proposé par chaque devis.",
        "En cours de construction sur une autre session de travail.",
      ],
    },
    {
      n: 6,
      nom: "Comparer les devis et préparer le mail au CS",
      etat: "encours",
      description: [
        "À l'étape « Comparaison des devis », la base de comparaison retient désormais la DERNIÈRE PRIME RÉELLEMENT PAYÉE (récupérée dans le mail de demande de devis envoyé à l'assureur, via le marqueur gufetto-ref) plutôt que la prime du contrat, souvent périmée. Sans ça, les devis paraissaient plus chers que la réalité.",
        "Sur chaque dossier, le bouton « Vérifier le montant » récupère cette prime, la propage partout (carte « Contrat actuel », comparatif détaillé) et régénère automatiquement la recommandation au Conseil Syndical — aucune analyse ne peut plus partir avec l'ancien chiffre erroné. Une règle de cohérence protège les cas étranges (écart anormal contrat/prime → vérification manuelle).",
        "Encore en cours : l'application automatique du bon montant à chaque dossier (sans clic), l'automatisation complète de la comparaison et la préparation/l'envoi du mail au CS. Le contrôle admin ci-dessous permet déjà de vérifier d'un coup toutes les comparaisons en cours.",
      ],
    },
    {
      n: 7,
      nom: "Message Slack au gestionnaire (devis reçus) & finalisation",
      etat: "attente",
      description: [
        "À venir — contenu à préciser.",
      ],
    },
    {
      n: 8,
      nom: "Agent de nettoyage de la data & remontée des cas étranges",
      etat: "attente",
      description: [
        "À venir — contenu à préciser.",
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

                {/* Contrôles admin — pour l'instant uniquement l'auto 1 (le batch). */}
                {a.n === 1 && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
                      Contrôles admin
                    </div>
                    <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                      {eligibleAuto1} dossier{eligibleAuto1 > 1 ? "s" : ""} en « Identification » encore à pré-remplir
                      (hors dossiers déjà clients / gagnés).
                    </p>
                    <AutofillBatchButton defaultTarget={Math.min(100, eligibleAuto1)} stock={eligibleAuto1} />
                  </div>
                )}

                {/* Contrôles admin — automatisation 2 : ODR (export / template / envoi). */}
                {a.n === 2 && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
                      Contrôles admin
                    </div>
                    <OdrControls template={ODR_TEMPLATE_TEXT} partners={odrPartners} sent={odrSent} history={odrHistory} />
                  </div>
                )}

                {/* Contrôle admin — automatisation 6 : vérifier toutes les comparaisons. */}
                {a.n === 6 && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, Menlo, monospace", color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
                      Contrôles admin
                    </div>
                    <p style={{ fontSize: 13, color: "#656576", margin: "0 0 12px" }}>
                      {eligibleAuto6} comparaison{eligibleAuto6 > 1 ? "s" : ""} de devis en cours — vérifie la dernière prime payée de chacune (via Front) et repère celles à recaler ou les cas étranges. Lecture seule.
                    </p>
                    <VerifyPrimesBatchButton stock={eligibleAuto6} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
