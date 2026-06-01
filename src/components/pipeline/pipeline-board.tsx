"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_STEPS, getDaysUntilEcheance, getUrgenceBadge } from "@/lib/pipeline";
import { Building2, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
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
  required: boolean;
  order: number;
};

interface PipelineBoardProps {
  pipelines: PipelineWithCopro[];
  taskTemplates: TaskTemplate[];
}

function getNextAction(pipeline: PipelineWithCopro, taskTemplates: TaskTemplate[]): string | null {
  const completedIds = new Set(pipeline.taskCompletions.map((tc) => tc.taskId));
  const stepTasks = taskTemplates
    .filter((t) => t.statut === pipeline.statut)
    .sort((a, b) => a.order - b.order);
  const nextTask = stepTasks.find((t) => !completedIds.has(t.id));
  if (nextTask) return nextTask.label;
  const step = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
  const idx = PIPELINE_STEPS.indexOf(step!);
  return PIPELINE_STEPS[idx + 1] ? `Passer à : ${PIPELINE_STEPS[idx + 1].label}` : null;
}

const STATUT_BADGE: Record<string, { label: string; className: string }> = {
  identifie:           { label: "Identifié",       className: "bg-gray-100 text-gray-600" },
  rs_en_cours:         { label: "RS en cours",     className: "bg-blue-100 text-blue-700" },
  rs_recu:             { label: "RS reçu",         className: "bg-blue-100 text-blue-700" },
  devis_demandes:      { label: "Devis demandés",  className: "bg-purple-100 text-purple-700" },
  devis_recus:         { label: "Devis reçus",     className: "bg-purple-100 text-purple-700" },
  envoye_cs:           { label: "Envoyé CS",       className: "bg-yellow-100 text-yellow-700" },
  validation_cs:       { label: "Attente CS",      className: "bg-orange-100 text-orange-700" },
  contrat_signe:       { label: "Signé",           className: "bg-green-100 text-green-700" },
  resiliation_envoyee: { label: "Résiliation",     className: "bg-green-100 text-green-700" },
  sepa_complete:       { label: "SEPA fait",       className: "bg-green-100 text-green-700" },
  termine:             { label: "Terminé ✓",       className: "bg-green-200 text-green-800" },
  abandonne:           { label: "Abandonné",       className: "bg-red-100 text-red-600" },
};

type SortKey = "nom" | "echeance" | "statut" | "assureur";

export function PipelineBoard({ pipelines, taskTemplates }: PipelineBoardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("echeance");
  const [sortAsc, setSortAsc] = useState(true);
  const [view, setView] = useState<"actions" | "kanban">("actions");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = [...pipelines].sort((a, b) => {
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

  const urgent = pipelines.filter((p) => {
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    return d !== null && d <= 60;
  }).length;

  const enAttente = pipelines.filter((p) => p.statut === "validation_cs").length;

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{pipelines.length}</div>
          <div className="text-sm text-gray-500 mt-0.5">Copros en cours</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-red-600">{urgent}</div>
          <div className="text-sm text-gray-500 mt-0.5">Échéance &lt; 2 mois</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-2xl font-bold text-orange-500">{enAttente}</div>
          <div className="text-sm text-gray-500 mt-0.5">En attente CS</div>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        {(["actions", "kanban"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              view === v ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
            )}>
            {v === "actions" ? "Actions à faire" : "Par étape"}
          </button>
        ))}
      </div>

      {pipelines.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Aucune copropriété dans votre pipeline.</p>
          <p className="text-xs mt-1">Les données sont synchronisées chaque nuit depuis Omni.</p>
        </div>
      ) : view === "actions" ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort("nom")}>
                  Copropriété <SortIcon k="nom" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort("statut")}>
                  Étape <SortIcon k="statut" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Prochaine action
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort("assureur")}>
                  Assureur <SortIcon k="assureur" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Prime
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => toggleSort("echeance")}>
                  Échéance <SortIcon k="echeance" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((pipeline) => {
                const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);
                const urgence = getUrgenceBadge(days);
                const nextAction = getNextAction(pipeline, taskTemplates);
                const badge = STATUT_BADGE[pipeline.statut];

                return (
                  <tr key={pipeline.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => window.location.href = `/pipeline/${pipeline.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-blue-600 group-hover:underline truncate max-w-48">
                        {pipeline.copro.nom}
                      </div>
                      {pipeline.copro.adresse && (
                        <div className="text-xs text-gray-400 truncate max-w-48 mt-0.5">
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
                        <div className="flex items-center gap-1.5 text-gray-600 max-w-56">
                          <ArrowRight className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                          <span className="text-xs truncate">{nextAction}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {pipeline.copro.assureurActuel ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {pipeline.copro.assureurActuel}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pipeline.copro.primeActuelle
                        ? `${pipeline.copro.primeActuelle.toLocaleString("fr-FR")} €`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {days !== null ? (
                        <span className={cn("text-sm font-medium",
                          urgence === "overdue" && "text-red-600",
                          urgence === "urgent" && "text-orange-500",
                          urgence === "warning" && "text-yellow-600",
                          urgence === "ok" && "text-gray-500"
                        )}>
                          {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
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
          {PIPELINE_STEPS.filter((s) => s.statut !== "termine" && s.statut !== "abandonne").map((step) => {
            const items = pipelines.filter((p) => p.statut === step.statut);
            return (
              <div key={step.statut} className="min-w-52 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{step.shortLabel}</span>
                  {items.length > 0 && <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">{items.length}</span>}
                </div>
                <div className="space-y-2">
                  {items.map((p) => {
                    const days = getDaysUntilEcheance(p.copro.dateEcheance);
                    const urgence = getUrgenceBadge(days);
                    const nextAction = getNextAction(p, taskTemplates);
                    return (
                      <Link key={p.id} href={`/pipeline/${p.id}`}>
                        <div className={cn("bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer border-l-4",
                          urgence === "overdue" && "border-l-red-500",
                          urgence === "urgent" && "border-l-orange-400",
                          urgence === "warning" && "border-l-yellow-400",
                          urgence === "ok" && "border-l-gray-200",
                        )}>
                          <div className="font-medium text-sm text-blue-600 truncate">{p.copro.nom}</div>
                          {nextAction && (
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1 truncate">
                              <ArrowRight className="h-3 w-3 flex-shrink-0" />
                              {nextAction}
                            </div>
                          )}
                          {days !== null && (
                            <div className={cn("text-xs font-medium mt-1",
                              urgence === "overdue" && "text-red-600",
                              urgence === "urgent" && "text-orange-500",
                              urgence === "warning" && "text-yellow-600",
                              urgence === "ok" && "text-gray-400"
                            )}>
                              {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3 text-center text-xs text-gray-300">Vide</div>
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
