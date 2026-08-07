export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";

// Onglet « Courtage Churn » — placeholder. Consigne les dossiers ODR/assurance liés
// à du churn (contrat transféré / contrordre / prime impayée / fin de syndic) repérés
// lors de la réconciliation avec la liste ODR AXA. À traiter plus tard.
const CHURN = {
  source: "Liste ODR AXA à jour — réconciliation du 07/08/2026",
  total: 183536,
  dossiers: 38,
  lignes: [
    { label: "Contrat transféré", n: 24, montant: 102911 },
    { label: "Contrordre (ODR annulé)", n: 11, montant: 56872 },
    { label: "Prime impayée", n: 2, montant: 21311 },
    { label: "Fin de contrat syndic / résilié", n: 1, montant: 2442 },
  ],
};

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €";

export default async function CourtageChurnPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/pipeline");

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFC" }}>
      <Navbar user={session.user} />
      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#26262C" }}>Courtage Churn</h1>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>À traiter plus tard</span>
        </div>
        <p style={{ fontSize: 13.5, color: "#656576", maxWidth: 760, margin: "0 0 20px" }}>
          Dossiers d&apos;assurance liés à du <strong>churn</strong> (contrat transféré, contrordre, prime impayée, fin de mandat syndic)
          repérés lors de la réconciliation entre la liste ODR AXA et Gufetto. Ce ne sont <strong>pas</strong> des pertes de pipeline
          actives — ils sont transférés / annulés / impayés côté assureur. Placeholder : <strong>on reviendra dessus plus tard</strong>.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ minWidth: 180, border: "1px solid #E8E8EC", borderRadius: 10, padding: "14px 18px", background: "#fff" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#CA1E12" }}>{eur(CHURN.total)}</div>
            <div style={{ fontSize: 12.5, color: "#656576" }}>montant churn identifié (AXA)</div>
          </div>
          <div style={{ minWidth: 180, border: "1px solid #E8E8EC", borderRadius: 10, padding: "14px 18px", background: "#fff" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#26262C" }}>{CHURN.dossiers}</div>
            <div style={{ fontSize: 12.5, color: "#656576" }}>dossiers concernés</div>
          </div>
        </div>

        <div style={{ border: "1px solid #E8E8EC", borderRadius: 10, background: "#fff", overflow: "hidden", maxWidth: 560 }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #F1F1F4", fontSize: 12.5, fontWeight: 600, color: "#26262C" }}>Répartition</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                <th style={{ padding: "8px 16px", fontWeight: 600 }}>Motif</th>
                <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>Dossiers</th>
                <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {CHURN.lignes.map((l) => (
                <tr key={l.label} style={{ borderTop: "1px solid #F1F1F4" }}>
                  <td style={{ padding: "8px 16px", color: "#26262C" }}>{l.label}</td>
                  <td style={{ padding: "8px 16px", color: "#4E4E58", textAlign: "right" }}>{l.n}</td>
                  <td style={{ padding: "8px 16px", color: "#26262C", textAlign: "right" }}>{eur(l.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Immeubles hors périmètre Gufetto (ODR AXA) — dont une grande partie en churn */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px dashed #E8E8EC" }}>
          <div className="flex items-center gap-3 mb-1">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Immeubles hors périmètre Gufetto (ODR AXA)</h2>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>À traiter prochainement</span>
          </div>
          <p style={{ fontSize: 13.5, color: "#656576", maxWidth: 780, margin: "0 0 12px" }}>
            Réconciliation de la liste ODR AXA : <strong>68 immeubles</strong> (~<strong>296 k€</strong> de primes) sont des immeubles
            Matera portant un ODR AXA mais <strong>absents du périmètre Gufetto</strong> (funnel MRI qui ne couvre que ~10 % du parc
            Matera). En les inspectant, <strong>une grande partie est en réalité en churn</strong> (immeubles ayant quitté / en cours de
            départ). À trier plus tard : distinguer les vrais actifs à onboarder des dossiers churnés à sortir.
          </p>
          <a href="/churn/ODR_AXA_hors_Gufetto.xlsx" download style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#4E49FC", border: "1px solid #D9D9F5", background: "#F5F5FF", borderRadius: 8, padding: "8px 14px" }}>
            ⬇ Télécharger la liste (Excel — 68 immeubles)
          </a>
        </div>

        <p style={{ fontSize: 12, color: "#A2A1AF", marginTop: 24 }}>Source : {CHURN.source}. Snapshot — sera réactualisé quand on traitera le sujet courtage/churn.</p>
      </main>
    </div>
  );
}
