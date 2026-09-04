// Matching d'un devis (nommé par adresse) → copropriété, par code postal + n° + rue.
// Déterministe (pas d'IA). Utilisé par l'import de devis en masse. Un match n'est
// retenu que s'il est franc et non ambigu ; sinon le devis est reporté "non rattaché".

import { prisma } from "@/lib/prisma";

const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\bAV\b/g, "AVENUE").replace(/\bBD\b/g, "BOULEVARD").replace(/\bST\b/g, "SAINT")
  .replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["RUE", "AVENUE", "BOULEVARD", "IMPASSE", "ALLEE", "PLACE", "BIS", "TER", "DE", "DU", "DES", "LA", "LE", "LES", "D", "L", "ET", "LOTISSEMENT"]);
const tokens = (s: string) => norm(s).split(" ").filter((t) => t && !STOP.has(t) && !/^\d{5}$/.test(t) && !/^\d{1,4}$/.test(t));
const cpOf = (s: string) => (norm(s).match(/\b(\d{5})\b/) || [])[1] || "";
const numsOf = (s: string) => (norm(s).match(/\b\d{1,4}[A-Z]?\b/g) || []).filter((n) => !/^\d{5}$/.test(n));

export type CoproMatch = { coproId: string; coproNom: string; adresse: string; pipelineId: string | null; statut: string | null };
export type Matcher = (address: string) => { match: CoproMatch | null; reason: "ok" | "ambigu" | "aucun" };

export async function buildCoproMatcher(): Promise<Matcher> {
  const copros = await prisma.copro.findMany({
    where: { archivedAt: null, adresse: { not: null } },
    select: { id: true, nom: true, adresse: true, pipelines: { select: { id: true, statut: true } } },
  });
  const idx = copros.map((c) => ({ c, cp: cpOf(c.adresse!), tk: new Set(tokens(c.adresse!)), nums: new Set(numsOf(c.adresse!)) }));

  return (address: string) => {
    const fcp = cpOf(address), ftk = tokens(address), fnums = new Set(numsOf(address));
    const scored = idx.filter((x) => x.cp === fcp && fcp)
      .map((x) => ({ x, score: ftk.filter((t) => x.tk.has(t)).length * 2 + [...fnums].filter((n) => x.nums.has(n)).length * 3, tkOverlap: ftk.filter((t) => x.tk.has(t)).length }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0], second = scored[1];
    if (!best || best.score < 4 || best.tkOverlap === 0) return { match: null, reason: "aucun" };
    if (second && second.score === best.score) return { match: null, reason: "ambigu" };
    const pipe = best.x.c.pipelines[0] ?? null;
    return { match: { coproId: best.x.c.id, coproNom: best.x.c.nom, adresse: best.x.c.adresse!, pipelineId: pipe?.id ?? null, statut: pipe?.statut ?? null }, reason: "ok" };
  };
}
