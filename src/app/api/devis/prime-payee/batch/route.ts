import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDernierePrimePayeeFromFront } from "@/lib/front-insurance";
import { resolvePrimeReference } from "@/lib/devis-prime";

// Batch (admin) de l'automatisation 6 — AUDIT lecture seule : pour chaque dossier
// en « Comparaison des devis » (statut devis_recus), récupère la dernière prime
// payée via Front et la confronte à la prime du contrat. Signale les comparaisons
// à recaler (prime réelle plus élevée que le contrat) et les cas étranges.
//
// Pas d'écriture pour l'instant (la persistance / application auto est encore en
// cours). Traitement séquentiel et borné (limit) pour ménager l'API Front et
// rester sous le timeout ; le bouton enchaîne les lots via `offset`.

type BatchStats = {
  verifies: number;
  recale: number; // prime réelle > contrat → la comparaison sous-estime le coût actuel
  coherent: number; // prime ≈/≤ contrat → rien à changer
  bloque: number; // écart anormal → vérif manuelle
  introuvable: number; // prime non trouvée dans les demandes de devis Front
  erreurs: number;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as { offset?: number; limit?: number }));
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(Number(body.limit) || 10, 25); // borne : appels Front séquentiels

  const where = { statut: "devis_recus" as const, copro: { archivedAt: null } };
  const total = await prisma.insurancePipeline.count({ where });
  const pipelines = await prisma.insurancePipeline.findMany({
    where,
    select: {
      id: true,
      contratActuelData: true,
      copro: { select: { nom: true, buildingId: true, adresse: true, primeActuelle: true } },
    },
    orderBy: { createdAt: "asc" },
    skip: offset,
    take: limit,
  });

  const stats: BatchStats = { verifies: 0, recale: 0, coherent: 0, bloque: 0, introuvable: 0, erreurs: 0 };
  // Liste des dossiers à recaler / à vérifier (pour affichage admin).
  const aTraiter: { nom: string; contrat: number | null; prime: number; verdict: "recale" | "etrange" }[] = [];

  for (const p of pipelines) {
    stats.verifies++;
    try {
      const c = p.copro;
      // refOnly : batch rapide (recherche gufetto-ref uniquement, pas les
      // recherches building_id/adresse lentes) → introuvable instantané pour les
      // vieux dossiers sans marqueur.
      const r = await getDernierePrimePayeeFromFront(c?.buildingId ?? "", p.id, [c?.adresse, c?.nom], true);
      if (r.montant == null) {
        stats.introuvable++;
        continue;
      }
      // Prime du contrat = celle du comparatif (contratActuelData.primeTTC) sinon
      // la prime actuelle de la copro.
      let contratPrime: number | null = c?.primeActuelle ?? null;
      try {
        const d = p.contratActuelData ? (JSON.parse(p.contratActuelData) as { primeTTC?: number | null }) : null;
        if (d?.primeTTC != null) contratPrime = d.primeTTC;
      } catch {
        /* JSON invalide → on garde primeActuelle */
      }
      const res = resolvePrimeReference(contratPrime, r.montant);
      if (res.flag === "bloque") {
        stats.bloque++;
        aTraiter.push({ nom: c?.nom ?? p.id, contrat: contratPrime, prime: r.montant, verdict: "etrange" });
      } else if (res.source === "prime") {
        stats.recale++;
        aTraiter.push({ nom: c?.nom ?? p.id, contrat: contratPrime, prime: r.montant, verdict: "recale" });
      } else {
        stats.coherent++;
      }
    } catch {
      stats.erreurs++;
    }
  }

  const done = offset + pipelines.length >= total;
  return NextResponse.json({ success: true, count: pipelines.length, total, offset, done, stats, aTraiter });
}
