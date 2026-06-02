"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STEPS, getDaysUntilEcheance, getUrgenceBadge } from "@/lib/pipeline";
import { Building2, ChevronUp, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

type PipelineWithCopro = {
  id: string;
  statut: string;
  anneeEcheance: number;
  copro: {
    id: string;
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    primeActuelle: number | null;
    dateEcheance: Date | null;
    gestionnaireEmail: string | null;
  };
  taskCompletions: Array<{ taskId: string; task: { required: boolean; statut: string } }>;
};

type TaskTemplate = {
  id: string;
  statut: string;
  label: string;
  shortLabel: string | null;
  actionType: string | null;
  required: boolean;
  order: number;
};

const ACTION_BADGE: Record<string, { className: string }> = {
  email:     { className: "bg-[#F5F5FF] text-[#4E49FC]" },
  document:  { className: "bg-[#F5F5FF] text-[#4E49FC]" },
  waiting:   { className: "bg-[#F7F7F8] text-[#656576]" },
  signature: { className: "bg-[#EFFBF2] text-[#13762C]" },
  update:    { className: "bg-[#F2F9FD] text-[#206E92]" },
  other:     { className: "bg-[#F7F7F8] text-[#656576]" },
};

interface PipelineBoardProps {
  pipelines: PipelineWithCopro[];
  taskTemplates: TaskTemplate[];
  gestionnaires: string[];
}

function getNextAction(pipeline: PipelineWithCopro, taskTemplates: TaskTemplate[]): { label: string; shortLabel: string; actionType: string } | null {
  const completedIds = new Set(pipeline.taskCompletions.map((tc) => tc.taskId));
  const stepTasks = taskTemplates
    .filter((t) => t.statut === pipeline.statut)
    .sort((a, b) => a.order - b.order);
  const nextTask = stepTasks.find((t) => !completedIds.has(t.id));
  if (nextTask) return {
    label: nextTask.label,
    shortLabel: nextTask.shortLabel || nextTask.label,
    actionType: nextTask.actionType || "other",
  };
  const step = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
  const idx = PIPELINE_STEPS.indexOf(step!);
  const nextStep = PIPELINE_STEPS[idx + 1];
  return nextStep ? { label: `Passer à : ${nextStep.label}`, shortLabel: `→ ${nextStep.label}`, actionType: "other" } : null;
}

const STATUT_BADGE: Record<string, { label: string; className: string }> = {
  identifie:     { label: "Aucune action",       className: "bg-[#F7F7F8] text-[#656576]" },
  rs_en_cours:   { label: "RS en cours",         className: "bg-[#F5F5FF] text-[#4E49FC]" },
  devis_demandes:{ label: "Devis demandés",      className: "bg-[#F5F5FF] text-[#4E49FC]" },
  devis_recus:   { label: "Devis partagés",      className: "bg-[#F5F5FF] text-[#4E49FC]" },
  envoye_cs:     { label: "Devis validé",        className: "bg-[#FFF7EB] text-[#955804]" },
  contrat_signe: { label: "Contrat signé",       className: "bg-[#13762C] text-white" },
  termine:       { label: "Duomo OK",            className: "bg-[#EFFBF2] text-[#13762C]" },
  abandonne:     { label: "Abandonné",           className: "bg-[#FFF5F5] text-[#CA1E12]" },
  refuse:        { label: "Refus client",        className: "bg-[#FFF5F5] text-[#CA1E12]" },
  non_assurable: { label: "Non assurable",       className: "bg-[#FFF5F5] text-[#CA1E12]" },
};

function GestionnaireCombobox({
  gestionnaires,
  value,
  onChange,
}: {
  gestionnaires: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value !== "all" ? value : null;
  const displayName = selected ? formatGestionnaire(selected) : "";

  const filtered = gestionnaires.filter((g) => {
    const q = query.toLowerCase();
    return formatGestionnaire(g).toLowerCase().includes(q) || g.toLowerCase().includes(q);
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(g: string) {
    onChange(g);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange("all");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center border rounded-lg bg-white overflow-hidden focus-within:ring-2" style={{ borderColor: "#E8E8EC", "--tw-ring-color": "#8784FD" } as React.CSSProperties}>
        <input
          type="text"
          placeholder="Gestionnaire…"
          value={open ? query : displayName}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="text-sm px-3 py-1.5 bg-transparent outline-none w-44"
          style={{ color: "#26262C" }}
        />
        {selected && (
          <button onClick={clear} className="pr-2" style={{ color: "#A2A1AF" }}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 w-56 bg-white rounded-lg shadow-lg py-1 max-h-52 overflow-y-auto border" style={{ borderColor: "#E8E8EC" }}>
          {filtered.map((g) => (
            <button
              key={g}
              onMouseDown={(e) => { e.preventDefault(); select(g); }}
              className={cn("w-full text-left px-3 py-2 text-sm transition-colors")}
              style={value === g ? { backgroundColor: "#F5F5FF", color: "#4E49FC", fontWeight: 500 } : { color: "#26262C" }}
              onMouseEnter={e => { if (value !== g) (e.target as HTMLElement).style.backgroundColor = "#F7F7F8"; }}
              onMouseLeave={e => { if (value !== g) (e.target as HTMLElement).style.backgroundColor = ""; }}
            >
              {formatGestionnaire(g)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SortKey = "nom" | "echeance" | "statut" | "assureur";

function formatGestionnaire(email: string): string {
  const prenom = email.split(".")[0];
  const nom = email.split(".")[1]?.split("@")[0];
  return prenom && nom
    ? `${prenom.charAt(0).toUpperCase() + prenom.slice(1)} ${nom.charAt(0).toUpperCase() + nom.slice(1)}`
    : email.split("@")[0];
}

export function PipelineBoard({ pipelines, taskTemplates, gestionnaires }: PipelineBoardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("echeance");
  const [sortAsc, setSortAsc] = useState(true);
  const [view, setView] = useState<"actions" | "kanban">("actions");
  const [selectedGestionnaire, setSelectedGestionnaire] = useState<string>("all");
  const [gestionnaireQuery, setGestionnaireQuery] = useState("");
  const [selectedStatut, setSelectedStatut] = useState<string>("all");
  const [selectedEcheance, setSelectedEcheance] = useState<string>("all");
  const [selectedAssureur, setSelectedAssureur] = useState<string>("all");

  const assureurs = [...new Set(pipelines.map((p) => p.copro.assureurActuel).filter(Boolean) as string[])].sort();

  const hasActiveFilters = selectedGestionnaire !== "all" || selectedStatut !== "all" || selectedEcheance !== "all" || selectedAssureur !== "all";

  const filtered = pipelines.filter((p) => {
    if (selectedGestionnaire !== "all" && p.copro.gestionnaireEmail !== selectedGestionnaire) return false;
    if (selectedStatut !== "all" && p.statut !== selectedStatut) return false;
    if (selectedAssureur !== "all" && p.copro.assureurActuel !== selectedAssureur) return false;

    if (selectedEcheance !== "all") {
      const days = getDaysUntilEcheance(p.copro.dateEcheance);
      if (selectedEcheance === "overdue" && (days === null || days >= 0)) return false;
      if (selectedEcheance === "urgent" && (days === null || days < 0 || days > 60)) return false;
      if (selectedEcheance === "warning" && (days === null || days <= 60 || days > 120)) return false;
      if (selectedEcheance === "ok" && (days === null || days <= 120)) return false;
    }
    return true;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = 0;
    let vb: string | number = 0;
    if (sortKey === "echeance") {
      va = a.copro.dateEcheance ? new Date(a.copro.dateEcheance).getTime() : Infinity;
      vb = b.copro.dateEcheance ? new Date(b.copro.dateEcheance).getTime() : Infinity;
    } else if (sortKey === "nom") {
      va = a.copro.nom.toLowerCase();
      vb = b.copro.nom.toLowerCase();
    } else if (sortKey === "statut") {
      va = a.statut;
      vb = b.statut;
    } else if (sortKey === "assureur") {
      va = a.copro.assureurActuel?.toLowerCase() || "";
      vb = b.copro.assureurActuel?.toLowerCase() || "";
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const urgent = filtered.filter((p) => {
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    return d !== null && d <= 60;
  }).length;

  const dealsGagnes = filtered.filter((p) => p.statut === "contrat_signe" || p.statut === "termine").length;

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid #E8E8EC" }}>
          <div className="text-2xl font-bold" style={{ color: "#26262C" }}>{pipelines.length}</div>
          <div className="text-sm mt-0.5" style={{ color: "#656576" }}>Copros en cours</div>
        </div>
        <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid #E8E8EC" }}>
          <div className="text-2xl font-bold" style={{ color: "#CA1E12" }}>{urgent}</div>
          <div className="text-sm mt-0.5" style={{ color: "#656576" }}>Échéance &lt; 2 mois</div>
        </div>
        <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid #E8E8EC" }}>
          <div className="text-2xl font-bold" style={{ color: "#13762C" }}>{dealsGagnes}</div>
          <div className="text-sm mt-0.5" style={{ color: "#656576" }}>Deals gagnés</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <GestionnaireCombobox
          gestionnaires={gestionnaires}
          value={selectedGestionnaire}
          onChange={setSelectedGestionnaire}
        />
        <select
          value={selectedStatut}
          onChange={(e) => setSelectedStatut(e.target.value)}
          className="text-sm rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ border: "1px solid #E8E8EC", color: "#26262C" } as React.CSSProperties}
        >
          <option value="all">Toutes les étapes</option>
          {PIPELINE_STEPS.map((s) => (
            <option key={s.statut} value={s.statut}>{s.label}</option>
          ))}
        </select>
        <select
          value={selectedEcheance}
          onChange={(e) => setSelectedEcheance(e.target.value)}
          className="text-sm rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ border: "1px solid #E8E8EC", color: "#26262C" } as React.CSSProperties}
        >
          <option value="all">Toutes les échéances</option>
          <option value="overdue">Dépassées</option>
          <option value="urgent">{"< 2 mois"}</option>
          <option value="warning">2 à 4 mois</option>
          <option value="ok">{"> 4 mois"}</option>
        </select>
        <select
          value={selectedAssureur}
          onChange={(e) => setSelectedAssureur(e.target.value)}
          className="text-sm rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2" style={{ border: "1px solid #E8E8EC", color: "#26262C" } as React.CSSProperties}
        >
          <option value="all">Tous les assureurs</option>
          {assureurs.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => { setSelectedGestionnaire("all"); setSelectedStatut("all"); setSelectedEcheance("all"); setSelectedAssureur("all"); }}
            className="text-xs underline" style={{ color: "#A2A1AF" }}
          >
            Réinitialiser les filtres
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: "#A2A1AF" }}>{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        {(["actions", "kanban"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={view === v ? { backgroundColor: "#26262C", color: "#FFFFFF" } : { color: "#656576" }}>
            {v === "actions" ? "Actions à faire" : "Par étape"}
          </button>
        ))}
      </div>

      {pipelines.length === 0 ? (
        <div className="text-center py-20" style={{ color: "#A2A1AF" }}>
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Aucune copropriété dans votre pipeline.</p>
          <p className="text-xs mt-1">Les données sont synchronisées chaque nuit depuis Omni.</p>
        </div>
      ) : view === "actions" ? (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E8E8EC" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #E8E8EC", backgroundColor: "#F7F7F8" }}>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide cursor-pointer select-none font-medium" style={{ color: "#656576" }} onClick={() => toggleSort("nom")}>
                  Copropriété <SortIcon k="nom" />
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide cursor-pointer select-none font-medium" style={{ color: "#656576" }} onClick={() => toggleSort("statut")}>
                  Étape <SortIcon k="statut" />
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "#656576" }}>
                  Prochaine action
                </th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide cursor-pointer select-none font-medium" style={{ color: "#656576" }} onClick={() => toggleSort("assureur")}>
                  Assureur <SortIcon k="assureur" />
                </th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wide cursor-pointer select-none font-medium" style={{ color: "#656576" }} onClick={() => toggleSort("echeance")}>
                  Date échéance <SortIcon k="echeance" />
                </th>
                <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "#656576" }}>
                  J-
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pipeline) => {
                const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);
                const urgence = getUrgenceBadge(days);
                const nextAction = getNextAction(pipeline, taskTemplates);
                const badge = STATUT_BADGE[pipeline.statut];

                return (
                  <tr key={pipeline.id}
                    className="transition-colors cursor-pointer group"
                    style={{ borderTop: "1px solid #F7F7F8" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F7F7F8")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                    onClick={() => window.location.href = `/pipeline/${pipeline.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium group-hover:underline truncate max-w-48" style={{ color: "#4E49FC" }}>
                        {pipeline.copro.nom}
                      </div>
                      {pipeline.copro.adresse && (
                        <div className="text-xs truncate max-w-48 mt-0.5" style={{ color: "#A2A1AF" }}>
                          {pipeline.copro.adresse}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", badge?.className)}>
                        {badge?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {nextAction && (
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                          ACTION_BADGE[nextAction.actionType]?.className || ACTION_BADGE.other.className
                        )}>
                          {nextAction.shortLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pipeline.copro.assureurActuel ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#F7F7F8", color: "#656576" }}>
                          {pipeline.copro.assureurActuel}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "#A2A1AF" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm" style={{ color: "#656576" }}>
                      {pipeline.copro.dateEcheance
                        ? new Date(pipeline.copro.dateEcheance).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : <span style={{ color: "#A2A1AF" }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {days !== null ? (
                        <span className="text-sm font-medium" style={{
                          color: urgence === "overdue" ? "#CA1E12" : urgence === "urgent" ? "#955804" : urgence === "warning" ? "#955804" : "#A2A1AF"
                        }}>
                          {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                        </span>
                      ) : <span style={{ color: "#A2A1AF" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // Kanban
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STEPS.filter((s) => s.statut !== "termine").map((step) => {
            const items = filtered.filter((p) => p.statut === step.statut);
            return (
              <div key={step.statut} className="min-w-52 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#656576" }}>{step.shortLabel}</span>
                  {items.length > 0 && <span className="text-xs rounded-full px-1.5 py-0.5" style={{ backgroundColor: "#E8E8EC", color: "#656576" }}>{items.length}</span>}
                </div>
                <div className="space-y-2">
                  {items.map((p) => {
                    const days = getDaysUntilEcheance(p.copro.dateEcheance);
                    const urgence = getUrgenceBadge(days);
                    const nextAction = getNextAction(p, taskTemplates);
                    const leftColor = urgence === "overdue" ? "#CA1E12" : urgence === "urgent" ? "#955804" : urgence === "warning" ? "#955804" : "#E8E8EC";
                    return (
                      <Link key={p.id} href={`/pipeline/${p.id}`}>
                        <div className="bg-white rounded-xl p-3 hover:shadow-sm transition-shadow cursor-pointer border-l-4"
                          style={{ border: `1px solid #E8E8EC`, borderLeft: `4px solid ${leftColor}` }}>
                          <div className="font-medium text-sm truncate" style={{ color: "#4E49FC" }}>{p.copro.nom}</div>
                          {nextAction && (
                            <span className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-1",
                              ACTION_BADGE[nextAction.actionType]?.className || ACTION_BADGE.other.className
                            )}>
                              {nextAction.shortLabel}
                            </span>
                          )}
                          {days !== null && (
                            <div className="text-xs font-medium mt-1" style={{ color: leftColor === "#E8E8EC" ? "#A2A1AF" : leftColor }}>
                              {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="rounded-xl p-3 text-center text-xs border border-dashed" style={{ backgroundColor: "#F7F7F8", borderColor: "#E8E8EC", color: "#A2A1AF" }}>Vide</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
