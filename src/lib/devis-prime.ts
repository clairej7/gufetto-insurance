// Règle "prime de référence" pour la comparaison des devis MRI.
//
// Problème corrigé : la base de comparaison (économie/surcoût) utilisait la prime
// du CONTRAT (souvent périmée, trop basse) → les devis paraissaient plus chers
// que la réalité. On préfère désormais la DERNIÈRE PRIME PAYÉE (récupérée depuis
// le mail de demande de devis envoyé à l'assureur, cf. front-insurance.ts).
//
// Règle validée avec Quentin (mesure sur 19 dossiers réels) :
//  - défaut = la prime payée (souvent = contrat, sinon plus haute = la vraie) ;
//  - on ne substitue que si le contrat est PLUS FAIBLE que la prime payée
//    (jamais gonfler artificiellement une économie) ;
//  - CAS ÉTRANGE (forte divergence) → on ne tranche pas : `bloque`, saisie manuelle.
//    Ex. réel 81 bis Chefson : contrat 638 € = chiffre pourri, prime 3400 € = juste.
//    → il ne faut donc SURTOUT PAS retomber sur le contrat en cas étrange.

export type PrimeFlag = "ok" | "bloque";

export type PrimeResolution = {
  /** Montant à utiliser comme base de comparaison. `null` si `bloque`. */
  value: number | null;
  /** D'où vient `value`. */
  source: "prime" | "contrat" | "none";
  flag: PrimeFlag;
  contrat: number | null;
  primePayee: number | null;
  /** primePayee / contrat (null si l'un des deux manque). */
  ratio: number | null;
};

// Bornes de cohérence : au-delà, on considère la divergence anormale et on bloque.
// [0.5, 2] couvre aussi le piège "mensuel vs annuel" (ratio ~0.083 ou ~12).
const RATIO_MIN = 0.5;
const RATIO_MAX = 2;

export function resolvePrimeReference(
  contrat: number | null | undefined,
  primePayee: number | null | undefined,
): PrimeResolution {
  const c = typeof contrat === "number" && Number.isFinite(contrat) && contrat > 0 ? contrat : null;
  const p = typeof primePayee === "number" && Number.isFinite(primePayee) && primePayee > 0 ? primePayee : null;

  // Un seul montant disponible → pas de choix à faire.
  if (p == null) return { value: c, source: c != null ? "contrat" : "none", flag: "ok", contrat: c, primePayee: null, ratio: null };
  if (c == null) return { value: p, source: "prime", flag: "ok", contrat: null, primePayee: p, ratio: null };

  const ratio = p / c;

  // Cas étrange → on demande une saisie plutôt que d'afficher une compa trompeuse.
  if (ratio < RATIO_MIN || ratio > RATIO_MAX) {
    return { value: null, source: "none", flag: "bloque", contrat: c, primePayee: p, ratio };
  }

  // Cas normal : on prend la prime payée si le contrat est plus faible (la vraie,
  // souvent plus haute) ; sinon on garde le contrat (déjà ≥ prime payée).
  const usePrime = c < p;
  return {
    value: usePrime ? p : c,
    source: usePrime ? "prime" : "contrat",
    flag: "ok",
    contrat: c,
    primePayee: p,
    ratio,
  };
}

// Parse un montant en euros tel qu'écrit dans les mails/écrans FR ou EN.
// Gère "3400", "2516.75", "2 516,75", "10 232,42", et le piège FR "2.215" (= 2215,
// point = séparateur de milliers quand suivi de 3 chiffres), vu en réel sur 20 Av.
// de Cran. Retourne null si non parsable.
export function parseEuroAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[\s  ]/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Le dernier séparateur rencontré est le décimal ; l'autre = milliers.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    // "2.215" → un seul point suivi de 3 chiffres = séparateur de milliers FR.
    if (parts.length === 2 && parts[1].length === 3) s = parts.join("");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
