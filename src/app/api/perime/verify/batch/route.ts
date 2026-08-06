import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyPerimeeRecovery } from "@/lib/perime";

// POST /api/perime/verify/batch  { limit? }
// Vérifie une TRANCHE de dossiers périmés jamais tentés (perimeeVerifTenteLe null).
// Chaque dossier traité est marqué (résolu ou non) via son curseur → les tranches
// suivantes ne prennent QUE de nouveaux dossiers. Coûteux (Front + Claude) → tranches courtes.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const actor = session.user.email!;

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(1, Number(body.limit) || 5), 20);

  const rows = await prisma.insurancePipeline.findMany({
    where: { copro: { archivedAt: null, donneePerimee: true, perimeeVerifTenteLe: null } },
    orderBy: { copro: { id: "asc" } },
    take: limit,
    select: { id: true, coproId: true },
  });

  let resolved = 0;
  const seen = new Set<string>();
  for (const p of rows) {
    if (seen.has(p.coproId)) continue;
    seen.add(p.coproId);
    const res = await applyPerimeeRecovery(p.id, actor);
    if (res.resolved) resolved++;
  }

  return NextResponse.json({ processed: rows.length, resolved, done: rows.length < limit });
}
