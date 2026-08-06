// ODR déjà envoyés par assureur, INGÉRÉS DEPUIS LES DOCS fournis par Quentin.
// Sert de référence au contrôle anti-doublon (avec, en plus, les dossiers déjà
// passés en « ODR envoyées / acceptées / en vigueur » côté base).
//
// Pour mettre à jour : ré-ingérer les docs d'un assureur et remplacer son tableau.
// Format : { adresse, numeroContrat }. L'adresse telle qu'écrite dans le doc ;
// le n° tel qu'écrit (les multi-n° "A / B" sont gérés par le matcher).

export type OdrSentRecord = { adresse: string; numeroContrat: string };

export const ODR_SENT_DOCS: Record<"AXA" | "GENERALI" | "SADA" | "MILA", OdrSentRecord[]> = {
  AXA: [],
  GENERALI: [],
  SADA: [],
  MILA: [],
};
