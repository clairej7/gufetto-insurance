"use client";

// Graphes « flux par jour » du dashboard. Générique (FlowChart) pour être
// réutilisé côté RS (avec relances) et côté devis. Données live depuis Gufetto
// (aucun cache), passées en prop depuis la page.
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type Row = { date: string; label: string; sent: number; recus: number; relances?: number };

export function FlowChart({
  data, title, subtitle, sentLabel, recusLabel,
  recusTotal, demandesTotal, tauxTitle, recusUnit, demandesUnit,
  height = 210,
}: {
  data: Row[];
  title: string;
  subtitle: string;
  sentLabel: string;
  recusLabel: string;
  recusTotal: number;
  demandesTotal: number;
  tauxTitle: string;
  recusUnit: string;   // ex. "RS reçus" / "devis reçus"
  demandesUnit: string; // ex. "demandes"
  height?: number;
}) {
  const hasRelances = data.some((d) => (d.relances ?? 0) > 0);
  const taux = demandesTotal > 0 ? Math.round((recusTotal / demandesTotal) * 100) : 0;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#26262C", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "#A2A1AF", marginBottom: 10, minHeight: 30 }}>{subtitle}</div>
      <div style={{ position: "relative", width: "100%", height }}>
        {/* Encart taux — posé sur l'espace vide (haut gauche). */}
        <div style={{ position: "absolute", top: 4, left: 46, zIndex: 2, background: "rgba(255,255,255,0.9)", border: "1px solid #E8E8EC", borderRadius: 10, padding: "6px 12px", pointerEvents: "none" }}>
          <div style={{ fontSize: 10.5, color: "#656576", fontWeight: 600 }}>{tauxTitle}</div>
          <div style={{ fontSize: 23, fontWeight: 800, color: "#13762C", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{taux}%</div>
          <div style={{ fontSize: 10.5, color: "#A2A1AF", fontVariantNumeric: "tabular-nums" }}>{recusTotal} {recusUnit} / {demandesTotal} {demandesUnit}</div>
        </div>
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="#F1F1F4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "#A2A1AF" }} interval="preserveStartEnd" minTickGap={22} axisLine={{ stroke: "#E8E8EC" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: "#A2A1AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E8E8EC" }} labelStyle={{ color: "#26262C", fontWeight: 600 }} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="sent" name={sentLabel} stackId="s" fill="#4E49FC" radius={hasRelances ? [0, 0, 0, 0] : [3, 3, 0, 0]} maxBarSize={26} />
              {hasRelances && <Bar dataKey="relances" name="Relances" stackId="s" fill="#93C5FD" radius={[3, 3, 0, 0]} maxBarSize={26} />}
              <Line dataKey="recus" name={recusLabel} type="monotone" stroke="#E8683A" strokeWidth={2} dot={{ r: 2.5, fill: "#E8683A" }} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// Wrapper RS conservé pour compat (utilisé seul ailleurs le cas échéant).
export function RsFlowChart({ data, recusTotal, demandesTotal }: { data: Row[]; recusTotal: number; demandesTotal: number }) {
  if (!data.length) return null;
  return (
    <FlowChart
      data={data}
      title="Flux des relevés de sinistralité — par jour"
      subtitle="Demandes de RS envoyées + relances (barres) vs RS reçus « actés » (ligne). Mise à jour automatique avec l'activité Gufetto."
      sentLabel="Demandes de RS envoyées"
      recusLabel="RS reçus (actés)"
      recusTotal={recusTotal}
      demandesTotal={demandesTotal}
      tauxTitle="Taux de récupération du RS"
      recusUnit="RS reçus"
      demandesUnit="demandes"
    />
  );
}
