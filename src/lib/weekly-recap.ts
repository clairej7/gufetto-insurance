// Recap hebdomadaire « Assurance Pro » posté dans #team_insurance_fr.
// Deux blocs : le FLUX de la semaine passée (events statut_change + réponses
// gestio) et le STOCK pipeline actuel — ce dernier réutilise categoriseDossier
// pour matcher EXACTEMENT les buckets du Tracking (« Répartition par étape »).
import { prisma } from "@/lib/prisma";
import { categoriseDossier } from "@/lib/pipeline";

type Agg = { n: number; mt: number };
const A = (): Agg => ({ n: 0, mt: 0 });
const add = (a: Agg, mt: number | null | undefined) => { a.n++; a.mt += mt ?? 0; };

// € : > 1 M → « 1,90 M€ » ; ≥ 1000 → « 731 k€ » ; sinon « 640 € ».
function fmtMt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(".", ",") + " M€";
  if (n >= 1000) return Math.round(n / 1000).toLocaleString("fr-FR") + " k€";
  return Math.round(n).toLocaleString("fr-FR") + " €";
}
const fmtDay = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

// Numéro de semaine ISO 8601.
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

// Semaine PASSÉE (lundi 00:00 → dimanche 23:59) relative à `ref`.
function lastWeekRange(ref: Date) {
  const d = new Date(ref);
  const dayNum = (d.getDay() + 6) % 7; // lundi = 0
  const monThis = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum, 0, 0, 0, 0);
  const start = new Date(monThis); start.setDate(monThis.getDate() - 7);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  const friday = new Date(start); friday.setDate(start.getDate() + 4);
  return { start, end, friday };
}

