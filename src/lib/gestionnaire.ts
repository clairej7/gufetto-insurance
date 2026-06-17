// Affichage du gestionnaire.
// L'email reste la clé technique partout (filtres, assignation, destinataires) ;
// ces helpers ne servent qu'à PRODUIRE UN LIBELLÉ lisible.

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Dérive un nom depuis l'email (fallback historique : "romain.azema@..." -> "Romain Azema").
export function deriveNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const prenom = email.split(".")[0];
  const nom = email.split(".")[1]?.split("@")[0];
  return prenom && nom ? `${cap(prenom)} ${cap(nom)}` : email.split("@")[0];
}

// Libellé à afficher : le nom Omni (AM/PM Name) s'il est présent, sinon la
// dérivation depuis l'email. Ne renvoie jamais de fallback "équipe Matera" :
// les appelants qui en veulent un l'ajoutent eux-mêmes (`|| "L'équipe Matera"`).
export function gestionnaireLabel(
  email: string | null | undefined,
  nom?: string | null
): string {
  if (nom && nom.trim()) return nom.trim();
  return deriveNameFromEmail(email);
}
