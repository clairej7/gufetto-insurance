// Documents STANDARD (non propres au dossier) joints aux propositions au CS.
// Mila envoie une CG + un IPID identiques à chaque devis (produit
// « risques-specifiques-2024011ﾂ ») → on les stocke UNE fois à ces chemins globaux
// dans Supabase et on les joint automatiquement à chaque proposition Mila.
// AXA : la CG « Atouts Immeuble Copropriété » (réf. 972154C) est un doc standard,
// cité dans chaque devis mais non joint aux mails d'Achille. On la récupère depuis
// un mail d'émission de contrat AXA (PJ « CG AXA … »), on la stocke globalement et
// on la joint à chaque proposition AXA (en plus du devis / projet de conditions part.).
export type StandardDoc = { storagePath: string; name: string; match: RegExp };

export const MILA_STANDARD_DOCS: StandardDoc[] = [
  { storagePath: "standard/mila-conditions-generales-risques-specifiques-2024011.pdf", name: "Mila - Conditions générales", match: /conditions-generales/i },
  { storagePath: "standard/mila-infoproduit-risques-specifiques-2024011.pdf", name: "Mila - Fiche d'information produit (IPID)", match: /infoproduit/i },
];
export const MILA_STANDARD_SOURCE_MSG_ID = "msg_wgdrl52";

export const AXA_STANDARD_DOCS: StandardDoc[] = [
  { storagePath: "standard/axa-conditions-generales-972154C.pdf", name: "AXA - Conditions générales (Atouts Immeuble, réf. 972154C)", match: /cg\s*axa/i },
];
export const AXA_STANDARD_SOURCE_MSG_ID = "msg_wfxedja";
