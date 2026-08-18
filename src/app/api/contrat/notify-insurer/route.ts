import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatGestionnaireNom(email: string | null | undefined): string {
  if (!email) return "L'équipe Matera";
  const local = email.split("@")[0];
  return local.split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      coproNom: string;
      coproAdresse?: string | null;
      assureur: string;
      primeTTC: number;
      gestionnaireEmail?: string | null;
      gestionnaireNom?: string | null;
    };

    const { coproNom, coproAdresse, assureur, primeTTC, gestionnaireEmail } = body;
    const gestionnaireNom = body.gestionnaireNom?.trim() || formatGestionnaireNom(gestionnaireEmail);

    const prompt = `Tu es conseiller expert en assurance multirisque immeuble (MRI) pour Matera, un syndic professionnel français.

Rédige un email professionnel à destination du service souscription de ${assureur} pour leur transmettre le contrat MRI signé de la copropriété "${coproNom}"${coproAdresse ? ` (${coproAdresse})` : ""}.

CONTEXTE : Matera est le syndic de cette copropriété. Le conseil syndical a validé et signé le contrat MRI ${assureur} d'une prime annuelle de ${primeTTC.toLocaleString("fr-FR")} €. Le contrat signé est joint à cet email.

INSTRUCTIONS :
- Commence par "Madame, Monsieur,"
- Explique que tu transmets le contrat MRI signé pour la copropriété, que la prise d'effet peut être initiée
- Demande confirmation de réception et de la date de prise d'effet
- Sois professionnel et concis (150-200 mots maximum)
- Termine par :\n  "Cordialement,\n  ${gestionnaireNom}\n  Matera - Syndic"
- Ne mets pas d'objet, uniquement le corps du mail
- N'utilise JAMAIS les tirets longs (—)
- Mets toujours le symbole € APRÈS les chiffres
- IMPORTANT : termine l'email EXACTEMENT après la signature, sans rien ajouter`;

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    // sonnet-5 : raisonnement adaptatif par défaut → 1er bloc parfois "thinking".
    const content = response.content.find((b) => b.type === "text");
    if (!content || content.type !== "text") {
      return NextResponse.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    return NextResponse.json({ success: true, email: content.text.trim() });
  } catch (err) {
    console.error("[contrat/notify-insurer] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 }
    );
  }
}
