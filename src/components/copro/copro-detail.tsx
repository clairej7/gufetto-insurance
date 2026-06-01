"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Mail,
  User,
  ChevronRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { PIPELINE_STEPS, getDaysUntilEcheance, getNextStatut } from "@/lib/pipeline";
import { advanceStatut, abandonPipeline, toggleTask, addNote } from "@/lib/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Pipeline = {
  id: string;
  statut: string;
  anneeEcheance: number;
  notes: string | null;
  copro: {
    nom: string;
    adresse: string | null;
    buildingId: string;
    assureurActuel: string | null;
    courtierActuel: string | null;
    primeActuelle: number | null;
    dateEcheance: Date | null;
    dateDebutContrat: Date | null;
    contactCsEmail: string | null;
    contactCsNom: string | null;
    gestionnaireEmail: string | null;
  };
  taskCompletions: Array<{
    taskId: string;
    completedBy: string;
    completedAt: Date;
    note: string | null;
    task: { id: string; label: string; required: boolean; statut: string };
  }>;
  events: Array<{
    id: string;
    type: string;
    ancienStatut: string | null;
    nouveauStatut: string | null;
    description: string;
    createdBy: string;
    createdAt: Date;
  }>;
};

type TaskTemplate = {
  id: string;
  statut: string;
  label: string;
  shortLabel: string | null;
  description: string | null;
  required: boolean;
  order: number;
};

interface CoproDetailProps {
  pipeline: Pipeline;
  taskTemplates: TaskTemplate[];
  userEmail: string;
}

function getEcheanceColor(days: number | null): string {
  if (days === null) return "text-gray-400";
  if (days < 0) return "text-red-600";
  if (days <= 60) return "text-red-600";
  if (days <= 180) return "text-orange-500";
  return "text-green-600";
}

function getEcheanceBg(days: number | null): string {
  if (days === null) return "bg-gray-50 border-gray-200";
  if (days < 0) return "bg-red-50 border-red-200";
  if (days <= 60) return "bg-red-50 border-red-200";
  if (days <= 180) return "bg-orange-50 border-orange-200";
  return "bg-green-50 border-green-200";
}

