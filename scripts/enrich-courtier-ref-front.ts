// Auto 3 — enrichit la base courtiers à partir des demandes de RS réellement
// envoyées dans Front (metadata.to des events rsType=draft_sent = mail courtier
// utilisé). Politique : NE PAS écraser le mail principal fourni par Quentin ;
// on ajoute les mails observés en secondaire + note, et on crédite les
// occurrences réelles. Les domaines inconnus = courtiers hors base (à qualifier).
//
// Dry-run  : npx tsx scripts/enrich-courtier-ref-front.ts
// Appliquer: npx tsx scripts/enrich-courtier-ref-front.ts --apply
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { normNom } from "../src/lib/courtier-ref";

const APPLY = process.argv.includes("--apply");

// Domaines génériques : ne pas rattacher par domaine, seulement par mail exact.
const GENERIC = new Set(["wanadoo.fr", "orange.fr", "gmail.com", "free.fr", "hotmail.fr", "hotmail.com", "outlook.fr", "outlook.com", "yahoo.fr", "yahoo.com", "laposte.net", "sfr.fr", "bbox.fr", "gmx.fr"]);

const domainOf = (email: string) => (email.includes("@") ? email.split("@")[1].toLowerCase().trim() : "");

// Alias de domaines → nom de courtier déjà en base (variantes / TLD différents
// / courtier sans mail en base type Verspieren).
const ALIASES: Record<string, string> = {
  "verspieren.com": "Verspieren",
  "vespieren.com": "Verspieren", // coquille récurrente
  "abeille-assurances.fr": "Abeille Assurances",
};

// Domaines d'agences d'assureurs jouant l'agent général (cas Quentin : Allianz).
const AGENT_GENERAL: Record<string, string> = {
  "gan.fr": "GAN",
  "agents.allianz.fr": "Allianz",
  "agents.alliantz.fr": "Allianz",
  "allianz.fr": "Allianz",
  "mma.fr": "MMA",
  "agence-swisslife.fr": "Swiss Life",
  "galian-smabtp.fr": "SMABTP",
  "cmam.fr": "CMAM",
};

