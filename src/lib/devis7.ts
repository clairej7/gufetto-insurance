// Automatisation 7 « Envois et suivi des propositions au CS ».
// Un dossier entre ici quand le gestionnaire a VALIDÉ en auto 6 (event marqueur
// `devis7_entered`, posé en même temps que le passage à l'étape validation_cs).
// Il reste listé même après passage en refuse (perdu) / termine (clos) — d'où le
// filtrage par le marqueur et non par le statut courant.
import { prisma } from "@/lib/prisma";
import { getExcludedCoproIds } from "@/lib/exclusions";

export type Devis7CsStatut = "accepte" | "refus" | null;
export type Devis7Resiliation = "oui" | "non" | "-" | null;
export type CsMember = { name: string; email: string };
export type Devis7Row = {
  pipelineId: string; nom: string; adresse: string | null;
  gestioReponse: "valide" | "refus" | null; gestioComment: string | null;
  gestionnaireNom: string | null;
  csMembers: CsMember[]; csMembersSyncedAt: string | null;
  csSentAt: string | null;
  csStatut: Devis7CsStatut; resiliation: Devis7Resiliation;
  statutPipeline: string;
};
export type Devis7Table = { total: number; rows: Devis7Row[] };

const autoOf = (m: unknown): string | undefined => (m as { auto?: string } | null)?.auto;

function parseCsMembers(raw: string | null): CsMember[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((m) => m?.email) : []; } catch { return []; }
}
function gestLabel(nom: string | null, email: string | null): string | null {
  if (nom?.trim()) return nom.trim();
  if (!email) return null;
  const local = email.split("@")[0];
  return local.split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export async function getDevis7TableData(): Promise<Devis7Table> {
  const excl = await getExcludedCoproIds();
  const ps = await prisma.insurancePipeline.findMany({
    where: {
      coproId: { notIn: excl }, copro: { archivedAt: null },
      events: { some: { metadata: { path: ["auto"], equals: "devis7_entered" } } },
    },
    select: {
      id: true, statut: true, copro: { select: { nom: true, adresse: true, gestionnaireNom: true, gestionnaireEmail: true, csMembersData: true, csMembersSyncedAt: true } },
      events: {
        where: { OR: [
          { metadata: { path: ["auto"], equals: "devis6_gestio_response" } },
          { metadata: { path: ["auto"], equals: "devis7_cs_statut" } },
          { metadata: { path: ["auto"], equals: "devis7_resiliation" } },
          { metadata: { path: ["auto"], equals: "devis7_cs_sent" } },
          { metadata: { path: ["auto"], equals: "devis7_entered" } },
        ] },
        orderBy: { createdAt: "desc" }, select: { metadata: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows: Devis7Row[] = ps.map((p) => {
    const latestEv = (auto: string) => p.events.find((e) => autoOf(e.metadata) === auto);
    const latest = (auto: string) => latestEv(auto)?.metadata as Record<string, unknown> | undefined;
    const gestio = latest("devis6_gestio_response");
    const cs = latest("devis7_cs_statut");
    const resil = latest("devis7_resiliation");
    const csSent = latestEv("devis7_cs_sent");
    const csStatut: Devis7CsStatut = cs?.value === "accepte" || cs?.value === "refus" ? (cs.value as Devis7CsStatut) : null;
    let resiliation: Devis7Resiliation = resil?.value === "oui" || resil?.value === "non" || resil?.value === "-" ? (resil.value as Devis7Resiliation) : null;
    if (csStatut === "refus") resiliation = "-"; // forcé quand le CS refuse
    return {
      pipelineId: p.id, nom: p.copro.nom, adresse: p.copro.adresse,
      gestioReponse: gestio?.reponse === "valide" || gestio?.reponse === "refus" ? (gestio.reponse as "valide" | "refus") : null,
      gestioComment: (gestio?.comment as string) ?? null,
      gestionnaireNom: gestLabel(p.copro.gestionnaireNom, p.copro.gestionnaireEmail),
      csMembers: parseCsMembers(p.copro.csMembersData),
      csMembersSyncedAt: p.copro.csMembersSyncedAt?.toISOString() ?? null,
      csSentAt: csSent?.createdAt?.toISOString() ?? null,
      csStatut, resiliation, statutPipeline: p.statut,
    };
  });
  return { total: rows.length, rows };
}
