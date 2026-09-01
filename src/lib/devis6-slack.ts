// Automatisation 6 — bouton « Envoyer » : prévient le gestionnaire des nouveaux
// devis via un message posté dans un canal Slack (Incoming Webhook / Workflow
// Builder). Étape 1 : composition + envoi du message. La validation cliquable
// (page tokenisée) est ajoutée à l'étape 2.
import { prisma } from "@/lib/prisma";
import { resolvePrimeReference } from "@/lib/devis-prime";
import { getDernierePrimePayeeFromFront } from "@/lib/front-insurance";
import { signValidationToken } from "@/lib/devis6-token";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://gufetto-insurance.up.railway.app";
const fmtE = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

type ExtractedLite = { assureur?: string; primeTTC?: number; garanties?: Record<string, boolean> };
function parse(raw: string | null): ExtractedLite {
  if (!raw) return {};
  try { return JSON.parse(raw) as ExtractedLite; } catch { return {}; }
}

// Compose le message (markdown) envoyé au gestionnaire pour un dossier.
export async function buildGestionnaireMessage(pipelineId: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, assureurActuel: true, primeActuelle: true, buildingId: true, gestionnaireNom: true } },
      devisRecus: { orderBy: { createdAt: "asc" }, select: { assureur: true, primeTTC: true, data: true } },
    },
  });
  if (!p) return { ok: false, error: "Dossier introuvable" };
  const devis = p.devisRecus.filter((d) => d.data && d.data.trim());
  if (!devis.length) return { ok: false, error: "Comparaison non générée pour ce dossier" };

  const contrat = parse(p.contratActuelData);
  const assureurActuel = contrat.assureur || p.copro.assureurActuel || "—";
  // Prix actuel = base Gufetto (resolvePrimeReference : le + haut entre contrat et
  // dernière prime payée, dans la bande de cohérence). MÊME règle que les cartes.
  const contratPrime = typeof contrat.primeTTC === "number" ? contrat.primeTTC : p.copro.primeActuelle;
  let dernierePrime: number | null = null;
  try {
    const r = await getDernierePrimePayeeFromFront(p.copro.buildingId ?? "", pipelineId, [p.copro.adresse, p.copro.nom]);
    if (r && typeof r.montant === "number") dernierePrime = r.montant;
  } catch { /* best-effort */ }
  const base = resolvePrimeReference(contratPrime, dernierePrime);
  const prixActuel = base.flag === "bloque" ? base.contrat : base.value;

  // Meilleur devis (le moins cher) → économie + synthèse garanties.
  const best = devis.reduce((a, b) => (b.primeTTC < a.primeTTC ? b : a));
  const bestData = parse(best.data);
  const economie = prixActuel != null ? prixActuel - best.primeTTC : null;
  const pjBest = bestData.garanties?.protectionJuridique;
  const pjContrat = contrat.garanties?.protectionJuridique;

  // Slack mrkdwn : gras = *texte* (une seule étoile), italique = _texte_.
  const devisLine = (d: { assureur: string; primeTTC: number } | undefined, n: number) =>
    d ? `• *Devis ${n}* : ${fmtE(d.primeTTC)} — _${d.assureur}_` : null;

  const synthese: string[] = [];
  if (economie != null) synthese.push(economie > 0
    ? `Meilleur devis (*${best.assureur}*, ${fmtE(best.primeTTC)}) → économie ≈ *${fmtE(Math.abs(economie))}/an* vs le prix actuel.`
    : `Meilleur devis (*${best.assureur}*, ${fmtE(best.primeTTC)}) → *+${fmtE(Math.abs(economie))}/an* vs le prix actuel.`);
  synthese.push("Garanties globalement comparables au contrat en place.");
  // Alerter sur la PJ UNIQUEMENT si le contrat actuel en a une et que le devis retenu ne l'a pas (perte réelle).
  if (pjContrat === true && pjBest === false) synthese.push("⚠️ Protection juridique présente au contrat actuel mais absente du devis retenu — à valider.");

  const token = signValidationToken(p.id);
  const lines = [
    "*Assurances Pro*",
    "",
    p.copro.gestionnaireNom ? `Gestionnaire : *${p.copro.gestionnaireNom}*` : null,
    `• *Copropriété* : ${p.copro.adresse || p.copro.nom}`,
    `• *Assureur actuel* : ${assureurActuel}`,
    `• *Prix actuel* : ${fmtE(prixActuel)} / an`,
    devisLine(devis[0], 1),
    devisLine(devis[1], 2),
    "",
    `*En résumé* : ${synthese.join(" ")}`,
    "",
    `🔗 *Détail de la comparaison* : ${BASE_URL}/pipeline/${p.id}`,
    "",
    "────────────",
    "*Valides-tu la transmission au Conseil Syndical ?*",
    `　<${BASE_URL}/valider-devis/${token}|Réponse>`,
    "💬 _Tu pourras ajouter un commentaire sur la page._",
  ].filter((l): l is string => l !== null);

  return { ok: true, text: lines.join("\n") };
}

// Poste le message dans le canal via le webhook Slack (variable `text`).
export async function postToDevisChannel(text: string): Promise<{ ok: boolean; error?: string }> {
  const raw = process.env.SLACK_DEVIS_WEBHOOK_URL;
  if (!raw) return { ok: false, error: "SLACK_DEVIS_WEBHOOK_URL non configuré côté serveur" };
  // Tolérant : si on a collé toute la commande curl d'exemple de Slack au lieu de
  // la seule URL, on récupère l'URL du webhook dedans.
  const url = (raw.match(/https?:\/\/hooks\.slack\.com\/[^\s'"]+/) ?? [raw.trim()])[0];
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) return { ok: false, error: `Slack a répondu ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau Slack" };
  }
}
