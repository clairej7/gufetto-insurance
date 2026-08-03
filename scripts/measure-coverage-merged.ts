// Mesure LECTURE SEULE du gain "fallback Omni" : sur les dossiers "identifie"
// réels, compare la fiabilité/aiguillage en Front-seul vs Front + champs déjà
// présents sur la copro (Omni). N'écrit RIEN.
//
// Usage : npx tsx scripts/measure-coverage-merged.ts [N]   (défaut N=40)

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractInsuranceInfoFromFront, matchPartner } from "../src/lib/front-insurance";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const usableMail = (m: string | null | undefined): boolean =>
  !!m && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m) &&
  !/^(?:no-?reply|noreply|donotreply)@|(?:^|[._-])(?:infocnil|cnil|reclamations?)@/i.test(m);

async function main() {
  if (!process.env.DATABASE_URL || !process.env.FRONT_API_TOKEN) { console.error("DATABASE_URL + FRONT_API_TOKEN requis."); return; }
  const N = Number(process.argv[2]) || 40;
  const cands = (await prisma.insurancePipeline.findMany({
    where: { statut: "identifie", copro: { archivedAt: null } },
    include: { copro: true }, take: 400, orderBy: { createdAt: "asc" },
  })).filter((p) => /^\d+$/.test(p.copro.buildingId)).slice(0, N);

  const t = { total: 0, front: 0, merged: 0, gainOmni: 0, odr: 0, rs: 0, none: 0, err: 0 };
  for (const p of cands) {
    try {
      const c = p.copro;
      const info = await extractInsuranceInfoFromFront(c.buildingId);
      t.total++;
      if (info.reliable) t.front++;

      const effAssureur = info.assureur ?? c.assureurActuel ?? null;
      const effMail = usableMail(info.mailCourtier) ? info.mailCourtier : (usableMail(c.contactCourtierEmail) ? c.contactCourtierEmail : null);
      const effNumero = info.numeroContrat ?? c.numeroContrat ?? null;
      const reliable = !!effAssureur && (!!effMail || !!effNumero);
      const partner = info.isPartner || !!matchPartner(effAssureur);
      if (reliable) { t.merged++; if (!info.reliable) t.gainOmni++; partner ? t.odr++ : t.rs++; } else t.none++;
    } catch { t.err++; }
  }
  const pct = (n: number) => t.total ? Math.round((100 * n) / t.total) : 0;
  console.log(`\n===== GAIN FALLBACK OMNI (${t.total} dossiers "identifie", ${t.err} err) =====`);
  console.log(`  Front seul       : ${t.front}/${t.total} = ${pct(t.front)}%`);
  console.log(`  Front + Omni     : ${t.merged}/${t.total} = ${pct(t.merged)}%   (+${t.gainOmni} grâce à Omni)`);
  console.log(`  Aiguillage (Front+Omni) : ODR ${t.odr} · RS ${t.rs} · Aucune action ${t.none}`);
}
main().finally(() => prisma.$disconnect());
