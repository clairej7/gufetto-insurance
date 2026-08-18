import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolvePrimeReference } from "@/lib/devis-prime";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type GarantiesData = {
  incendie?: boolean;
  dommagesElectriques?: boolean;
  evenementsClimatiques?: boolean;
  catastrophesNaturelles?: boolean;
  degatsDesEaux?: boolean;
  vol?: boolean;
  brisDeGlace?: boolean;
  rc?: boolean;
  vandalisme?: boolean;
  effondrement?: boolean;
  brisDeMachines?: boolean;
  protectionJuridique?: boolean;
  protectionCS?: boolean;
  honoSyndic?: boolean;
};

type ExtractedData = {
  assureur?: string;
  primeTTC?: number;
  primeHT?: number | null;
  franchiseIncendie?: string | null;
  franchiseDDE?: string | null;
  franchiseVol?: string | null;
  franchiseClimatique?: string | null;
  lci?: string | null;
  rcPlafond?: string | null;
  garanties?: GarantiesData;
  pointsForts?: string[];
  pointsFaibles?: string[];
};

type DevisInput = {
  assureur: string;
  primeTTC: number;
  data: ExtractedData;
};

type CoproInput = {
  nom: string;
  adresse?: string | null;
  contactCsNom?: string | null;
  primeActuelle?: number | null;
  // Dernière prime payée (mail de demande de devis Front) — base de comparaison
  // prioritaire sur la prime du contrat quand cohérente (cf. resolvePrimeReference).
  primePayee?: number | null;
  gestionnaireEmail?: string | null;
  gestionnaireNom?: string | null;
};

function formatGestionnaireNom(email: string | null | undefined): string {
  if (!email) return "L'équipe Matera";
  const local = email.split("@")[0]; // "claire.jaquemet"
  return local.split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); // "Claire Jaquemet"
}

function formatPrime(val: number | null | undefined): string {
  if (val == null) return "N/A";
  return val.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
}

function formatGaranties(g: GarantiesData | undefined): string {
  if (!g) return "Non détaillées";
  const labels: Record<string, string> = {
    incendie: "Incendie",
    dommagesElectriques: "Dom. électriques",
    evenementsClimatiques: "Événements clim.",
    catastrophesNaturelles: "Cat. naturelles",
    degatsDesEaux: "Dégâts des eaux",
    vol: "Vol",
    brisDeGlace: "Bris de glace",
    rc: "RC",
    vandalisme: "Vandalisme",
    effondrement: "Effondrement",
    brisDeMachines: "Bris machines",
    protectionJuridique: "Prot. juridique",
    protectionCS: "Prot. CS",
    honoSyndic: "Hono. syndic",
  };
  const inclus = Object.entries(g)
    .filter(([, v]) => v === true)
    .map(([k]) => labels[k] ?? k);
  const exclus = Object.entries(g)
    .filter(([, v]) => v === false)
    .map(([k]) => labels[k] ?? k);
  const parts: string[] = [];
  if (inclus.length) parts.push(`Incluses : ${inclus.join(", ")}`);
  if (exclus.length) parts.push(`Exclues : ${exclus.join(", ")}`);
  return parts.join(" | ") || "Non détaillées";
}