function titleCase(s: string) {
  return s.replace(/[-_.]+/g, " ").split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

async function main() {
  // 1) mails courtier réellement utilisés (1 par dossier).
  const ev = await prisma.pipelineEvent.findMany({
    where: { metadata: { path: ["rsType"], equals: "draft_sent" } },
    select: { pipelineId: true, metadata: true },
  });
  const seen = new Set<string>();
  const emailCount = new Map<string, number>();
  for (const e of ev) {
    if (seen.has(e.pipelineId)) continue;
    seen.add(e.pipelineId);
    const to = ((e.metadata as any)?.to ?? "").toString().toLowerCase().trim();
    if (!to || !to.includes("@")) continue;
    emailCount.set(to, (emailCount.get(to) ?? 0) + 1);
  }

  // 2) base actuelle + index domaine→ref et mail→ref.
  const base = await prisma.courtierRef.findMany();
  const byNom = new Map(base.map((b) => [b.nom, b]));
  const byDomain = new Map<string, typeof base[number]>();
  const byEmail = new Map<string, typeof base[number]>();
  for (const b of base) {
    if (b.source === "front") continue; // n'indexer que la base manuelle stable
    const emails = (b.emailsAll ?? b.email ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    for (const em of emails) {
      byEmail.set(em.toLowerCase(), b);
      const d = domainOf(em);
      if (d && !GENERIC.has(d)) byDomain.set(d, b);
    }
  }
  for (const [d, nom] of Object.entries(ALIASES)) {
    const b = byNom.get(nom);
    if (b) byDomain.set(d, b);
  }

  // 3) attribution.
  type Obs = { email: string; count: number };
  const perRef = new Map<string, Obs[]>(); // refId -> observations
  const orphans = new Map<string, { emails: Map<string, number>; total: number }>(); // domain -> ...
  for (const [email, count] of emailCount) {
    const exact = byEmail.get(email);
    const d = domainOf(email);
    const ref = exact ?? (GENERIC.has(d) ? undefined : byDomain.get(d));
    if (ref) {
      const arr = perRef.get(ref.id) ?? [];
      arr.push({ email, count });
      perRef.set(ref.id, arr);
    } else {
      const key = GENERIC.has(d) ? email : d; // regroupe par domaine sauf générique
      const o = orphans.get(key) ?? { emails: new Map(), total: 0 };
      o.emails.set(email, (o.emails.get(email) ?? 0) + count);
      o.total += count;
      orphans.set(key, o);
    }
  }

  // 4) rapport base.
  console.log(`\n=== RS envoyées : ${seen.size} dossiers · ${emailCount.size} mails distincts ===\n`);
  console.log("--- COURTIERS DE LA BASE (occurrences réelles + mails observés) ---");
  const refById = new Map(base.map((b) => [b.id, b]));
  const enrich: { id: string; occ: number; newEmails: string[]; fillPrincipal: string | null }[] = [];
  for (const [id, obs] of [...perRef.entries()].sort((a, b) => b[1].reduce((s, o) => s + o.count, 0) - a[1].reduce((s, o) => s + o.count, 0))) {
    const b = refById.get(id)!;
    const occ = obs.reduce((s, o) => s + o.count, 0);
    const known = new Set((b.emailsAll ?? b.email ?? "").split(";").map((s) => s.trim().toLowerCase()).filter(Boolean));
    const newEmails = obs.map((o) => o.email).filter((e) => !known.has(e));
    const fillPrincipal = !b.email && obs.length ? obs.sort((x, y) => y.count - x.count)[0].email : null;
    enrich.push({ id, occ, newEmails, fillPrincipal });
    const flag = newEmails.length ? `  ➕ ${newEmails.length} nouveau(x)` : "";
    const fp = fillPrincipal ? `  ⬆︎ principal: ${fillPrincipal}` : "";
    console.log(`${String(occ).padStart(3)}×  [${b.type}] ${b.nom}${flag}${fp}`);
    for (const o of obs.sort((x, y) => y.count - x.count)) console.log(`        ${String(o.count).padStart(3)}×  ${o.email}${known.has(o.email) ? "" : "  (nouveau)"}`);
  }

  // 5) rapport hors base.
  console.log(`\n--- HORS BASE : ${orphans.size} courtier(s)/domaine(s) candidat(s) ---`);
  for (const [key, o] of [...orphans.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`${String(o.total).padStart(3)}×  ${key}`);
    for (const [em, c] of [...o.emails.entries()].sort((a, b) => b[1] - a[1])) console.log(`        ${String(c).padStart(3)}×  ${em}`);
  }

  if (!APPLY) {
    console.log(`\n(dry-run — relancer avec --apply pour écrire l'enrichissement de la base existante ; les hors-base ne sont PAS créés automatiquement)`);
    return;
  }

  // 6) applique l'enrichissement NON destructif sur les courtiers existants.
  let touched = 0;
  for (const e of enrich) {
    const b = refById.get(e.id)!;
    const existing = (b.emailsAll ?? b.email ?? "").split(";").map((s) => s.trim()).filter(Boolean);
    const merged = [...existing];
    for (const ne of e.newEmails) if (!merged.some((m) => m.toLowerCase() === ne.toLowerCase())) merged.push(ne);
    const note = e.newEmails.length
      ? `${b.notes ? b.notes + " " : ""}[Front] mail(s) observé(s) en RS : ${e.newEmails.join(", ")}.`
      : b.notes;
    await prisma.courtierRef.update({
      where: { id: b.id },
      data: {
        email: b.email ?? e.fillPrincipal, // remplit seulement si vide (jamais d'écrasement)
        emailsAll: merged.length ? merged.join(";") : null,
        occurrences: e.occ,
        notes: note,
      },
    });
    touched++;
  }
  console.log(`\n✅ Enrichissement appliqué : ${touched} courtier(s) de la base mis à jour (principal préservé).`);

  // 7) (re)crée les courtiers HORS BASE découverts (source=front). Idempotent :
  // on purge d'abord les précédents source=front, puis on agrège par nom (les
  // agences Allianz/Assurcopro éparpillées sur plusieurs domaines fusionnent).
  await prisma.courtierRef.deleteMany({ where: { source: "front" } });
  const agg = new Map<string, { nom: string; emails: Map<string, number>; total: number; ag: string | null; generic: boolean }>();
  for (const [key, o] of orphans) {
    const isGenericEmail = key.includes("@");
    const domain = isGenericEmail ? domainOf(key) : key;
    const ag = AGENT_GENERAL[domain] ?? null;
    const nom = ag ? `${ag} (agent général)` : isGenericEmail ? titleCase(key.split("@")[0]) : titleCase(domain.replace(/\.(fr|com|net|org)$/i, ""));
    const nn = normNom(nom);
    const cur = agg.get(nn) ?? { nom, emails: new Map<string, number>(), total: 0, ag, generic: isGenericEmail };
    for (const [em, c] of o.emails) cur.emails.set(em, (cur.emails.get(em) ?? 0) + c);
    cur.total += o.total;
    agg.set(nn, cur);
  }
  let created = 0;
  for (const [nn, g] of agg) {
    // ne pas dupliquer un courtier déjà en base (source manuelle)
    if (await prisma.courtierRef.findFirst({ where: { nomNorm: nn, source: { not: "front" } } })) continue;
    const emails = [...g.emails.entries()].sort((a, b) => b[1] - a[1]).map(([em]) => em);
    const notes = g.ag
      ? `Agence/agent général ${g.ag} jouant le courtier. Découvert via RS Front (${g.total}×).`
      : `Découvert via RS Front (${g.total}×)${g.generic ? " — domaine générique, à qualifier" : ""}.`;
    await prisma.courtierRef.create({
      data: { nom: g.nom, nomNorm: nn, type: "courtier", email: emails[0] ?? null, emailsAll: emails.length ? emails.join(";") : null, assureur: g.ag, source: "front", verifie: false, occurrences: g.total, notes },
    });
    created++;
  }
  console.log(`✅ ${created} courtier(s) hors base créé(s) (source=front, à vérifier).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
