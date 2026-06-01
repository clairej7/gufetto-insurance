"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PIPELINE_STEPS, getDaysUntilEcheance, getUrgenceBadge } from "@/lib/pipeline";
import { Building2, Calendar, Euro, ChevronRight, ArrowRight } from "lucide-react";
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
  // All tasks done — next step label
  const step = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
  return step ? `Passer à : ${PIPELINE_STEPS[PIPELINE_STEPS.indexOf(step) + 1]?.label || "Terminé"}` : null;
}

export function PipelineBoard({ pipelines, taskTemplates }: PipelineBoardProps) {
  const [view, setView] = useState<"actions" | "kanban">("actions");

  // Sort by urgency (closest deadline first, null at end)
  const sorted = [...pipelines].sort((a, b) => {
    const da = a.copro.dateEcheance ? new Date(a.copro.dateEcheance).getTime() : Infinity;
    const db = b.copro.dateEcheance ? new Date(b.copro.dateEcheance).getTime() : Infinity;
    return da - db;
  });

  const urgent = pipelines.filter((p) => {
    const days = getDaysUntilEcheance(p.copro.dateEcheance);
    return days !== null && days <= 60;
  }).length;

  const enAttente = pipelines.filter((p) =>
    ["validation_cs"].includes(p.statut)
  ).length;

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-900">{pipelines.length}</div>
          <div className="text-sm text-gray-500">Copros en cours</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{urgent}</div>
          <div className="text-sm text-gray-500">Échéance &lt; 2 mois</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-orange-500">{enAttente}</div>
          <div className="text-sm text-gray-500">En attente CS</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView("actions")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            view === "actions" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
          )}
        >
          Actions à faire
        </button>
        <button
          onClick={() => setView("kanban")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            view === "kanban" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
          )}
        >
          Par étape
        </button>
      </div>

      {pipelines.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune copropriété dans votre pipeline.</p>
          <p className="text-xs mt-1">Les données sont synchronisées chaque nuit depuis Omni.</p>
        </div>
      ) : view === "actions" ? (
        <ActionsView pipelines={sorted} taskTemplates={taskTemplates} />
      ) : (
        <KanbanView pipelines={pipelines} taskTemplates={taskTemplates} />
      )}
    </div>
  );
}

function ActionsView({
  pipelines,
  taskTemplates,
}: {
  pipelines: PipelineWithCopro[];
  taskTemplates: TaskTemplate[];
}) {
  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <span>Copropriété</span>
        <span className="w-48 hidden md:block">Prochaine action</span>
        <span className="w-20 text-right">Assureur</span>
        <span className="w-16 text-right">Échéance</span>
      </div>

      {pipelines.map((pipeline) => {
        const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);
        const urgence = getUrgenceBadge(days);
        const nextAction = getNextAction(pipeline, taskTemplates);
        const step = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);

        const urgenceBorder = {
          overdue: "border-l-4 border-l-red-500",
          urgent: "border-l-4 border-l-orange-400",
          warning: "border-l-4 border-l-yellow-400",
          ok: "border-l-4 border-l-transparent",
        };

        return (
          <Link key={pipeline.id} href={`/pipeline/${pipeline.id}`}>
            <Card
              className={cn(
                "px-4 py-3 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-4",
                urgenceBorder[urgence]
              )}
            >
              {/* Nom + étape */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 text-sm truncate">
                  {pipeline.copro.nom}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs py-0">
                    {step?.shortLabel}
                  </Badge>
                  {nextAction && (
                    <span className="text-xs text-gray-500 flex items-center gap-1 truncate md:hidden">
                      <ArrowRight className="h-3 w-3 flex-shrink-0" />
                      {nextAction}
                    </span>
                  )}
                </div>
              </div>

              {/* Prochaine action (desktop) */}
              {nextAction && (
                <div className="hidden md:flex items-center gap-1 w-48 flex-shrink-0">
                  <ArrowRight className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-xs text-gray-600 truncate">{nextAction}</span>
                </div>
              )}

              {/* Assureur */}
              <div className="w-20 text-right flex-shrink-0">
                {pipeline.copro.assureurActuel ? (
                  <span className="text-xs text-gray-500 truncate block">
                    {pipeline.copro.assureurActuel}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>

              {/* Échéance */}
              <div className="w-16 text-right flex-shrink-0">
                {days !== null ? (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      urgence === "overdue" && "text-red-600",
                      urgence === "urgent" && "text-orange-600",
                      urgence === "warning" && "text-yellow-600",
                      urgence === "ok" && "text-gray-400"
                    )}
                  >
                    {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>

              <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function KanbanView({
  pipelines,
  taskTemplates,
}: {
  pipelines: PipelineWithCopro[];
  taskTemplates: TaskTemplate[];
}) {
  const ACTIVE_STEPS = PIPELINE_STEPS.filter((s) => s.statut !== "termine" && s.statut !== "abandonne");

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {ACTIVE_STEPS.map((step) => {
        const items = pipelines.filter((p) => p.statut === step.statut);
        return (
          <div key={step.statut} className="min-w-56 flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {step.shortLabel}
              </h2>
              {items.length > 0 && (
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              )}
            </div>
            <div className="space-y-2">
              {items.map((pipeline) => {
                const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);
                const urgence = getUrgenceBadge(days);
                const nextAction = getNextAction(pipeline, taskTemplates);
                return (
                  <Link key={pipeline.id} href={`/pipeline/${pipeline.id}`}>
                    <Card className={cn(
                      "p-3 hover:shadow-sm cursor-pointer border-l-4",
                      urgence === "overdue" && "border-l-red-500",
                      urgence === "urgent" && "border-l-orange-400",
                      urgence === "warning" && "border-l-yellow-400",
                      urgence === "ok" && "border-l-transparent",
                    )}>
                      <div className="font-medium text-sm text-gray-900 truncate">{pipeline.copro.nom}</div>
                      {nextAction && (
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1 truncate">
                          <ArrowRight className="h-3 w-3 flex-shrink-0" />
                          {nextAction}
                        </div>
                      )}
                      {days !== null && (
                        <div className={cn(
                          "text-xs font-medium mt-1 flex items-center gap-1",
                          urgence === "overdue" && "text-red-600",
                          urgence === "urgent" && "text-orange-600",
                          urgence === "warning" && "text-yellow-600",
                          urgence === "ok" && "text-gray-400"
                        )}>
                          <Calendar className="h-3 w-3" />
                          {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                        </div>
                      )}
                    </Card>
                  </Link>
                );
              })}
              {items.length === 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-center text-xs text-gray-300">
                  Vide
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