function buildPrompt(
  copro: CoproInput,
  contratActuel: ExtractedData,
  devis: DevisInput[],
  recommandeAssureur?: string
): string {
  // Base de comparaison = prime de référence (dernière prime payée si cohérente,
  // sinon prime du contrat). En cas étrange (`value` null), on retombe sur le
  // contrat pour ne pas casser la génération de l'email.
  const primeRef = resolvePrimeReference(contratActuel.primeTTC ?? copro.primeActuelle, copro.primePayee);
  const basePrime = primeRef.value ?? contratActuel.primeTTC ?? copro.primeActuelle;
  const gestionnaireNom = copro.gestionnaireNom?.trim() || formatGestionnaireNom(copro.gestionnaireEmail);

  const lines: string[] = [
    "Tu es conseiller expert en assurance multirisque immeuble (MRI) pour Matera, un syndic professionnel français qui propose son propre service de courtage.",
    "",
    `Rédige un email professionnel pour le Conseil Syndical de la copropriété "${copro.nom}"${copro.adresse ? ` (${copro.adresse})` : ""} présentant les résultats de l'appel d'offres MRI.`,
    "",
    "CONTEXTE : Matera est un syndic qui a sollicité des offres d'assurance MRI pour remplacer le contrat actuel de la copropriété. L'objectif est de convaincre le Conseil Syndical d'adopter la nouvelle offre.",
    "",
    `DEVIS À RECOMMANDER : ${recommandeAssureur ?? devis[0]?.assureur ?? "le devis proposé"}. Argumente sur ses mérites réels par rapport au contrat actuel (prix, franchises, garanties). Si d'autres devis ont été comparés, mentionne-les brièvement avant de conclure sur celui-ci.`,
    "CONSIGNE : N'ajoute AUCUNE note, aucun commentaire méta, aucune réserve après l'email. Rédige uniquement le corps du mail professionnel.",
    "",
    `=== CONTRAT ACTUEL (${contratActuel.assureur ?? "Assureur actuel"}) ===`,
    `Prime TTC annuelle : ${formatPrime(basePrime)}`,
  ];

  if (contratActuel.franchiseIncendie) lines.push(`Franchise incendie : ${contratActuel.franchiseIncendie}`);
  if (contratActuel.franchiseDDE) lines.push(`Franchise DDE : ${contratActuel.franchiseDDE}`);
  if (contratActuel.franchiseVol) lines.push(`Franchise vol : ${contratActuel.franchiseVol}`);
  if (contratActuel.franchiseClimatique) lines.push(`Franchise climatique : ${contratActuel.franchiseClimatique}`);
  if (contratActuel.rcPlafond) lines.push(`RC plafond : ${contratActuel.rcPlafond}`);
  if (contratActuel.lci) lines.push(`LCI : ${contratActuel.lci}`);
  lines.push(`Garanties : ${formatGaranties(contratActuel.garanties)}`);
  if ((contratActuel.pointsFaibles?.length ?? 0) > 0) {
    lines.push(`Points faibles : ${contratActuel.pointsFaibles!.join(", ")}`);
  }

  lines.push("", "=== DEVIS REÇUS ===");

  for (const d of devis) {
    lines.push("", `--- ${d.assureur} ---`);
    lines.push(`Prime TTC annuelle : ${formatPrime(d.primeTTC)}`);
    if (basePrime != null) {
      const econ = basePrime - d.primeTTC;
      if (econ > 0) {
        lines.push(`Économie vs prime actuelle : −${Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an`);
      } else {
        lines.push(`Surcoût vs prime actuelle : +${Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an`);
      }
    }
    if (d.data.franchiseIncendie) lines.push(`Franchise incendie : ${d.data.franchiseIncendie}`);
    if (d.data.franchiseDDE) lines.push(`Franchise DDE : ${d.data.franchiseDDE}`);
    if (d.data.franchiseVol) lines.push(`Franchise vol : ${d.data.franchiseVol}`);
    if (d.data.franchiseClimatique) lines.push(`Franchise climatique : ${d.data.franchiseClimatique}`);
    if (d.data.rcPlafond) lines.push(`RC plafond : ${d.data.rcPlafond}`);
    if (d.data.lci) lines.push(`LCI : ${d.data.lci}`);
    lines.push(`Garanties : ${formatGaranties(d.data.garanties)}`);
    if ((d.data.pointsForts?.length ?? 0) > 0) {
      lines.push(`Points forts : ${d.data.pointsForts!.join(", ")}`);
    }
    if ((d.data.pointsFaibles?.length ?? 0) > 0) {
      lines.push(`Points faibles : ${d.data.pointsFaibles!.join(", ")}`);
    }
  }

  const devisRecommande = recommandeAssureur
    ? devis.find((d) => d.assureur === recommandeAssureur)
    : devis[0];

  // Inject partner knowledge if the recommended devis is AXA or MILA
  const rec = recommandeAssureur ?? devis[0]?.assureur ?? "";
  if (rec.toUpperCase().includes("AXA")) {
    lines.push(
      "",
      "=== RÉFÉRENCE INTERNE AXA (à utiliser pour argumenter, ne pas citer mot pour mot) ===",
      "Points forts à valoriser :",
      "- AXA est un acteur historique et incontournable de l'assurance en France : marque reconnue, solidité financière garantie, très rassurant pour les copropriétaires",
      "- Couverture très large : quasiment tous les risques majeurs pour l'immeuble sont inclus",
      "- Pas d'avance de frais en cas de sinistre (hors franchise)",
      "- Protection du conseil syndical et responsabilité du syndic bénévole incluse",
      "- Réseau d'entreprises partenaires AXA pour la gestion des sinistres",
      "- Contrat reconductible automatiquement : continuité de couverture garantie",
      "- Franchise temporaire qui disparaît après 6 mois sans sinistre",
      "Points de vigilance à mentionner avec tact si pertinent :",
      "- Franchise générale temporaire les 6 premiers mois (3 fois l'indice FFB en cas de sinistre)",
      "- Indexation annuelle sur l'indice FFB (cotisation et garanties évoluent automatiquement)",
    );
  } else if (rec.toUpperCase().includes("MILA")) {
    lines.push(
      "",
      "=== RÉFÉRENCE INTERNE MILA (à utiliser pour argumenter, ne pas citer mot pour mot) ===",
      "Points forts à valoriser :",
      "- Couverture complète incluant des risques souvent exclus : graffitis, recherche de fuite, consommation d'eau supplémentaire",
      "- Forts plafonds de garantie : Effondrement 3 M€, RC propriétaire 6 M€, Bris de machine 100 000 €, Vol/vandalisme 40 000 €",
      "- Garantie spécifique pour le conseil syndical (rare dans les contrats concurrents)",
      "- Possibilité d'ajouter la RC du syndic bénévole (adaptée aux petites copropriétés)",
      "- Indexation automatique FFB : protection contre l'inflation des coûts de construction",
      "Points de vigilance à mentionner avec tact si pertinent :",
      "- Responsabilité personnelle des copropriétaires non couverte (contrats individuels nécessaires)",
      "- Obligation d'entretien imposée (ex. nettoyage gouttières, extincteurs parkings)",
    );
  }

  lines.push(
    "",
    "=== INSTRUCTIONS ===",
    `- Commence l'email par "Bonjour${copro.contactCsNom ? ` ${copro.contactCsNom}` : ""}," sur la première ligne`,
    "- Structure : courte intro sur la démarche → résultats comparatifs en prose → recommandation argumentée → prochaines étapes",
    "- Base ton argumentation sur les données réelles ci-dessus (prix, franchises, garanties)",
    "- Ajoute OBLIGATOIREMENT cette phrase : \"Sans retour de votre part dans les 7 jours, nous procéderons à la signature du contrat et à la résiliation de votre contrat actuel afin de vous assurer dans les meilleures conditions le plus rapidement possible.\"",
    "- Sois professionnel, direct et commercial (250-350 mots maximum)",
    `- Termine par :\n  "Cordialement,\n  ${gestionnaireNom}\n  Matera"`,
    "- Ne mets pas d'objet, uniquement le corps du mail",
    "- Utilise des sauts de ligne pour aérer le texte",
    "- Pour mettre en gras un mot ou chiffre important, utilise **texte** — ces balises seront converties automatiquement en HTML",
    "- N'utilise JAMAIS les tirets longs (—) : remplace-les par une virgule, deux-points, ou un point",
    "- Mets toujours le symbole € APRÈS les chiffres : écris '3 979 €' et jamais '€3 979'",
    "- IMPORTANT : termine l'email EXACTEMENT après la signature, sans rien ajouter après (pas de note, pas de remarque, pas d'astérisque, pas de commentaire)"
  );

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      copro: CoproInput;
      contratActuel: ExtractedData;
      devis: DevisInput[];
      recommandeAssureur?: string;
    };

    const { copro, contratActuel, devis, recommandeAssureur } = body;

    if (!copro || !contratActuel || !devis || !Array.isArray(devis)) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    const prompt = buildPrompt(copro, contratActuel, devis, recommandeAssureur);

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    return NextResponse.json({ success: true, recommendation: content.text.trim() });
  } catch (err) {
    console.error("[devis/recommend] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 }
    );
  }
}
