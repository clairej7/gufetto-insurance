"use client";

// Graphe du dashboard « Suivi des changements d'assureur » : par jour, les
// demandes de RS envoyées (barres), les relances (barres bleu clair empilées) et
// les RS reçus/actés (ligne). + encart « taux de récupération du RS ». Données
// live depuis Gufetto (aucun cache), passées en prop depuis la page.
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type Row = { date: string; label: string; sent: number; relances: number; recus: number };

export function RsFlowChart({ data, recusTotal, demandesTotal }: { data: Row[]; recusTotal: number; demandesTotal: number }) {
  if (!data.length) return null;
  const taux = demandesTotal > 0 ? Math.round((recusTotal / demandesTotal) * 100) : 0;
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #EFEFF3" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#26262C", marginBottom: 2 }}>Flux des relevés de sinistralité — par jour</div>
      <div style={{ fontSize: 12, color: "#A2A1AF", marginBottom: 12 }}>Demandes de RS envoyées + relances (barres) vs RS reçus « actés » (ligne). Mise à jour automatique avec l&apos;activité Gufetto.</div>
      <div style={{ position: "relative", width: "100%", height: 240 }}>
        {/* Encart taux de récupération — posé sur l'espace vide (haut gauche). */}
        <div style={{ position: "absolute", top: 6, left: 52, zIndex: 2, background: "rgba(255,255,255,0.9)", border: "1px solid #E8E8EC", borderRadius: 10, padding: "8px 14px", pointerEvents: "none" }}>
          <div style={{ fontSize: 11, color: "#656576", fontWeight: 600 }}>Taux de récupération du RS</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#13762C", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{taux}%</div>
          <div style={{ fontSize: 11, color: "#A2A1AF", fontVariantNumeric: "tabular-nums" }}>{recusTotal} RS reçus / {demandesTotal} demandes</div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
            <CartesianGrid stroke="#F1F1F4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#A2A1AF" }} interval="preserveStartEnd" minTickGap={20} axisLine={{ stroke: "#E8E8EC" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#A2A1AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E8E8EC" }} labelStyle={{ color: "#26262C", fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="sent" name="Demandes de RS envoyées" stackId="rs" fill="#4E49FC" radius={[0, 0, 0, 0]} maxBarSize={26} />
            <Bar dataKey="relances" name="Relances" stackId="rs" fill="#93C5FD" radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Line dataKey="recus" name="RS reçus (actés)" type="monotone" stroke="#E8683A" strokeWidth={2} dot={{ r: 2.5, fill: "#E8683A" }} activeDot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
