export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { resolvePrimeReference } from "@/lib/devis-prime";
import { verifyValidationToken } from "@/lib/devis6-token";
import { ValiderForm } from "./valider-form";

const fmtE = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F4F7", padding: "32px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {children}
      </div>
    </div>
  );
}

export default async function ValiderDevisPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { token } = await params;
  const { r } = await searchParams;
  const pipelineId = verifyValidationToken(token);
  if (!pipelineId) {
    return <Shell><h1 style={{ fontSize: 18, color: "#26262C" }}>Lien invalide ou expiré</h1><p style={{ color: "#656576", fontSize: 14 }}>Ce lien de validation n&apos;est plus valable. Contacte l&apos;équipe assurance.</p></Shell>;
  }

  const p = await prisma.insurancePipeline.findUnique({
    where: { id: pipelineId },
    select: {
      id: true, contratActuelData: true,
      copro: { select: { nom: true, adresse: true, assureurActuel: true, primeActuelle: true } },
      devisRecus: { orderBy: { createdAt: "asc" }, select: { assureur: true, primeTTC: true } },
      events: { where: { metadata: { path: ["auto"], equals: "devis6_gestio_response" } }, orderBy: { createdAt: "desc" }, take: 1, select: { metadata: true } },
    },
  });
  if (!p) return <Shell><h1 style={{ fontSize: 18 }}>Dossier introuvable</h1></Shell>;

  const contrat = (() => { try { return p.contratActuelData ? JSON.parse(p.contratActuelData) as { assureur?: string; primeTTC?: number } : {}; } catch { return {}; } })();
  const assureurActuel = contrat.assureur || p.copro.assureurActuel || "—";
  const contratPrime = typeof contrat.primeTTC === "number" ? contrat.primeTTC : p.copro.primeActuelle;
  const prixActuel = resolvePrimeReference(contratPrime, null).value;
  const prev = (p.events[0]?.metadata ?? null) as { reponse?: string; comment?: string } | null;

  const row = (label: string, value: string, strong?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F1F1F4", fontSize: 14 }}>
      <span style={{ color: "#656576" }}>{label}</span>
      <span style={{ color: "#26262C", fontWeight: strong ? 700 : 500, textAlign: "right" }}>{value}</span>
    </div>
  );

  return (
    <Shell>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "#4E49FC", textTransform: "uppercase" }}>Assurances — Matera</div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#26262C", margin: "6px 0 2px" }}>Nouveaux devis à valider</h1>
      <p style={{ fontSize: 14, color: "#656576", margin: "0 0 16px" }}>{p.copro.adresse || p.copro.nom}</p>

      <div style={{ marginBottom: 18 }}>
        {row("Assureur actuel", assureurActuel)}
        {row("Prix actuel", `${fmtE(prixActuel)} / an`)}
        {p.devisRecus[0] && row(`Devis 1 — ${p.devisRecus[0].assureur}`, `${fmtE(p.devisRecus[0].primeTTC)} / an`, true)}
        {p.devisRecus[1] && row(`Devis 2 — ${p.devisRecus[1].assureur}`, `${fmtE(p.devisRecus[1].primeTTC)} / an`, true)}
      </div>

      {prev?.reponse ? (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: prev.reponse === "valide" ? "#EAF7EE" : "#FDECEA", border: `1px solid ${prev.reponse === "valide" ? "#B7E4C4" : "#F4A9A0"}`, fontSize: 14, color: "#26262C" }}>
          Réponse déjà enregistrée : <strong>{prev.reponse === "valide" ? "transmission au CS confirmée ✅" : "ne pas envoyer 🚫"}</strong>
          {prev.comment ? <div style={{ marginTop: 6, color: "#656576" }}>💬 {prev.comment}</div> : null}
          <div style={{ marginTop: 8, fontSize: 12.5, color: "#656576" }}>Tu peux modifier ta réponse ci-dessous si besoin.</div>
        </div>
      ) : null}

      <ValiderForm token={token} defaultChoix={r === "oui" ? "valide" : r === "non" ? "refus" : null} />
    </Shell>
  );
}
