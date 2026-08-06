import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrimeFromFrontDocs } from "@/lib/front-insurance";

// POST /api/prime/verify/batch  { limit? }
// Vérifie une TRANCHE de dossiers sans prime ET jamais tentés (primeVerifTenteLe
// null). Chaque dossier traité est marqué (trouvé ou non) → les tranches suivantes
// ne prennent QUE de nouveaux dossiers. Prime trouvée → écrite + verrou contrat
// (contratVerrouilleLe) pour qu'Omni ne l'écrase pas. Coûteux → tranches courtes.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(1, Number(body.limit) || 5), 20);

  const rows = await prisma.insurancePipeline.findMany({
    where: { copro: { archivedAt: null, primeActuelle: null, primeVerifTenteLe: null } },
    orderBy: { copro: { id: "asc" } },
    take: limit,
    select: { id: true, copro: { select: { id: true, buildingId: true, nom: true, adresse: true } } },
  });

  let resolved = 0;
  let montant = 0;
  const seen = new Set<string>();
  const now = new Date();
  for (const p of rows) {
    if (seen.has(p.copro.id)) continue;
    seen.add(p.copro.id);
    const res = await getPrimeFromFrontDocs(p.copro.buildingId ?? "", [p.copro.adresse, p.copro.nom]);
    if (res.montant && res.confidence) {
      await prisma.copro.update({
        where: { id: p.copro.id },
        data: { primeActuelle: res.montant, primeAVerifier: res.confidence === "unsure", primeVerifTenteLe: now, contratVerrouilleLe: now },
      });
      await prisma.pipelineEvent.create({
        data: {
          pipelineId: p.id,
          type: "action_manuelle",
          description: `Prime récupérée automatiquement depuis Front (${res.source}) : ${res.montant} €${res.confidence === "unsure" ? " — à vérifier" : ""}`,
          createdBy: actor,
        },
      });
      resolved++;
      montant += res.montant;
    } else {
      // Rien trouvé → marqué comme tenté (exclu des runs suivants).
      await prisma.copro.update({ where: { id: p.copro.id }, data: { primeVerifTenteLe: now } });
    }
  }

  return NextResponse.json({ processed: rows.length, resolved, montant, done: rows.length < limit });
}
