export const dynamic = "force-dynamic";

import { verifyOdrWeekToken, getOdrAcceptesSemaine, weekLabel } from "@/lib/odr-suivi";
import { OdrSuiviForm } from "./odr-suivi-form";

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F4F7", padding: "32px 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: wide ? 820 : 560, margin: "0 auto", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        {children}
      </div>
    </div>
  );
}

export default async function SuiviOdrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const weekIso = verifyOdrWeekToken(token);
  if (!weekIso) {
    return <Shell><h1 style={{ fontSize: 18, color: "#26262C" }}>Lien invalide ou expiré</h1><p style={{ color: "#656576", fontSize: 14 }}>Ce lien n&apos;est plus valable. Contacte l&apos;équipe assurance.</p></Shell>;
  }
  const weekStart = new Date(weekIso);
  const rows = await getOdrAcceptesSemaine(weekStart);

  return (
    <Shell wide>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: "#4E49FC", textTransform: "uppercase" }}>Assurances — Matera</div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#26262C", margin: "6px 0 2px" }}>ODR acceptés de la semaine</h1>
      <p style={{ fontSize: 14, color: "#656576", margin: "0 0 4px" }}>{weekLabel(weekStart)} · {rows.length} dossier{rows.length > 1 ? "s" : ""}</p>
      <p style={{ fontSize: 13.5, color: "#656576", margin: "10px 0 18px", lineHeight: 1.5 }}>
        Repère tes copropriétés ci-dessous. Si l&apos;une est <strong>sensible</strong> et que le conseil syndical doit être prévenu du changement d&apos;assurance, clique sur <strong style={{ color: "#7A3FF2" }}>« Prévenir le CS »</strong> — l&apos;équipe assurance s&apos;en occupera.
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: "#8A8A99", fontStyle: "italic" }}>Aucun ODR accepté cette semaine.</p>
      ) : (
        <OdrSuiviForm token={token} rows={rows} />
      )}
    </Shell>
  );
}
