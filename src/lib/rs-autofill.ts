"use server";

// Action serveur de l'automatisation 1 : bouton "Récupérer via Front" sur une
// fiche. Récupère les 3 infos depuis Front, remplit les champs et aiguille le
// dossier. Accessible à tout gestionnaire connecté (pas réservé aux admins).

import { auth } from "@/lib/auth";
import { applyAutofill, type AutofillResult } from "@/lib/rs-autofill-core";

export async function autofillDossierFromFront(pipelineId: string): Promise<AutofillResult> {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Non authentifié");
  return applyAutofill(pipelineId, session.user.email, "action_manuelle");
}