export function CoproDetail({ pipeline, taskTemplates, userEmail }: CoproDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [abandonRaison, setAbandonRaison] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showAllTasks, setShowAllTasks] = useState(false);

  const currentStep = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.statut === pipeline.statut);
  const nextStatut = getNextStatut(pipeline.statut as Parameters<typeof getNextStatut>[0]);
  const nextStep = nextStatut ? PIPELINE_STEPS.find((s) => s.statut === nextStatut) : null;

  const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);

  const currentStepTasks = taskTemplates
    .filter((t) => t.statut === pipeline.statut)
    .sort((a, b) => a.order - b.order);

  const completedTaskIds = new Set(pipeline.taskCompletions.map((tc) => tc.taskId));
  const requiredTasks = currentStepTasks.filter((t) => t.required);
  const completedRequired = requiredTasks.filter((t) => completedTaskIds.has(t.id));
  const allRequiredDone = completedRequired.length === requiredTasks.length;
  const nextTask = currentStepTasks.find((t) => !completedTaskIds.has(t.id));

  const isTerminal = pipeline.statut === "termine" || pipeline.statut === "abandonne";

  function handleToggleTask(taskId: string) {
    startTransition(async () => {
      const result = await toggleTask(pipeline.id, taskId);
      if (!result.success) toast.error("Erreur lors de la mise à jour");
    });
  }

  function handleAdvance(force = false) {
    startTransition(async () => {
      const result = await advanceStatut(pipeline.id, force, advanceNote);
      if (result.success) {
        toast.success("Étape avancée !");
        setShowAdvanceDialog(false);
        setAdvanceNote("");
      } else {
        toast.error(result.error || "Erreur");
      }
    });
  }

  function handleAbandon() {
    if (!abandonRaison.trim()) { toast.error("Veuillez indiquer une raison"); return; }
    startTransition(async () => {
      await abandonPipeline(pipeline.id, abandonRaison);
      toast.success("Pipeline abandonné");
      setShowAbandonDialog(false);
    });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    startTransition(async () => {
      await addNote(pipeline.id, noteText);
      setNoteText("");
      toast.success("Note ajoutée");
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/pipeline" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3">
          <ArrowLeft className="h-4 w-4" />
          Retour au pipeline
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{pipeline.copro.nom}</h1>
            {pipeline.copro.adresse && (
              <p className="text-sm text-gray-500 mt-0.5">{pipeline.copro.adresse}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pipeline.statut === "abandonne" ? (
              <Badge variant="destructive">Abandonné</Badge>
            ) : pipeline.statut === "termine" ? (
              <Badge className="bg-green-100 text-green-700">Terminé ✓</Badge>
            ) : (
              <Badge variant="secondary">{currentStep?.label} — étape {currentStepIndex + 1}/{PIPELINE_STEPS.length - 1}</Badge>
            )}
          </div>
        </div>

        {!isTerminal && (
          <div className="mt-4">
            <StepProgressBar
              steps={PIPELINE_STEPS.filter((s) => s.statut !== "termine" && s.statut !== "abandonne")}
              currentStatut={pipeline.statut}
            />
          </div>
        )}
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Col 1: infos */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Contrat actuel
            </h3>
            <dl className="space-y-2">
              <InfoRow label="Assureur" value={pipeline.copro.assureurActuel} />
              <InfoRow label="Courtier" value={pipeline.copro.courtierActuel} />
              <InfoRow label="Prime annuelle" value={pipeline.copro.primeActuelle ? `${pipeline.copro.primeActuelle.toLocaleString("fr-FR")} €` : null} />
              <InfoRow label="Début contrat" value={pipeline.copro.dateDebutContrat ? new Date(pipeline.copro.dateDebutContrat).toLocaleDateString("fr-FR") : null} />
            </dl>
          </Card>

          <Card className={cn("p-4 border", getEcheanceBg(days))}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Échéance
            </h3>
            <div className={cn("text-lg font-bold", getEcheanceColor(days))}>
              {pipeline.copro.dateEcheance
                ? new Date(pipeline.copro.dateEcheance).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
                : "Non renseignée"}
            </div>
            {days !== null && (
              <div className={cn("text-sm font-medium mt-1", getEcheanceColor(days))}>
                {days < 0 ? `Échue il y a ${Math.abs(days)} jours` : `Dans ${days} jours`}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Conseil Syndical
            </h3>
            <dl className="space-y-2">
              <InfoRow label="Nom" value={pipeline.copro.contactCsNom} />
              <div>
                <dt className="text-xs text-gray-500">Email</dt>
                {pipeline.copro.contactCsEmail ? (
                  <a href={`mailto:${pipeline.copro.contactCsEmail}`} className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-0.5">
                    <Mail className="h-3 w-3" />
                    {pipeline.copro.contactCsEmail}
                  </a>
                ) : (
                  <dd className="text-sm text-gray-400 italic">Non renseigné</dd>
                )}
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Infos copropriété
            </h3>
            <div className="text-xs text-gray-500 space-y-1">
              <div>ID Duomo : <span className="font-mono text-gray-700">{pipeline.copro.buildingId}</span></div>
              <div>Gestionnaire : <span className="text-gray-700">{pipeline.copro.gestionnaireEmail?.split("@")[0] || "—"}</span></div>
            </div>
          </Card>
        </div>

        {/* Col 2: action centrale */}
        <div className="space-y-4">
          {isTerminal ? (
            <Card className="p-8 text-center">
              {pipeline.statut === "termine" ? (
                <>
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-gray-800">Processus terminé</p>
                  <p className="text-sm text-gray-400 mt-1">Nouveau contrat actif</p>
                </>
              ) : (
                <>
                  <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
                  <p className="font-semibold text-gray-700">Pipeline abandonné</p>
                </>
              )}
            </Card>
          ) : (
            <>
              {/* Prochaine action mise en avant */}
              <Card className="p-5">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Prochaine action
                </div>
                {nextTask ? (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 leading-snug">{nextTask.label}</p>
                      {nextTask.description && (
                        <p className="text-xs text-gray-400 mt-1">{nextTask.description}</p>
                      )}
                      <button
                        onClick={() => handleToggleTask(nextTask.id)}
                        disabled={isPending}
                        className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Marquer comme fait
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Toutes les tâches sont faites</span>
                  </div>
                )}
              </Card>

              {/* Checklist complète (repliable) */}
              {currentStepTasks.length > 0 && (
                <Card className="p-4">
                  <button
                    onClick={() => setShowAllTasks(!showAllTasks)}
                    className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    <span>
                      Toutes les tâches
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {completedRequired.length}/{requiredTasks.length} obligatoires
                      </span>
                    </span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform", showAllTasks && "rotate-90")} />
                  </button>

                  {showAllTasks && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-gray-100">
                      {currentStepTasks.map((task) => {
                        const isCompleted = completedTaskIds.has(task.id);
                        const completion = pipeline.taskCompletions.find((tc) => tc.taskId === task.id);
                        return (
                          <div key={task.id} className="flex items-start gap-3">
                            <Checkbox
                              checked={isCompleted}
                              onCheckedChange={() => handleToggleTask(task.id)}
                              disabled={isPending}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <span className={cn("text-sm", isCompleted && "line-through text-gray-400")}>
                                {task.label}
                                {task.required && !isCompleted && <span className="ml-1 text-red-400 text-xs">★</span>}
                              </span>
                              {isCompleted && completion && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {new Date(completion.completedAt).toLocaleDateString("fr-FR")}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              )}

              {/* Bouton avancer */}
              {nextStep && (
                <Card className="p-4 space-y-3">
                  <Button
                    onClick={() => allRequiredDone ? handleAdvance(false) : setShowAdvanceDialog(true)}
                    disabled={isPending}
                    className="w-full"
                    size="lg"
                  >
                    Passer à : {nextStep.label}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowAbandonDialog(true)}
                    disabled={isPending}
                    className="w-full text-red-400 hover:text-red-600 hover:bg-red-50 text-sm"
                  >
                    Abandonner ce pipeline
                  </Button>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Col 3: notes + historique */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Ajouter une note
            </h3>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Écrire une note..."
              className="text-sm min-h-20"
            />
            <Button size="sm" className="mt-2 w-full" onClick={handleAddNote} disabled={isPending || !noteText.trim()}>
              Ajouter
            </Button>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Historique
            </h3>
            {pipeline.events.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Aucun événement</p>
            ) : (
              <div className="space-y-3">
                {pipeline.events.map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <EventIcon type={event.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 leading-snug">{event.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {event.createdBy.split("@")[0]} · {new Date(event.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandonner ce pipeline</DialogTitle>
            <DialogDescription>Indiquez la raison de l&apos;abandon.</DialogDescription>
          </DialogHeader>
          <Textarea value={abandonRaison} onChange={(e) => setAbandonRaison(e.target.value)} placeholder="Raison..." className="min-h-24" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowAbandonDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleAbandon} disabled={isPending}>Confirmer</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passer à l&apos;étape suivante</DialogTitle>
            <DialogDescription>
              {requiredTasks.length - completedRequired.length > 0
                ? `${requiredTasks.length - completedRequired.length} tâche(s) obligatoire(s) non cochées. Vous pouvez forcer le passage.`
                : "Confirmez le passage."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="Note (optionnelle)..." className="min-h-20" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowAdvanceDialog(false)}>Annuler</Button>
            <Button onClick={() => handleAdvance(true)} disabled={isPending}>Forcer le passage</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={cn("text-sm", value ? "text-gray-900" : "text-gray-400 italic")}>{value || "Non renseigné"}</dd>
    </div>
  );
}

function StepProgressBar({ steps, currentStatut }: { steps: typeof PIPELINE_STEPS; currentStatut: string }) {
  const currentIdx = steps.findIndex((s) => s.statut === currentStatut);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, idx) => (
        <div key={step.statut} className="flex items-center gap-1 flex-shrink-0">
          <div className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
            idx < currentIdx && "bg-green-100 text-green-700",
            idx === currentIdx && "bg-blue-600 text-white",
            idx > currentIdx && "bg-gray-100 text-gray-400"
          )}>
            {idx < currentIdx && <CheckCircle2 className="h-3 w-3" />}
            {step.shortLabel}
          </div>
          {idx < steps.length - 1 && <ChevronRight className="h-3 w-3 text-gray-200 flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5 flex-shrink-0 mt-0.5";
  switch (type) {
    case "statut_change": return <ChevronRight className={cn(cls, "text-blue-400")} />;
    case "tache_completee": return <CheckCircle2 className={cn(cls, "text-green-500")} />;
    case "note_ajoutee": return <MessageSquare className={cn(cls, "text-gray-400")} />;
    default: return <Clock className={cn(cls, "text-gray-400")} />;
  }
}
