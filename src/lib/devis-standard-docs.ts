// Documents STANDARD (non propres au dossier) joints aux propositions au CS.
// Mila envoie une CG + un IPID identiques à chaque devis (produit
// « risques-specifiques-2024011ﾂ ») → on les stocke UNE fois à ces chemins globaux
// dans Supabase et on les joint automatiquement à chaque proposition Mila.
// (AXA n'a pas de doc standard séparé : ses CG sont dans le « Contrat MRI » du
//  dossier — cf backfill devis_axa.)
export const MILA_STANDARD_DOCS: { storagePath: string; name: string; match: RegExp }[] = [
  { storagePath: "standard/mila-conditions-generales-risques-specifiques-2024011.pdf", name: "Mila - Conditions générales", match: /conditions-generales/i },
  { storagePath: "standard/mila-infoproduit-risques-specifiques-2024011.pdf", name: "Mila - Fiche d'information produit (IPID)", match: /infoproduit/i },
];

// Mail Mila source pour récupérer une fois les PDF standard (CG + IPID).
export const MILA_STANDARD_SOURCE_MSG_ID = "msg_wgdrl52";
