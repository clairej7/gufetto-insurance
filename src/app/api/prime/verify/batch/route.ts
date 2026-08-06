import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrimeFromFrontDocs } from "@/lib/front-insurance";

// POST /api/prime/verify/batch  { cursor?, limit? }
// Vérifie une TRANCHE de dossiers SANS prime (copro.primeActuelle null, non archivée).
// Curseur = copro.id (on avance par id croissant → chaque dossier traité une fois,
// même ceux où rien n'est trouvé). Coûteux (Front + Claude/dossier) → chunks courts.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const cursor = typeof body.cursor === "string" ? body.cursor : "";
  const limit = Math.min(Math.max(1, Number(body.limit) || 5), 20);

  const rows = await prisma.insurancePipeline.findMany({
    where: { copro: { archivedAt: null, primeActuelle: null, id: { gt: cursor } } },
    orderBy: { copro: { id: "asc" } },
    take: limit,
    select: { id: true, copro: { select: { id: true, buildingId: true, nom: true, adresse: true } } },
  });

  let resolved = 0;
  let montant = 0;
  let nextCursor = cursor;
  const seen = new Set<string>();
  for (const p of rows) {
    nextCursor = p.copro.id;
    if (seen.has(p.copro.id)) continue;
    seen.add(p.copro.id);
    const res = await getPrimeFromFrontDocs(p.copro.buildingId ?? "", [p.copro.adresse, p.copro.nom]);
    if (res.montant && res.confidence) {
      await prisma.copro.update({
        where: { id: p.copro.id },
        data: { primeActuelle: res.montant, primeAVerifier: res.confidence === "unsure" },
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
    }
  }

  return NextResponse.json({ processed: rows.length, resolved, montant, nextCursor, done: rows.length < limit });
}
