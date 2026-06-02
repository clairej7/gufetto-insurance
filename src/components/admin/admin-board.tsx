"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PIPELINE_STEPS, getDaysUntilEcheance, getUrgenceBadge } from "@/lib/pipeline";
import { Building2, Calendar, Euro, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Pipeline = {
  id: string;
  statut: string;
  copro: {
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    primeActuelle: number | null;
    dateEcheance: Date | null;
    gestionnaireEmail: string | null;
  };
  taskCompletions: Array<{ taskId: string; task: { required: boolean; statut: string } }>;
};

interface AdminBoardProps {
  pipelines: Pipeline[];
  taskTemplates: Array<{ id: string; statut: string; required: boolean }>;
  gestionnaires: string[];
}

export function AdminBoard({ pipelines, taskTemplates, gestionnaires }: AdminBoardProps) {
  const [selectedGestionnaire, setSelectedGestionnaire] = useState<string>("all");

  const filtered =
    selectedGestionnaire === "all"
      ? pipelines
      : pipelines.filter((p) => p.copro.gestionnaireEmail === selectedGestionnaire);

  // Stats per step
  const statsByStep = PIPELINE_STEPS.filter(
    (s) => s.statut !== "termine"
  ).map((step) => ({
    step,
    count: filtered.filter((p) => p.statut === step.statut).length,
  }));

  const urgent = filtered.filter((p) => {
    const d = getDaysUntilEcheance(p.copro.dateEcheance);
    return d !== null && d <= 60;
  }).length;

  return (
    <div>
      {/* Gestionnaire filter */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setSelectedGestionnaire("all")}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
            selectedGestionnaire === "all"
              ? "bg-gray-900 text-white border-gray-900"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
        >
          Tous ({pipelines.length})
        </button>
        {gestionnaires.map((g) => {
          const count = pipelines.filter((p) => p.copro.gestionnaireEmail === g).length;
          return (
            <button
              key={g}
              onClick={() => setSelectedGestionnaire(g)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                selectedGestionnaire === g
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              {g.split("@")[0]} ({count})
            </button>
          );
        })}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold">{filtered.length}</div>
          <div className="text-xs text-gray-500">Total en cours</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{urgent}</div>
          <div className="text-xs text-gray-500">Échéance &lt; 2 mois</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">
            {filtered.filter((p) => p.statut === "contrat_signe" || p.statut === "termine").length}
          </div>
          <div className="text-xs text-gray-500">Deals gagnés</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-orange-600">
            {filtered.filter((p) => p.statut === "rs_en_cours").length}
          </div>
          <div className="text-xs text-gray-500">Attente RS</div>
        </div>
      </div>

      {/* Funnel view */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Répartition par étape</h3>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {statsByStep.map(({ step, count }) => (
            <div key={step.statut} className="text-center">
              <div
                className={cn(
                  "text-2xl font-bold",
                  count > 0 ? "text-gray-900" : "text-gray-200"
                )}
              >
                {count}
              </div>
              <div className="text-xs text-gray-400 leading-tight mt-0.5">{step.shortLabel}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune copropriété</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((pipeline) => {
            const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);
            const urgence = getUrgenceBadge(days);
            const step = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
            const stepTasks = taskTemplates.filter(
              (t) => t.statut === pipeline.statut && t.required
            );
            const completed = pipeline.taskCompletions.filter(
              (tc) => tc.task.required && tc.task.statut === pipeline.statut
            ).length;

            const urgenceColors = {
              overdue: "border-l-4 border-l-red-400",
              urgent: "border-l-4 border-l-orange-400",
              warning: "border-l-4 border-l-yellow-400",
              ok: "border-l-4 border-l-gray-200",
            };

            return (
              <Link key={pipeline.id} href={`/pipeline/${pipeline.id}`}>
                <Card
                  className={cn(
                    "p-3 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-4",
                    urgenceColors[urgence]
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {pipeline.copro.nom}
                      </span>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {step?.shortLabel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{pipeline.copro.gestionnaireEmail?.split("@")[0]}</span>
                      {pipeline.copro.assureurActuel && (
                        <span>{pipeline.copro.assureurActuel}</span>
                      )}
                      {pipeline.copro.primeActuelle && (
                        <span className="flex items-center gap-0.5">
                          <Euro className="h-3 w-3" />
                          {pipeline.copro.primeActuelle.toLocaleString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {stepTasks.length > 0 && (
                      <div
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          completed === stepTasks.length ? "text-green-600" : "text-gray-400"
                        )}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {completed}/{stepTasks.length}
                      </div>
                    )}
                    {days !== null && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-xs font-medium",
                          urgence === "overdue" && "text-red-600",
                          urgence === "urgent" && "text-orange-600",
                          urgence === "warning" && "text-yellow-600",
                          urgence === "ok" && "text-gray-500"
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
