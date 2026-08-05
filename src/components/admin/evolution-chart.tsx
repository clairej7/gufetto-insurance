"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type RawEvent = {
  id: string;
  nouveauStatut: string | null;
  createdAt: Date;
  pipeline: { copro: { gestionnaireEmail: string | null } };
};

// Stages à suivre dans le graphe (les terminaux regroupés en "Perdu")
const TRACKED: { statut: string; label: string; color: string }[] = [
  { statut: "odr_en_cours",   label: "ODR",           color: "#F5C55A" },
  { statut: "odr_envoye",     label: "ODR envoyée",   color: "#E8943A" },
  { statut: "odr_accepte",    label: "ODR accepté",   color: "#6FCF97" },
  { statut: "odr_en_vigueur", label: "ODR en vigueur", color: "#34C759" },
  { statut: "rs_en_cours",    label: "RS",            color: "#B8B5FD" },
  { statut: "devis_demandes", label: "Devis dem.",    color: "#9B97FC" },
  { statut: "devis_recus",    label: "Devis reçus",   color: "#7C79F8" },
  { statut: "envoye_cs",      label: "Validé CS",     color: "#F5A623" },
  { statut: "contrat_signe",  label: "Contrat signé", color: "#34C759" },
  { statut: "termine",        label: "Clôturé",       color: "#0E5D22" },
  { statut: "_lost",          label: "Perdu",         color: "#FECACA" },
];
const LOST_STATUTS = new Set(["abandonne", "refuse", "non_assurable"]);

function getISOWeekKey(date: Date): { key: string; label: string } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  // Label: lundi de la semaine
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const label = monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return { key: `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`, label };
}

function buildWeeks(events: RawEvent[], gestionnaires: string[]): Record<string, unknown>[] {
  // Générer les 12 dernières semaines même si vides
  const weeks: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(getISOWeekKey(d));
  }
  // Dédupliquer les labels (au cas où)
  const seen = new Set<string>();
  const uniqueWeeks = weeks.filter(w => { if (seen.has(w.key)) return false; seen.add(w.key); return true; });

  const map: Record<string, Record<string, number>> = {};
  for (const w of uniqueWeeks) map[w.key] = {};

  for (const ev of events) {
    if (gestionnaires.length > 0 && !gestionnaires.includes(ev.pipeline.copro.gestionnaireEmail ?? "")) continue;
    const { key } = getISOWeekKey(new Date(ev.createdAt));
    if (!map[key]) continue;
    const statut = LOST_STATUTS.has(ev.nouveauStatut ?? "") ? "_lost" : (ev.nouveauStatut ?? "");
    if (!TRACKED.find(t => t.statut === statut)) continue;
    map[key][statut] = (map[key][statut] ?? 0) + 1;
  }

  return uniqueWeeks.map(w => ({ week: w.label, ...map[w.key] }));
}

const N_DAYS = 14;
function getDayKey(date: Date): { key: string; label: string } {
  const d = new Date(date);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const label = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }); // ex. "lun 12"
  return { key, label };
}

// Découpage par JOUR sur les N_DAYS derniers jours (pour voir "depuis hier").
function buildDays(events: RawEvent[], gestionnaires: string[]): Record<string, unknown>[] {
  const days: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = N_DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(getDayKey(d));
  }
  const map: Record<string, Record<string, number>> = {};
  for (const dd of days) map[dd.key] = {};

  for (const ev of events) {
    if (gestionnaires.length > 0 && !gestionnaires.includes(ev.pipeline.copro.gestionnaireEmail ?? "")) continue;
    const { key } = getDayKey(new Date(ev.createdAt));
    if (!map[key]) continue;
    const statut = LOST_STATUTS.has(ev.nouveauStatut ?? "") ? "_lost" : (ev.nouveauStatut ?? "");
    if (!TRACKED.find(t => t.statut === statut)) continue;
    map[key][statut] = (map[key][statut] ?? 0) + 1;
  }
  // On garde la clé "week" comme dataKey de l'axe X (c'est juste le libellé).
  return days.map(dd => ({ week: dd.label, ...map[dd.key] }));
}

interface EvolutionChartProps {
  events: RawEvent[];
  filteredGestionnaires: string[];
}

export function EvolutionChart({ events, filteredGestionnaires }: EvolutionChartProps) {
  const [mode, setMode] = useState<"semaine" | "jour">("semaine");
  const data = mode === "jour"
    ? buildDays(events, filteredGestionnaires)
    : buildWeeks(events, filteredGestionnaires);
  const hasData = data.some(w => TRACKED.some(t => (w as Record<string, unknown>)[t.statut]));

  const toggle = (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 2, background: "#F7F7F8", borderRadius: 6, padding: 2 }}>
        {(["semaine", "jour"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 4,
              border: "none", cursor: "pointer",
              background: mode === m ? "#fff" : "transparent",
              color: mode === m ? "#26262C" : "#A2A1AF",
              boxShadow: mode === m ? "0 1px 2px rgba(13,22,63,.08)" : "none",
            }}
          >
            {m === "semaine" ? "Semaine" : "Jour (14 j)"}
          </button>
        ))}
      </div>
    </div>
  );

  if (!hasData) {
    return (
      <>
        {toggle}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: 200, color: "#A2A1AF", fontSize: 13, gap: 8,
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3v18h18M7 16l4-4 4 4 4-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {mode === "jour" ? "Aucune transition sur les 14 derniers jours" : "Les transitions apparaîtront ici au fil des semaines"}
        </div>
      </>
    );
  }

  return (
    <>
    {toggle}
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barSize={14} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="#F3F3F5" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11, fill: "#A2A1AF", fontFamily: "ui-monospace, Menlo, monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#A2A1AF", fontFamily: "ui-monospace, Menlo, monospace" }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          cursor={{ fill: "#F7F7F8" }}
          contentStyle={{
            border: "1px solid #E8E8EC", borderRadius: 8,
            fontSize: 12, padding: "8px 12px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
            boxShadow: "0 4px 16px rgba(13,22,63,.10)",
          }}
          labelStyle={{ fontWeight: 600, color: "#26262C", marginBottom: 4 }}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 11, color: "#656576", paddingTop: 12 }}
        />
        {TRACKED.map((t, i) => (
          <Bar
            key={t.statut}
            dataKey={t.statut}
            name={t.label}
            stackId="a"
            fill={t.color}
            radius={i === TRACKED.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
    </>
  );
}