export async function computeWeeklyRecap(ref: Date) {
  const { start, end, friday } = lastWeekRange(ref);
  const week = isoWeek(start);

  // ── STOCK pipeline actuel (via categoriseDossier = mêmes buckets que le Tracking) ──
  const all = await prisma.insurancePipeline.findMany({
    select: { statut: true, copro: { select: { primeActuelle: true, dateEcheance: true, clientMriStatut: true, assureurActuel: true } } },
  });
  const stock = {
    odrEnCours: A(), odrEnvoyes: A(), odrAcceptes: A(),
    nonIdentifies: A(), attenteRS: A(), attenteDevis: A(), comparaison: A(), attenteCS: A(),
    signe: A(), gagne: A(), perdus: A(),
  };
  for (const p of all) {
    const mt = p.copro.primeActuelle;
    const b = categoriseDossier({ statut: p.statut, dateEcheance: p.copro.dateEcheance, clientMriStatut: p.copro.clientMriStatut, assureurActuel: p.copro.assureurActuel });
    if (b === "odr") add(stock.odrEnCours, mt);
    else if (b === "odr_envoye") add(stock.odrEnvoyes, mt);
    else if (b === "odr_accepte") add(stock.odrAcceptes, mt);
    else if (b === "clos") add(stock.gagne, mt);
    else if (b === "perdu") add(stock.perdus, mt);
    else { // actif (urgent / autre) → compteur d'étape
      if (p.statut === "identifie") add(stock.nonIdentifies, mt);
      else if (p.statut === "rs_en_cours") add(stock.attenteRS, mt);
      else if (p.statut === "devis_demandes") add(stock.attenteDevis, mt);
      else if (p.statut === "devis_recus") add(stock.comparaison, mt);
      else if (p.statut === "envoye_cs" || p.statut === "validation_cs") add(stock.attenteCS, mt);
      else if (p.statut === "contrat_signe") add(stock.signe, mt);
    }
  }
  const totalEnJeu = Object.values(stock).reduce((s, a) => s + a.mt, 0);

  // ── FLUX de la semaine passée (dossiers entrés dans l'étape) ──
  const evs = await prisma.pipelineEvent.findMany({
    where: { type: "statut_change", createdAt: { gte: start, lte: end } },
    select: { nouveauStatut: true, pipelineId: true },
  });
  const setFor = (st: string) => new Set(evs.filter((e) => e.nouveauStatut === st).map((e) => e.pipelineId));
  const wk = {
    odrEnvoyes: setFor("odr_envoye"),
    odrAcceptes: setFor("odr_accepte"),
    rsObtenus: setFor("devis_demandes"), // proxy : passage en demande de devis
    devisRecus: setFor("devis_recus"),
    signe: setFor("contrat_signe"),
  };
  // Propositions au CS (auto 7) : transmises (devis7_cs_sent) et acceptées (devis7_cs_statut = accepte).
  const csSentEv = await prisma.pipelineEvent.findMany({
    where: { createdAt: { gte: start, lte: end }, metadata: { path: ["auto"], equals: "devis7_cs_sent" } },
    select: { pipelineId: true },
  });
  const csStatutEv = await prisma.pipelineEvent.findMany({
    where: { createdAt: { gte: start, lte: end }, metadata: { path: ["auto"], equals: "devis7_cs_statut" } },
    select: { pipelineId: true, metadata: true },
  });
  const propTransmises = new Set(csSentEv.map((e) => e.pipelineId));
  const propAcceptees = new Set(csStatutEv.filter((e) => (e.metadata as { value?: string } | null)?.value === "accepte").map((e) => e.pipelineId));

  // € du flux : prime des dossiers concernés.
  const ids = new Set<string>([...wk.odrEnvoyes, ...wk.odrAcceptes, ...wk.rsObtenus, ...wk.devisRecus, ...wk.signe, ...propTransmises, ...propAcceptees]);
  const primeById = new Map<string, number>();
  if (ids.size) {
    const rows = await prisma.insurancePipeline.findMany({ where: { id: { in: [...ids] } }, select: { id: true, copro: { select: { primeActuelle: true } } } });
    rows.forEach((r) => primeById.set(r.id, r.copro.primeActuelle ?? 0));
  }
  const aggOf = (s: Set<string>): Agg => ({ n: s.size, mt: [...s].reduce((a, id) => a + (primeById.get(id) ?? 0), 0) });
  const weekly = {
    odrEnvoyes: aggOf(wk.odrEnvoyes), odrAcceptes: aggOf(wk.odrAcceptes), rsObtenus: aggOf(wk.rsObtenus),
    devisRecus: aggOf(wk.devisRecus), propTransmises: aggOf(propTransmises), propAcceptees: aggOf(propAcceptees), signe: aggOf(wk.signe),
  };

  // ── Message Block Kit ──
  const li = (label: string, a: Agg) => `${label} : *${a.n}* · ${fmtMt(a.mt)}`;
  const semaineTxt = [
    li("• 📤 ODR envoyés", weekly.odrEnvoyes),
    li("• ✅ ODR acceptés", weekly.odrAcceptes),
    li("• 📄 RS obtenus", weekly.rsObtenus),
    li("• 📨 Devis reçus", weekly.devisRecus),
    li("• 📩 Propositions transmises au CS", weekly.propTransmises),
    li("• 🤝 Propositions acceptées par le CS", weekly.propAcceptees),
    li("• 🖋️ Signés", weekly.signe),
  ].join("\n");
  const pipeTxt = [
    li("• ODR en cours", stock.odrEnCours),
    li("• ODR envoyés", stock.odrEnvoyes),
    li("• ODR acceptés", stock.odrAcceptes),
    li("• Non identifiés", stock.nonIdentifies),
    li("• Attente RS", stock.attenteRS),
    li("• Attente devis", stock.attenteDevis),
    li("• Comparaison devis en cours", stock.comparaison),
    li("• Attente validation CS", stock.attenteCS),
    li("• Signé", stock.signe),
    li("• Gagné & ODR en vigueur", stock.gagne),
    li("• Perdus", stock.perdus),
  ].join("\n");

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `Recap hebdo Assurance Pro — semaine ${week}`, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*🗓️ Cette semaine (${fmtDay(start)} – ${fmtDay(friday)})*\n${semaineTxt}` } },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*📦 Pipeline aujourd'hui* _(volume · valeur)_\n${pipeTxt}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: `💰 *Total en jeu : ${fmtMt(totalEnJeu)}*` }] },
  ];
  const text = `Recap hebdo Assurance Pro - semaine ${week} (du ${fmtDay(start)} au ${fmtDay(friday)})`;

  return { week, start, end, friday, weekly, stock, totalEnJeu, blocks, text };
}
