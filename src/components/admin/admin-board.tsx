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
              ? "text-white"
              : "border-[#E8E8EC] text-[#656576] hover:bg-[#F7F7F8]"
          )}
          style={
            selectedGestionnaire === "all"
              ? { backgroundColor: "#26262C", borderColor: "#26262C" }
              : undefined
          }
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
                  ? "text-white"
                  : "border-[#E8E8EC] text-[#656576] hover:bg-[#F7F7F8]"
              )}
              style={
                selectedGestionnaire === g
                  ? { backgroundColor: "#4E49FC", borderColor: "#4E49FC" }
                  : undefined
              }
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
          <div className="text-xs text-[#656576]">Total en cours</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-[#CA1E12]">{urgent}</div>
          <div className="text-xs text-[#656576]">Échéance &lt; 2 mois</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-[#4E49FC]">
            {filtered.filter((p) => p.statut === "contrat_signe" || p.statut === "termine").length}
          </div>
          <div className="text-xs text-[#656576]">Deals gagnés</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-[#955804]">
            {filtered.filter((p) => p.statut === "rs_en_cours").length}
          </div>
          <div className="text-xs text-[#656576]">Attente RS</div>
        </div>
      </div>

      {/* Funnel view */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="text-sm font-semibold text-[#26262C] mb-4">Répartition par étape</h3>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {statsByStep.map(({ step, count }) => (
            <div key={step.statut} className="text-center">
              <div
                className={cn(
                  "text-2xl font-bold",
                  count > 0 ? "text-[#26262C]" : "text-[#A2A1AF]"
                )}
              >
                {count}
              </div>
              <div className="text-xs text-[#A2A1AF] leading-tight mt-0.5">{step.shortLabel}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[#A2A1AF]">
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

            const urgenceBorderColor = {
              overdue: "#CA1E12",
              urgent: "#955804",
              warning: "#955804",
              ok: "#E8E8EC",
            };

            return (
              <Link key={pipeline.id} href={`/pipeline/${pipeline.id}`}>
                <Card
                  className="p-3 hover:shadow-sm transition-shadow cursor-pointer flex items-center gap-4"
                  style={{ borderLeft: `4px solid ${urgenceBorderColor[urgence]}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#26262C] truncate">
                        {pipeline.copro.nom}
                      </span>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {step?.shortLabel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#656576]">
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
                          completed === stepTasks.length ? "text-[#13762C]" : "text-[#A2A1AF]"
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
                          urgence === "overdue" && "text-[#CA1E12]",
                          urgence === "urgent" && "text-[#955804]",
                          urgence === "warning" && "text-[#955804]",
                          urgence === "ok" && "text-[#656576]"
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {days < 0 ? `+${Math.abs(days)}j` : `J-${days}`}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-[#A2A1AF]" />
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
