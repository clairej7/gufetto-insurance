"use client";

import { useState, useTransition, useRef, useEffect } from "react";
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
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  MessageSquare,
  XCircle,
  ArrowRight,
  Pencil,
  Trash2,
  X,
  Check,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { PIPELINE_STEPS, getDaysUntilEcheance, getNextStatut, isTerminalStatut } from "@/lib/pipeline";
import { RSRequestAction } from "@/components/copro/steps/rs-request-action";
import { DevisRequestAction } from "@/components/copro/steps/devis-request-action";
import { DevisRecusAction } from "@/components/copro/steps/devis-recus-action";
import { ContratSigneAction } from "@/components/copro/steps/contrat-signe-action";
import { ResiliationAction } from "@/components/copro/steps/resiliation-action";
import { advanceStatut, abandonPipeline, toggleTask, addNote, deleteNote, editNote, goBackStatut, goToStatut, marquerRefus, marquerNonAssurable, updateCoproCaracteristiques, getPdfSignedUrl, saveSignedPdfUrl, toggleTermineTask } from "@/lib/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Pipeline = {
  id: string;
  coproId: string;
  statut: string;
  anneeEcheance: number;
  notes: string | null;
  copro: {
    nom: string;
    adresse: string | null;
    buildingId: string;
    assureurActuel: string | null;
    numeroContrat: string | null;
    courtierActuel: string | null;
    primeActuelle: number | null;
    dateEcheance: Date | null;
    dateDebutContrat: Date | null;
    contactCsEmail: string | null;
    contactCsNom: string | null;
    gestionnaireEmail: string | null;
    contactCourtierEmail: string | null;
    contactCourtierTel: string | null;
    surfaceDeveloppee: number | null;
    periodeConstruction: string | null;
    natureOccupation: string | null;
    activitesAggravantes: string | null;
    caracteristiquesParticulieres: string | null;
    proportionInoccupee: string | null;
    protectionJuridique: string | null;
    assureursDevis: string | null;
    representantLegal: string | null;
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
    metadata?: unknown;
  }>;
  contratActuelData: string | null;
  signedPdfUrl: string | null;
  nouveauNumeroContrat: string | null;
  nouveauDateEffet: Date | null;
  nouveauPrimeTTC: number | null;
  devisRecus: Array<{
    id: string;
    assureur: string;
    numeroContrat: string | null;
    primeTTC: number;
    data: string | null;
    notes: string | null;
    pdfName: string | null;
    pdfUrl: string | null;
    recommande: boolean;
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
  if (days === null) return "text-[#A2A1AF]";
  if (days < 0) return "text-[#CA1E12]";
  if (days <= 60) return "text-[#CA1E12]";
  if (days <= 180) return "text-[#955804]";
  return "text-[#13762C]";
}

function getEcheanceBg(days: number | null): { className: string; style: React.CSSProperties } {
  if (days === null) return { className: "border", style: { backgroundColor: "#F7F7F8", borderColor: "#E8E8EC" } };
  if (days < 0) return { className: "border", style: { backgroundColor: "#FFF5F5", borderColor: "#FFF5F5" } };
  if (days <= 60) return { className: "border", style: { backgroundColor: "#FFF5F5", borderColor: "#FFF5F5" } };
  if (days <= 180) return { className: "border", style: { backgroundColor: "#FFF7EB", borderColor: "#F5C97A" } };
  return { className: "border", style: { backgroundColor: "#EFFBF2", borderColor: "#BBF1C8" } };
}

const PERIODE_LABELS: Record<string, string> = {
  avant_1950: "Avant 1950",
  "1950_1970": "De 1950 à 1970",
  "1970_1985": "De 1970 à 1985",
  "1985_2000": "De 1985 à 2000",
  apres_2000: "Après 2000",
  inconnue: "Inconnue",
};

const OCCUPATION_LABELS: Record<string, string> = {
  habitation: "Habitation uniquement",
  mixte: "Mixte (habitation et professionnelle)",
  professionnelle: "Professionnelle uniquement",
};

const INOCCUPEE_LABELS: Record<string, string> = {
  moins_25: "Moins de 25%",
  "25_50": "Entre 25% et 50%",
  "50_75": "Entre 50% et 75%",
  plus_75: "Plus de 75%",
};

const ACTIVITES_AGGRAVANTES_OPTIONS = [
  "Restaurant",
  "Boulangerie / Pâtisserie",
  "Discothèque / Bar de nuit / Bar avec piste de danse",
  "Pizzeria avec four à bois",
  "Kebab",
  "Travail du bois",
  "Activités industrielles & agricoles",
  "Activités de transformation de produits",
  "Activités de recherche et développement",
  "Station essence",
  "Ambassade ou Consulat",
  "Aucune",
];

const CARACTERISTIQUES_PARTICULIERES_OPTIONS = [
  "Présence d'amiante",
  "Ossature / façade / parement en bois (> 10%)",
  "Arrêté de péril en cours",
  "Monument historique",
  "Logements sociaux ou HLM",
  "Immeuble squatté",
  "Immeuble en cours de construction ou démolition",
  "Aucune",
];

function parseMultiField(val: string | null): { checked: string[]; autre: string } {
  if (!val) return { checked: [], autre: "" };
  try {
    const arr: string[] = JSON.parse(val);
    const checked = arr.filter(v => ACTIVITES_AGGRAVANTES_OPTIONS.includes(v) || CARACTERISTIQUES_PARTICULIERES_OPTIONS.includes(v));
    const autre = arr.filter(v => !ACTIVITES_AGGRAVANTES_OPTIONS.includes(v) && !CARACTERISTIQUES_PARTICULIERES_OPTIONS.includes(v)).join(", ");
    return { checked, autre };
  } catch {
    return { checked: [], autre: val };
  }
}

function serializeMultiField(checked: string[], autre: string): string | null {
  const all = [...checked, ...(autre.trim() ? [autre.trim()] : [])];
  return all.length > 0 ? JSON.stringify(all) : null;
}

function NoteItem({
  event,
  pipelineId,
  onDelete,
  onEdit,
}: {
  event: { id: string; description: string; createdBy: string; createdAt: Date };
  pipelineId: string;
  onDelete: (pipelineId: string, eventId: string) => Promise<unknown>;
  onEdit: (pipelineId: string, eventId: string, text: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(event.description);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await onEdit(pipelineId, event.id, text);
      setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await onDelete(pipelineId, event.id);
    });
  }

  return (
    <div className="rounded-md p-2.5 border" style={{ backgroundColor: "#FFF7EB", borderColor: "#F5C97A" }}>
      {editing ? (
        <div className="space-y-1.5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="text-xs min-h-16 bg-white"
            autoFocus
          />
          <div className="flex gap-1.5 justify-end">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setText(event.description); setEditing(false); }}>
              <X className="h-3 w-3" />
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={isPending || !text.trim()}>
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs leading-snug" style={{ color: "#26262C" }}>{event.description}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs" style={{ color: "#A2A1AF" }}>
              {event.createdBy.split("@")[0]} · {new Date(event.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
            <div className="flex gap-1">
              <button onClick={() => setEditing(true)} className="transition-colors" style={{ color: "#A2A1AF" }}>
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={handleDelete} disabled={isPending} className="transition-colors" style={{ color: "#A2A1AF" }}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type RecoEvent = {
  id: string;
  createdAt: Date;
  metadata?: unknown;
};

function RecoSentBlock({
  events,
  pipelineId,
}: {
  events: RecoEvent[];
  pipelineId: string;
}) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isPending, startTransition] = useTransition();

  const latest = events[0];
  const previous = events.slice(1);
  const meta = latest?.metadata as { to?: string; subject?: string; body?: string } | null;

  const fmtDate = (d: Date) => new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  if (!latest || !meta) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium flex-wrap" style={{ color: "#13762C" }}>
        <CheckCircle2 className="h-4 w-4" />
        Envoyé à <span style={{ color: "#26262C" }}>{meta.to}</span>
        <span className="font-normal" style={{ color: "#A2A1AF" }}>· {fmtDate(latest.createdAt)}</span>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium"
        style={{ color: "#8784FD" }}
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? "Masquer l'email" : "Voir l'email envoyé"}
      </button>

      {open && (
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: "#A2A1AF" }}>Objet : {meta.subject}</p>
          <div
            className="rounded-xl border p-3 text-xs leading-relaxed whitespace-pre-wrap"
            style={{ borderColor: "#E8E8EC", color: "#656576", background: "#FAFAFA" }}
          >
            {meta.body}
          </div>
        </div>
      )}

      {previous.length > 0 && (
        <button
          onClick={() => setShowHistory(true)}
          className="text-xs flex items-center gap-1"
          style={{ color: "#A2A1AF" }}
        >
          <Clock className="h-3 w-3" />
          {previous.length} envoi{previous.length > 1 ? "s" : ""} précédent{previous.length > 1 ? "s" : ""}
        </button>
      )}

      <div className="pt-1 border-t" style={{ borderColor: "#E8E8EC" }}>
        <p className="text-xs mb-2" style={{ color: "#A2A1AF" }}>
          Le CS souhaite comparer d&apos;autres devis ?
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startTransition(async () => {
            await goBackStatut(pipelineId);
            toast.success("Retour à : Devis partagés");
          })}
          disabled={isPending}
          className="w-full flex items-center gap-2 text-sm"
          style={{ color: "#656576" }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Recommencer la comparaison
        </Button>
      </div>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historique des envois</DialogTitle>
            <DialogDescription>Tous les emails de recommandation envoyés pour ce dossier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {events.map((ev, i) => {
              const m = ev.metadata as { to?: string; subject?: string } | null;
              return (
                <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: "#E8E8EC" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {i === 0 && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EFFBF2", color: "#13762C" }}>
                          Dernier
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "#A2A1AF" }}>{fmtDate(ev.createdAt)}</span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: "#26262C" }}>À : {m?.to ?? "—"}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "#A2A1AF" }}>{m?.subject ?? "—"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CoproDetail({ pipeline, taskTemplates, userEmail }: CoproDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [abandonRaison, setAbandonRaison] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showRefusDialog, setShowRefusDialog] = useState(false);
  const [showNonAssurableDialog, setShowNonAssurableDialog] = useState(false);
  const [refusNote, setRefusNote] = useState("");
  const [nonAssurableNote, setNonAssurableNote] = useState("");
  const [historiqueOpen, setHistoriqueOpen] = useState(false);
  const [dealPerduOpen, setDealPerduOpen] = useState(false);
  const dealPerduRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dealPerduRef.current && !dealPerduRef.current.contains(e.target as Node)) {
        setDealPerduOpen(false);
      }
    }
    if (dealPerduOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dealPerduOpen]);
  const [showSignerDialog, setShowSignerDialog] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null | undefined>(undefined);
  const [isSigning, setIsSigning] = useState(false);
  const [signedPdfPath, setSignedPdfPath] = useState<string | null>(null);
  const [showContratDialog, setShowContratDialog] = useState(false);
  const [contratForm, setContratForm] = useState({
    assureurActuel: pipeline.copro.assureurActuel ?? "",
    courtierActuel: pipeline.copro.courtierActuel ?? "",
    numeroContrat: pipeline.copro.numeroContrat ?? "",
    primeActuelle: pipeline.copro.primeActuelle?.toString() ?? "",
    dateDebutContrat: pipeline.copro.dateDebutContrat ? new Date(pipeline.copro.dateDebutContrat).toISOString().split("T")[0] : "",
    contactCourtierEmail: pipeline.copro.contactCourtierEmail ?? "",
    contactCourtierTel: pipeline.copro.contactCourtierTel ?? "",
  });

  useEffect(() => {
    if (showContratDialog) {
      setContratForm({
        assureurActuel: pipeline.copro.assureurActuel ?? "",
        courtierActuel: pipeline.copro.courtierActuel ?? "",
        numeroContrat: pipeline.copro.numeroContrat ?? "",
        primeActuelle: pipeline.copro.primeActuelle?.toString() ?? "",
        dateDebutContrat: pipeline.copro.dateDebutContrat ? new Date(pipeline.copro.dateDebutContrat).toISOString().split("T")[0] : "",
        contactCourtierEmail: pipeline.copro.contactCourtierEmail ?? "",
        contactCourtierTel: pipeline.copro.contactCourtierTel ?? "",
      });
    }
  }, [showContratDialog]);

  const [showCaracDialog, setShowCaracDialog] = useState(false);
  const [activitesChecked, setActivitesChecked] = useState<string[]>([]);
  const [activitesAutre, setActivitesAutre] = useState("");
  const [caracsChecked, setCaracsChecked] = useState<string[]>([]);
  const [caracsAutre, setCaracsAutre] = useState("");
  const [caracForm, setCaracForm] = useState({
    surfaceDeveloppee: pipeline.copro.surfaceDeveloppee?.toString() ?? "",
    periodeConstruction: pipeline.copro.periodeConstruction ?? "",
    natureOccupation: pipeline.copro.natureOccupation ?? "",
    activitesAggravantes: pipeline.copro.activitesAggravantes ?? "",
    caracteristiquesParticulieres: pipeline.copro.caracteristiquesParticulieres ?? "",
    proportionInoccupee: pipeline.copro.proportionInoccupee ?? "",
    representantLegal: pipeline.copro.representantLegal ?? "",
  });

  useEffect(() => {
    if (showCaracDialog) {
      const activitesParsed = parseMultiField(pipeline.copro.activitesAggravantes);
      const caracsParsed = parseMultiField(pipeline.copro.caracteristiquesParticulieres);
      setActivitesChecked(activitesParsed.checked);
      setActivitesAutre(activitesParsed.autre);
      setCaracsChecked(caracsParsed.checked);
      setCaracsAutre(caracsParsed.autre);
      setCaracForm({
        surfaceDeveloppee: pipeline.copro.surfaceDeveloppee?.toString() ?? "",
        periodeConstruction: pipeline.copro.periodeConstruction ?? "",
        natureOccupation: pipeline.copro.natureOccupation ?? "",
        activitesAggravantes: pipeline.copro.activitesAggravantes ?? "",
        caracteristiquesParticulieres: pipeline.copro.caracteristiquesParticulieres ?? "",
        proportionInoccupee: pipeline.copro.proportionInoccupee ?? "",
        representantLegal: pipeline.copro.representantLegal ?? "",
      });
    }
  }, [showCaracDialog]);

  const currentStep = PIPELINE_STEPS.find((s) => s.statut === pipeline.statut);
  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.statut === pipeline.statut);
  const nextStatut = getNextStatut(pipeline.statut as Parameters<typeof getNextStatut>[0]);
  const nextStep = nextStatut ? PIPELINE_STEPS.find((s) => s.statut === nextStatut) : null;
  const prevStep = currentStepIndex > 0 ? PIPELINE_STEPS[currentStepIndex - 1] : null;

  const days = getDaysUntilEcheance(pipeline.copro.dateEcheance);

  const currentStepTasks = taskTemplates
    .filter((t) => t.statut === pipeline.statut)
    .sort((a, b) => a.order - b.order);

  const completedTaskIds = new Set(pipeline.taskCompletions.map((tc) => tc.taskId));
  const requiredTasks = currentStepTasks.filter((t) => t.required);
  const completedRequired = requiredTasks.filter((t) => completedTaskIds.has(t.id));
  const allRequiredDone = completedRequired.length === requiredTasks.length;
  const nextTask = currentStepTasks.find((t) => !completedTaskIds.has(t.id));

  const isTerminal = isTerminalStatut(pipeline.statut);
  const isWon = pipeline.statut === "contrat_signe" || pipeline.statut === "termine";
  const isLost = pipeline.statut === "refuse" || pipeline.statut === "non_assurable" || pipeline.statut === "abandonne";

  // Étape où le deal a été perdu (pour affichage du stepper)
  const lostAtStatut = isLost
    ? pipeline.events.find(
        (e) => e.type === "statut_change" && e.ancienStatut &&
          !["refuse", "non_assurable", "abandonne"].includes(e.ancienStatut)
      )?.ancienStatut ?? null
    : null;

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

  function handleRefus() {
    startTransition(async () => {
      await marquerRefus(pipeline.id, refusNote || undefined);
      toast.success("Deal marqué comme perdu — Refus client");
      setShowRefusDialog(false);
      setRefusNote("");
    });
  }

  function handleNonAssurable() {
    startTransition(async () => {
      await marquerNonAssurable(pipeline.id, nonAssurableNote || undefined);
      toast.success("Deal marqué comme perdu — Non assurable");
      setShowNonAssurableDialog(false);
      setNonAssurableNote("");
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

  const echeanceBg = getEcheanceBg(days);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/pipeline" className="flex items-center gap-1 text-sm mb-3 hover:opacity-80" style={{ color: "#A2A1AF" }}>
          <ArrowLeft className="h-4 w-4" />
          Retour au pipeline
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#26262C" }}>{pipeline.copro.nom}</h1>
            {pipeline.copro.adresse && (
              <p className="text-sm mt-0.5" style={{ color: "#656576" }}>{pipeline.copro.adresse}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pipeline.statut === "refuse" ? (
              <Badge variant="destructive">Deal perdu — Refus client</Badge>
            ) : pipeline.statut === "non_assurable" ? (
              <Badge variant="destructive">Deal perdu — Non assurable</Badge>
            ) : pipeline.statut === "abandonne" ? (
              <Badge variant="destructive">Abandonné</Badge>
            ) : pipeline.statut === "termine" ? (
              <Badge className="border" style={{ backgroundColor: "#EFFBF2", color: "#13762C", borderColor: "#BBF1C8" }}>Contrat mis à jour dans Duomo ✓</Badge>
            ) : pipeline.statut === "contrat_signe" ? (
              <Badge style={{ backgroundColor: "#13762C", color: "#ffffff" }}>Deal gagné — Contrat signé 🎉</Badge>
            ) : (
              <Badge variant="secondary">{currentStep?.label} — étape {currentStepIndex + 1}/{PIPELINE_STEPS.length - 1}</Badge>
            )}
          </div>
        </div>

        {(!isTerminal || isLost || pipeline.statut === "termine") && (
          <div className="mt-4">
            <StepProgressBar
              steps={PIPELINE_STEPS.filter((s) => s.statut !== "termine" && s.statut !== "abandonne")}
              currentStatut={lostAtStatut ?? (pipeline.statut === "termine" ? "contrat_signe" : pipeline.statut)}
              lost={isLost}
              onStepClick={(statut) => startTransition(async () => { await goToStatut(pipeline.id, statut); })}
            />
          </div>
        )}
      </div>

      {/* Comparateur pleine largeur — étape devis_recus uniquement */}
      {pipeline.statut === "devis_recus" && (
        <div className="space-y-4 mb-6">
          <Card className="p-6">
            <DevisRecusAction
              pipelineId={pipeline.id}
              devisRecus={pipeline.devisRecus}
              contratActuelData={pipeline.contratActuelData}
              copro={{
                nom: pipeline.copro.nom,
                adresse: pipeline.copro.adresse,
                assureurActuel: pipeline.copro.assureurActuel,
                primeActuelle: pipeline.copro.primeActuelle,
                courtierActuel: pipeline.copro.courtierActuel,
                contactCsEmail: pipeline.copro.contactCsEmail,
                contactCsNom: pipeline.copro.contactCsNom,
                gestionnaireEmail: pipeline.copro.gestionnaireEmail,
              }}
            />
          </Card>
          <Card className="p-4 space-y-3">
            {nextStep && (
              <Button
                onClick={() => allRequiredDone ? handleAdvance(false) : setShowAdvanceDialog(true)}
                disabled={isPending}
                className="w-full"
                size="lg"
              >
                Passer à : {nextStep.label}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {prevStep && (
              <Button
                variant="outline"
                onClick={() => startTransition(async () => { await goBackStatut(pipeline.id); toast.success(`Retour à : ${prevStep.label}`); })}
                disabled={isPending}
                className="w-full"
                style={{ color: "#656576" }}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Revenir à : {prevStep.label}
              </Button>
            )}
          </Card>
        </div>
      )}

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Col 1: Contrat actuel (toujours visible) + Infos copro (masqué pour devis_recus qui a sa propre col) */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#26262C" }}>
                <Building2 className="h-4 w-4" />
                Contrat actuel
              </h3>
              <button onClick={() => setShowContratDialog(true)} className="transition-colors" style={{ color: "#A2A1AF" }}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <dl className="space-y-2">
              <InfoRow label="Assureur" value={pipeline.copro.assureurActuel} />
              <InfoRow label="N° de contrat" value={pipeline.copro.numeroContrat} />
              <InfoRow label="Courtier" value={pipeline.copro.courtierActuel} />
              <InfoRow label="Prime annuelle" value={pipeline.copro.primeActuelle ? `${pipeline.copro.primeActuelle.toLocaleString("fr-FR")} €` : null} />
              <InfoRow label="Début contrat" value={pipeline.copro.dateDebutContrat ? new Date(pipeline.copro.dateDebutContrat).toLocaleDateString("fr-FR") : null} />
              <InfoRow label="Mail courtier/assureur" value={pipeline.copro.contactCourtierEmail} />
              <InfoRow label="N° téléphone courtier/assureur" value={pipeline.copro.contactCourtierTel} />
            </dl>
          </Card>

          {pipeline.statut !== "devis_recus" && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#26262C" }}>
                  <Building2 className="h-4 w-4" />
                  Infos copropriété
                </h3>
                <button onClick={() => setShowCaracDialog(true)} className="transition-colors" style={{ color: "#A2A1AF" }}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <dl className="space-y-2">
                <InfoRow label="Surface développée" value={pipeline.copro.surfaceDeveloppee ? `${pipeline.copro.surfaceDeveloppee} m²` : null} />
                <InfoRow label="Période de construction" value={PERIODE_LABELS[pipeline.copro.periodeConstruction ?? ""] ?? null} />
                <InfoRow label="Nature de l'occupation" value={OCCUPATION_LABELS[pipeline.copro.natureOccupation ?? ""] ?? null} />
                <InfoRow label="Activités aggravantes" value={pipeline.copro.activitesAggravantes} />
                <InfoRow label="Caractéristiques particulières" value={pipeline.copro.caracteristiquesParticulieres} />
                <InfoRow label="Logements inoccupés" value={INOCCUPEE_LABELS[pipeline.copro.proportionInoccupee ?? ""] ?? null} />
                <InfoRow label="Représentant légal" value={pipeline.copro.representantLegal} />
              </dl>
            </Card>
          )}
        </div>

        {/* Col 2: action centrale */}
        <div className="space-y-4">
          {(() => {
            const FINALE_TASKS = [
              { key: "update_duomo_contrat", label: "Va dans \"Mes contrats\" et mets à jour le nouveau contrat d'assurance" },
              { key: "mandat_prelevement", label: "Remplis le mandat de prélèvement pour le nouveau contrat MRI" },
            ];
            const doneKeys = new Set(
              pipeline.events
                .map(e => (e.metadata as Record<string, unknown> | null)?.termineTask as string | undefined)
                .filter(Boolean)
            );
            const allDone = FINALE_TASKS.every(t => doneKeys.has(t.key));
            return isTerminal ? (
              pipeline.statut === "termine" ? (
              <div className="space-y-4">
                {/* Données du nouveau contrat */}
                {(pipeline.nouveauNumeroContrat || pipeline.nouveauDateEffet || pipeline.nouveauPrimeTTC) && (
                  <Card className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#A2A1AF" }}>Nouveau contrat</p>
                    <dl className="space-y-2">
                      {pipeline.nouveauNumeroContrat && (
                        <div className="flex justify-between items-center">
                          <dt className="text-xs" style={{ color: "#A2A1AF" }}>N° de contrat</dt>
                          <dd className="text-sm font-semibold" style={{ color: "#26262C" }}>{pipeline.nouveauNumeroContrat}</dd>
                        </div>
                      )}
                      {pipeline.nouveauDateEffet && (
                        <div className="flex justify-between items-center">
                          <dt className="text-xs" style={{ color: "#A2A1AF" }}>Date d&apos;effet</dt>
                          <dd className="text-sm font-semibold" style={{ color: "#26262C" }}>{new Date(pipeline.nouveauDateEffet).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</dd>
                        </div>
                      )}
                      {pipeline.nouveauPrimeTTC && (
                        <div className="flex justify-between items-center">
                          <dt className="text-xs" style={{ color: "#A2A1AF" }}>Prime TTC</dt>
                          <dd className="text-sm font-semibold" style={{ color: "#26262C" }}>{pipeline.nouveauPrimeTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</dd>
                        </div>
                      )}
                    </dl>
                  </Card>
                )}

                {/* Checklist finale */}
                <Card className="p-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>Dernières actions avant clôture</p>
                  {FINALE_TASKS.map((task) => {
                    const done = doneKeys.has(task.key);
                    return (
                      <button
                        key={task.key}
                        disabled={isPending}
                        onClick={() => startTransition(async () => { await toggleTermineTask(pipeline.id, task.key, !done); })}
                        className="flex items-start gap-3 w-full text-left group"
                      >
                        <div className={cn(
                          "mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
                          done ? "border-[#13762C] bg-[#13762C]" : "border-[#D0CFDB] group-hover:border-[#4E49FC]"
                        )}>
                          {done && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <p className={cn("text-sm transition-colors", done ? "line-through" : "")} style={{ color: done ? "#A2A1AF" : "#26262C" }}>
                          {task.label}
                        </p>
                      </button>
                    );
                  })}
                </Card>

                {/* Célébration — uniquement quand tout est coché */}
                {allDone && (
                  <Card className="p-6 text-center border-2" style={{ borderColor: "#BBF1C8", backgroundColor: "#EFFBF2" }}>
                    <div className="text-4xl mb-2">🎉</div>
                    <p className="text-lg font-bold" style={{ color: "#13762C" }}>Bravo, dossier bouclé !</p>
                  </Card>
                )}

                <Button variant="outline" size="sm" className="w-full" disabled={isPending} onClick={() => startTransition(async () => { await goBackStatut(pipeline.id); })}>
                  Revenir en arrière
                </Button>
              </div>
            ) : (
            <Card className={cn("p-8 text-center border-2",
              (pipeline.statut === "refuse" || pipeline.statut === "non_assurable" || pipeline.statut === "abandonne") && "border-[#FFF5F5] bg-[#FFF5F5]"
            )}>
              {pipeline.statut === "refuse" ? (
                <>
                  <XCircle className="h-12 w-12 mx-auto mb-3" style={{ color: "#CA1E12" }} />
                  <p className="font-semibold" style={{ color: "#26262C" }}>Deal perdu — Refus client</p>
                  <p className="text-sm mt-1" style={{ color: "#A2A1AF" }}>Le copropriétaire a refusé le changement</p>
                  <Button variant="outline" size="sm" className="mt-4" disabled={isPending} onClick={() => startTransition(async () => { await goBackStatut(pipeline.id); })}>
                    Revenir en arrière
                  </Button>
                </>
              ) : pipeline.statut === "non_assurable" ? (
                <>
                  <XCircle className="h-12 w-12 mx-auto mb-3" style={{ color: "#CA1E12" }} />
                  <p className="font-semibold" style={{ color: "#26262C" }}>Deal perdu — Non assurable</p>
                  <p className="text-sm mt-1" style={{ color: "#A2A1AF" }}>La copropriété ne peut pas être assurée par nos partenaires</p>
                  <Button variant="outline" size="sm" className="mt-4" disabled={isPending} onClick={() => startTransition(async () => { await goBackStatut(pipeline.id); })}>
                    Revenir en arrière
                  </Button>
                </>
              ) : (
                <>
                  <XCircle className="h-12 w-12 mx-auto mb-3" style={{ color: "#CA1E12" }} />
                  <p className="font-semibold" style={{ color: "#26262C" }}>Pipeline abandonné</p>
                  <Button variant="outline" size="sm" className="mt-4" disabled={isPending} onClick={() => startTransition(async () => { await goBackStatut(pipeline.id); })}>
                    Revenir en arrière
                  </Button>
                </>
              )}
            </Card>
            )
            ) : null;
          })()}
          {!isTerminal && (
            <>
              {/* Infos copropriété (pour devis_recus, col 1 ne la montre pas) */}
              {pipeline.statut === "devis_recus" && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#26262C" }}>
                      <Building2 className="h-4 w-4" />
                      Infos copropriété
                    </h3>
                    <button onClick={() => setShowCaracDialog(true)} className="transition-colors" style={{ color: "#A2A1AF" }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <dl className="space-y-2">
                    <InfoRow label="Surface développée" value={pipeline.copro.surfaceDeveloppee ? `${pipeline.copro.surfaceDeveloppee} m²` : null} />
                    <InfoRow label="Période de construction" value={PERIODE_LABELS[pipeline.copro.periodeConstruction ?? ""] ?? null} />
                    <InfoRow label="Nature de l'occupation" value={OCCUPATION_LABELS[pipeline.copro.natureOccupation ?? ""] ?? null} />
                    <InfoRow label="Activités aggravantes" value={pipeline.copro.activitesAggravantes} />
                    <InfoRow label="Caractéristiques particulières" value={pipeline.copro.caracteristiquesParticulieres} />
                    <InfoRow label="Logements inoccupés" value={INOCCUPEE_LABELS[pipeline.copro.proportionInoccupee ?? ""] ?? null} />
                    <InfoRow label="Représentant légal" value={pipeline.copro.representantLegal} />
                  </dl>
                </Card>
              )}

              {/* Action spécifique à l'étape */}
              {pipeline.statut === "rs_en_cours" && (
                <Card className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "#A2A1AF" }}>
                    Demande de relevé de sinistralité
                  </div>
                  <RSRequestAction
                    pipelineId={pipeline.id}
                    copro={pipeline.copro}
                    rsEvents={[...pipeline.events]
                      .reverse()
                      .filter((e) => {
                        const m = e.metadata;
                        if (!m || typeof m !== "object") return false;
                        const meta = m as Record<string, unknown>;
                        return (
                          meta.rsType === "draft_sent" ||
                          meta.rsType === "appel_courtier_task"
                        );
                      })}
                  />
                </Card>
              )}

              {pipeline.statut === "devis_demandes" && (
                <Card className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: "#A2A1AF" }}>
                    Demande de devis
                  </div>
                  <DevisRequestAction
                    key={[
                      pipeline.copro.surfaceDeveloppee,
                      pipeline.copro.periodeConstruction,
                      pipeline.copro.natureOccupation,
                      pipeline.copro.activitesAggravantes,
                      pipeline.copro.caracteristiquesParticulieres,
                      pipeline.copro.proportionInoccupee,
                      pipeline.copro.assureurActuel,
                      pipeline.copro.primeActuelle,
                      pipeline.copro.protectionJuridique,
                      pipeline.copro.assureursDevis,
                    ].join("|")}
                    pipelineId={pipeline.id}
                    coproId={pipeline.coproId}
                    devisEvents={pipeline.events.filter(e => {
                      const m = e.metadata as Record<string, unknown> | null;
                      return m?.devisType === "devis_sent";
                    })}
                    copro={pipeline.copro}
                  />
                </Card>
              )}


              {pipeline.statut === "envoye_cs" && (() => {
                const recoEvents = pipeline.events.filter(e => {
                  const m = e.metadata as Record<string, unknown> | null;
                  return m?.recoType === "reco_sent";
                });
                return (
                  <Card className="p-5 space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
                      Recommandation envoyée au CS
                    </div>
                    {recoEvents.length > 0 && (
                      <RecoSentBlock
                        events={recoEvents}
                        pipelineId={pipeline.id}
                      />
                    )}
                  </Card>
                );
              })()}

              {pipeline.statut === "envoye_cs" && (() => {
                const lastReco = pipeline.events.find(e => {
                  const m = e.metadata as Record<string, unknown> | null;
                  return m?.recoType === "reco_sent";
                });
                if (!lastReco) return null;
                const sentAt = new Date(lastReco.createdAt);
                const joursEcoules = Math.floor((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24));
                const joursRestants = 7 - joursEcoules;
                const delaiPasse = joursEcoules >= 7;
                return (
                  <Card className="p-5 space-y-4" style={delaiPasse ? { borderColor: "#BBF1C8", backgroundColor: "#EFFBF2" } : { borderColor: "#F5C97A", backgroundColor: "#FFF7EB" }}>
                    <div className="flex items-start gap-3">
                      {delaiPasse ? (
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#13762C" }} />
                      ) : (
                        <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#955804" }} />
                      )}
                      <div>
                        <p className="font-semibold text-sm" style={{ color: delaiPasse ? "#13762C" : "#955804" }}>
                          {delaiPasse
                            ? "Délai écoulé — vous pouvez procéder à la signature"
                            : `Délai en cours — encore ${joursRestants} jour${joursRestants > 1 ? "s" : ""} avant signature`}
                        </p>
                        <p className="text-xs mt-1" style={{ color: delaiPasse ? "#13762C" : "#955804" }}>
                          {delaiPasse
                            ? `Email envoyé il y a ${joursEcoules} jours. Le conseil syndical n'a pas répondu dans les 7 jours.`
                            : `Email envoyé le ${sentAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}. Signature possible à partir du ${new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })}.`}
                        </p>
                      </div>
                    </div>
                    {delaiPasse ? (
                      <Button
                        onClick={() => setShowSignerDialog(true)}
                        disabled={isPending}
                        className="w-full"
                        size="lg"
                        style={{ backgroundColor: "#13762C" }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Signer le contrat
                      </Button>
                    ) : (
                      <button
                        onClick={() => setShowSignerDialog(true)}
                        className="w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-left hover:opacity-80 transition-opacity"
                        style={{ borderColor: "#F5C97A", backgroundColor: "#FFF0CC", color: "#955804" }}
                      >
                        <span>🤝</span>
                        <span>Le CS a donné son accord — signer maintenant</span>
                      </button>
                    )}
                  </Card>
                );
              })()}

              {pipeline.statut === "contrat_signe" && (
                <Card className="p-5 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
                    Nouveau contrat
                  </div>
                  {pipeline.nouveauNumeroContrat || pipeline.nouveauDateEffet || pipeline.nouveauPrimeTTC ? (
                    <dl className="space-y-2">
                      {pipeline.nouveauNumeroContrat && (
                        <div className="flex justify-between items-center">
                          <dt className="text-xs" style={{ color: "#A2A1AF" }}>N° de contrat</dt>
                          <dd className="text-sm font-semibold" style={{ color: "#26262C" }}>{pipeline.nouveauNumeroContrat}</dd>
                        </div>
                      )}
                      {pipeline.nouveauDateEffet && (
                        <div className="flex justify-between items-center">
                          <dt className="text-xs" style={{ color: "#A2A1AF" }}>Date d&apos;effet</dt>
                          <dd className="text-sm font-semibold" style={{ color: "#26262C" }}>{new Date(pipeline.nouveauDateEffet).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</dd>
                        </div>
                      )}
                      {pipeline.nouveauPrimeTTC && (
                        <div className="flex justify-between items-center">
                          <dt className="text-xs" style={{ color: "#A2A1AF" }}>Prime TTC</dt>
                          <dd className="text-sm font-semibold" style={{ color: "#26262C" }}>{pipeline.nouveauPrimeTTC.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €</dd>
                        </div>
                      )}
                    </dl>
                  ) : (
                    <p className="text-xs" style={{ color: "#A2A1AF" }}>Extraction en cours depuis le PDF signé…</p>
                  )}
                </Card>
              )}

              {pipeline.statut === "contrat_signe" && (
                <Card className="p-5 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
                    Notification nouvel assureur
                  </div>
                  <ContratSigneAction
                    pipelineId={pipeline.id}
                    signedPdfUrl={pipeline.signedPdfUrl}
                    devisRecommande={pipeline.devisRecus.find(d => d.recommande) ?? null}
                    copro={{
                      nom: pipeline.copro.nom,
                      adresse: pipeline.copro.adresse,
                      gestionnaireEmail: pipeline.copro.gestionnaireEmail,
                    }}
                    sentEvents={pipeline.events.filter(e => {
                      const m = e.metadata as Record<string, unknown> | null;
                      return m?.insureurType === "insureur_sent";
                    })}
                  />
                </Card>
              )}

              {pipeline.statut === "contrat_signe" && (
                <Card className="p-5 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
                    Résiliation ancien assureur
                  </div>
                  <ResiliationAction
                    pipelineId={pipeline.id}
                    assureurActuel={pipeline.copro.assureurActuel}
                    copro={{
                      nom: pipeline.copro.nom,
                      adresse: pipeline.copro.adresse,
                      gestionnaireEmail: pipeline.copro.gestionnaireEmail,
                      dateEcheance: pipeline.copro.dateEcheance,
                      numeroContrat: pipeline.copro.numeroContrat,
                    }}
                    sentEvents={pipeline.events.filter(e => {
                      const m = e.metadata as Record<string, unknown> | null;
                      return m?.resiliationType === "resiliation_sent";
                    })}
                  />
                </Card>
              )}

              {/* Prochaine action mise en avant (autres étapes) */}
              {pipeline.statut !== "rs_en_cours" && pipeline.statut !== "devis_demandes" && pipeline.statut !== "devis_recus" && pipeline.statut !== "envoye_cs" && pipeline.statut !== "contrat_signe" && <Card className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#A2A1AF" }}>
                  Prochaine action
                </div>
                {nextTask ? (
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "#4E49FC" }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#4E49FC" }} />
                    </div>
                    <div>
                      <p className="font-medium leading-snug" style={{ color: "#26262C" }}>{nextTask.label}</p>
                      {nextTask.description && (
                        <p className="text-xs mt-1" style={{ color: "#A2A1AF" }}>{nextTask.description}</p>
                      )}
                      <button
                        onClick={() => handleToggleTask(nextTask.id)}
                        disabled={isPending}
                        className="mt-3 text-xs font-medium flex items-center gap-1"
                        style={{ color: "#4E49FC" }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Marquer comme fait
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2" style={{ color: "#13762C" }}>
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Toutes les tâches sont faites</span>
                  </div>
                )}
              </Card>}

              {/* Checklist complète (repliable) */}
              {currentStepTasks.length > 0 && (
                <Card className="p-4">
                  <button
                    onClick={() => setShowAllTasks(!showAllTasks)}
                    className="flex items-center justify-between w-full text-sm font-medium hover:opacity-80"
                    style={{ color: "#656576" }}
                  >
                    <span>
                      Toutes les tâches
                      <span className="ml-2 text-xs font-normal" style={{ color: "#A2A1AF" }}>
                        {completedRequired.length}/{requiredTasks.length} obligatoires
                      </span>
                    </span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform", showAllTasks && "rotate-90")} />
                  </button>

                  {showAllTasks && (
                    <div className="mt-3 space-y-3 pt-3 border-t" style={{ borderColor: "#E8E8EC" }}>
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
                              <span className={cn("text-sm", isCompleted && "line-through")} style={isCompleted ? { color: "#A2A1AF" } : undefined}>
                                {task.label}
                                {task.required && !isCompleted && <span className="ml-1 text-xs" style={{ color: "#CA1E12" }}>★</span>}
                              </span>
                              {isCompleted && completion && (
                                <p className="text-xs mt-0.5" style={{ color: "#A2A1AF" }}>
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

              {/* Boutons navigation */}
              {pipeline.statut !== "devis_recus" && (
                <Card className="p-4 space-y-3">
                  {nextStep && (
                    <Button
                      onClick={() => allRequiredDone ? handleAdvance(false) : setShowAdvanceDialog(true)}
                      disabled={isPending}
                      className={cn("w-full", isWon && "bg-[#13762C] hover:bg-[#13762C]/90")}
                      size="lg"
                    >
                      Passer à : {nextStep.label}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                  {prevStep && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        startTransition(async () => {
                          await goBackStatut(pipeline.id);
                          toast.success(`Retour à : ${prevStep.label}`);
                        });
                      }}
                      disabled={isPending}
                      className="w-full"
                      style={{ color: "#656576" }}
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Revenir à : {prevStep.label}
                    </Button>
                  )}
                </Card>
              )}

            </>
          )}
        </div>

        {/* Col 3: deal perdu + échéance + notes + historique */}
        <div className="space-y-4">
          {/* Deal perdu */}
          {!isTerminal && (
            <div className="relative" ref={dealPerduRef}>
              <Button
                variant="outline"
                onClick={() => setDealPerduOpen((o) => !o)}
                className="w-full text-sm justify-between"
                style={{ borderColor: "#FFF5F5", color: "#CA1E12" }}
              >
                <span className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Passer le deal en perdu
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", dealPerduOpen && "rotate-180")} />
              </Button>
              {dealPerduOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-md overflow-hidden border" style={{ borderColor: "#FFF5F5" }}>
                  <button
                    onClick={() => { setDealPerduOpen(false); setShowRefusDialog(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#FFF5F5]"
                    style={{ color: "#CA1E12" }}
                  >
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                    Refus du client
                  </button>
                  <button
                    onClick={() => { setDealPerduOpen(false); setShowNonAssurableDialog(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 border-t hover:bg-[#FFF5F5]"
                    style={{ color: "#CA1E12", borderColor: "#FFF5F5" }}
                  >
                    <XCircle className="h-4 w-4 flex-shrink-0" />
                    Copro non assurable
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Échéance */}
          <Card className={cn("p-4", echeanceBg.className)} style={echeanceBg.style}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: "#26262C" }}>
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

          {/* Notes */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "#26262C" }}>
              <MessageSquare className="h-4 w-4" />
              Notes
            </h3>
            {/* Notes existantes */}
            {pipeline.events.filter(e => e.type === "note_ajoutee").length > 0 && (
              <div className="space-y-2 mb-3">
                {pipeline.events.filter(e => e.type === "note_ajoutee").map((event) => (
                  <NoteItem
                    key={event.id}
                    event={event}
                    pipelineId={pipeline.id}
                    onDelete={deleteNote}
                    onEdit={editNote}
                  />
                ))}
              </div>
            )}
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

          {/* Historique collapsible */}
          <Card className="overflow-hidden">
            <button
              onClick={() => setHistoriqueOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F7F7F8]"
            >
              <span className="text-sm font-semibold flex items-center gap-2" style={{ color: "#26262C" }}>
                <Clock className="h-4 w-4" />
                Historique
                <span className="text-xs font-normal" style={{ color: "#A2A1AF" }}>({pipeline.events.length})</span>
              </span>
              {historiqueOpen ? <ChevronUp className="h-4 w-4" style={{ color: "#A2A1AF" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "#A2A1AF" }} />}
            </button>
            {historiqueOpen && (
              <div className="px-4 pb-4 border-t">
                {pipeline.events.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: "#A2A1AF" }}>Aucun événement</p>
                ) : (
                  <div className="space-y-3 pt-3">
                    {pipeline.events.map((event) => (
                      <div key={event.id} className="flex gap-3">
                        <EventIcon type={event.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-snug" style={{ color: "#26262C" }}>{event.description}</p>
                          <p className="text-xs mt-0.5" style={{ color: "#A2A1AF" }}>
                            {event.createdBy.split("@")[0]} · {new Date(event.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modale contrat actuel */}
      <Dialog open={showContratDialog} onOpenChange={setShowContratDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Contrat actuel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Assureur actuel</label>
              <input className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.assureurActuel} onChange={e => setContratForm(f => ({ ...f, assureurActuel: e.target.value }))} placeholder="Ex : Allianz" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>N° de contrat</label>
              <input className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.numeroContrat} onChange={e => setContratForm(f => ({ ...f, numeroContrat: e.target.value }))} placeholder="Ex : MRI-2021-00123" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Courtier</label>
              <input className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.courtierActuel} onChange={e => setContratForm(f => ({ ...f, courtierActuel: e.target.value }))} placeholder="Nom du courtier" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Prime annuelle (€)</label>
              <input type="number" className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.primeActuelle} onChange={e => setContratForm(f => ({ ...f, primeActuelle: e.target.value }))} placeholder="Ex : 3 500" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Date de début du contrat</label>
              <input type="date" className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.dateDebutContrat} onChange={e => setContratForm(f => ({ ...f, dateDebutContrat: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Mail courtier / assureur</label>
              <input type="email" className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.contactCourtierEmail} onChange={e => setContratForm(f => ({ ...f, contactCourtierEmail: e.target.value }))} placeholder="contact@assureur.fr" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>N° téléphone courtier / assureur</label>
              <input type="tel" className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={contratForm.contactCourtierTel} onChange={e => setContratForm(f => ({ ...f, contactCourtierTel: e.target.value }))} placeholder="06 00 00 00 00" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowContratDialog(false)}>Annuler</Button>
            <Button disabled={isPending} onClick={() => {
              startTransition(async () => {
                const prime = parseFloat(contratForm.primeActuelle);
                await updateCoproCaracteristiques(pipeline.coproId, pipeline.id, {
                  assureurActuel: contratForm.assureurActuel || null,
                  courtierActuel: contratForm.courtierActuel || null,
                  numeroContrat: contratForm.numeroContrat || null,
                  primeActuelle: isNaN(prime) ? null : prime,
                  dateDebutContrat: contratForm.dateDebutContrat ? new Date(contratForm.dateDebutContrat) : null,
                  contactCourtierEmail: contratForm.contactCourtierEmail || null,
                  contactCourtierTel: contratForm.contactCourtierTel || null,
                });
                setShowContratDialog(false);
                toast.success("Contrat mis à jour");
              });
            }}>Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale caractéristiques copro */}
      <Dialog open={showCaracDialog} onOpenChange={setShowCaracDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Infos copropriété</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Surface développée (m²)</label>
              <input type="number" className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={caracForm.surfaceDeveloppee} onChange={e => setCaracForm(f => ({ ...f, surfaceDeveloppee: e.target.value }))} placeholder="ex: 1200" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Période de construction</label>
              <select className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm bg-white" value={caracForm.periodeConstruction} onChange={e => setCaracForm(f => ({ ...f, periodeConstruction: e.target.value }))}>
                <option value="">— Non renseigné</option>
                {Object.entries(PERIODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Nature de l&apos;occupation</label>
              <select className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm bg-white" value={caracForm.natureOccupation} onChange={e => setCaracForm(f => ({ ...f, natureOccupation: e.target.value }))}>
                <option value="">— Non renseigné</option>
                {Object.entries(OCCUPATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Activités aggravantes</label>
              <div className="mt-1 space-y-1">
                {ACTIVITES_AGGRAVANTES_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activitesChecked.includes(opt)}
                      onChange={() => {
                        if (opt === "Aucune") { setActivitesChecked(["Aucune"]); return; }
                        const next = activitesChecked.filter(v => v !== "Aucune");
                        setActivitesChecked(next.includes(opt) ? next.filter(v => v !== opt) : [...next, opt]);
                      }}
                      className="rounded"
                    />
                    <span style={{ color: "#26262C" }}>{opt}</span>
                  </label>
                ))}
                <input
                  type="text"
                  className="mt-2 w-full border rounded-md px-3 py-1.5 text-sm"
                  value={activitesAutre}
                  onChange={e => setActivitesAutre(e.target.value)}
                  placeholder="Autre (champ libre)..."
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Caractéristiques particulières</label>
              <div className="mt-1 space-y-1">
                {CARACTERISTIQUES_PARTICULIERES_OPTIONS.map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={caracsChecked.includes(opt)}
                      onChange={() => {
                        if (opt === "Aucune") { setCaracsChecked(["Aucune"]); return; }
                        const next = caracsChecked.filter(v => v !== "Aucune");
                        setCaracsChecked(next.includes(opt) ? next.filter(v => v !== opt) : [...next, opt]);
                      }}
                      className="rounded"
                    />
                    <span style={{ color: "#26262C" }}>{opt}</span>
                  </label>
                ))}
                <input
                  type="text"
                  className="mt-2 w-full border rounded-md px-3 py-1.5 text-sm"
                  value={caracsAutre}
                  onChange={e => setCaracsAutre(e.target.value)}
                  placeholder="Autre (champ libre)..."
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Proportion de logements inoccupés</label>
              <select className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm bg-white" value={caracForm.proportionInoccupee} onChange={e => setCaracForm(f => ({ ...f, proportionInoccupee: e.target.value }))}>
                <option value="">— Non renseigné</option>
                {Object.entries(INOCCUPEE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: "#656576" }}>Représentant légal de la copropriété</label>
              <input className="mt-1 w-full border rounded-md px-3 py-1.5 text-sm" value={caracForm.representantLegal} onChange={e => setCaracForm(f => ({ ...f, representantLegal: e.target.value }))} placeholder="Nom et prénom" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowCaracDialog(false)}>Annuler</Button>
            <Button disabled={isPending} onClick={() => {
              startTransition(async () => {
                await updateCoproCaracteristiques(pipeline.coproId, pipeline.id, {
                  surfaceDeveloppee: (() => { const v = parseFloat(caracForm.surfaceDeveloppee); return isNaN(v) ? null : v; })(),
                  periodeConstruction: caracForm.periodeConstruction || null,
                  natureOccupation: caracForm.natureOccupation || null,
                  activitesAggravantes: serializeMultiField(activitesChecked, activitesAutre),
                  caracteristiquesParticulieres: serializeMultiField(caracsChecked, caracsAutre),
                  proportionInoccupee: caracForm.proportionInoccupee || null,
                  representantLegal: caracForm.representantLegal || null,
                });
                setShowCaracDialog(false);
                toast.success("Informations enregistrées");
              });
            }}>Enregistrer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale signature contrat */}
      <Dialog open={showSignerDialog} onOpenChange={(o) => { setShowSignerDialog(o); if (!o) setSignatureFile(undefined); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Signer le contrat</DialogTitle>
            <DialogDescription>Confirmez la signature du contrat pour cette copropriété.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Devis recommandé */}
            {pipeline.devisRecus.find(d => d.recommande) && (() => {
              const devis = pipeline.devisRecus.find(d => d.recommande)!;
              return (
                <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "#BBF1C8", backgroundColor: "#EFFBF2" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>Devis sélectionné</p>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold" style={{ color: "#26262C" }}>{devis.assureur}</p>
                      <p className="text-sm" style={{ color: "#656576" }}>
                        {devis.primeTTC.toLocaleString("fr-FR")} € / an
                        {devis.pdfName && <span className="ml-2 text-xs" style={{ color: "#A2A1AF" }}>· {devis.pdfName}</span>}
                      </p>
                    </div>
                    {devis.pdfUrl && (
                      <button
                        onClick={async () => {
                          const url = await getPdfSignedUrl(devis.pdfUrl!);
                          if (url) window.open(url, "_blank");
                          else toast.error("Impossible d'ouvrir le PDF");
                        }}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border flex-shrink-0 hover:opacity-80 transition-opacity"
                        style={{ borderColor: "#BBF1C8", color: "#13762C" }}
                      >
                        <ChevronRight className="h-3 w-3" />
                        Voir le PDF
                      </button>
                    )}
                  </div>

                  {/* Bouton tampon Matera */}
                  {devis.pdfUrl && (
                    <div className="pt-2 border-t" style={{ borderColor: "#BBF1C8" }}>
                      {signedPdfPath ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "#13762C" }}>
                            <CheckCircle2 className="h-4 w-4" />
                            Contrat signé avec le tampon Matera
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={async () => {
                                const url = await getPdfSignedUrl(signedPdfPath);
                                if (url) window.open(url, "_blank");
                              }}
                              className="text-xs underline"
                              style={{ color: "#13762C" }}
                            >
                              Voir le PDF signé
                            </button>
                            <button
                              onClick={() => setSignedPdfPath(null)}
                              className="text-xs flex items-center gap-1"
                              style={{ color: "#A2A1AF" }}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Regénérer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={isSigning}
                          style={{ borderColor: "#BBF1C8", color: "#13762C" }}
                          onClick={async () => {
                            setIsSigning(true);
                            try {
                              const res = await fetch("/api/storage/sign-pdf", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ pdfPath: devis.pdfUrl, pipelineId: pipeline.id }),
                              });
                              const json = await res.json() as { success?: boolean; signedPath?: string; error?: string };
                              if (json.success && json.signedPath) {
                                setSignedPdfPath(json.signedPath);
                                await saveSignedPdfUrl(pipeline.id, json.signedPath);
                                toast.success("Tampon appliqué !");
                              } else {
                                toast.error(json.error ?? "Erreur lors de la signature");
                              }
                            } catch { toast.error("Erreur réseau"); }
                            setIsSigning(false);
                          }}
                        >
                          {isSigning ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Application du tampon…</>
                          ) : (
                            <>🖊️ Signer avec le tampon Matera</>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Toggle autre document */}
            <div>
              <button
                onClick={() => setSignatureFile(signatureFile === undefined ? null : undefined)}
                className="flex items-center gap-1.5 text-sm"
                style={{ color: "#8784FD" }}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", signatureFile !== undefined && "rotate-180")} />
                Signer un autre document
              </button>

              {signatureFile !== undefined && (
                <div className="mt-2">
                  {signatureFile ? (
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: "#E8E8EC" }}>
                      <span className="text-sm truncate" style={{ color: "#26262C" }}>{signatureFile.name}</span>
                      <button onClick={() => setSignatureFile(null)} style={{ color: "#A2A1AF" }}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-20 rounded-lg border-2 border-dashed cursor-pointer hover:bg-[#F7F7F8] transition-colors" style={{ borderColor: "#E8E8EC" }}>
                      <p className="text-xs" style={{ color: "#A2A1AF" }}>Glisser un PDF ou cliquer pour uploader</p>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => setSignatureFile(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => { setShowSignerDialog(false); setSignatureFile(undefined); setSignedPdfPath(null); }}>Annuler</Button>
            <Button
              disabled={isPending}
              style={{ backgroundColor: "#13762C" }}
              onClick={() => {
                setShowSignerDialog(false);
                setSignatureFile(undefined);
                setSignedPdfPath(null);
                handleAdvance(true);
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmer la signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={showRefusDialog} onOpenChange={setShowRefusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refus du client</DialogTitle>
            <DialogDescription>Le client a refusé le changement d&apos;assurance. Ajoutez une note si besoin.</DialogDescription>
          </DialogHeader>
          <Textarea value={refusNote} onChange={(e) => setRefusNote(e.target.value)} placeholder="Note (optionnelle)..." className="min-h-20" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowRefusDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleRefus} disabled={isPending}>Confirmer — Deal perdu</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNonAssurableDialog} onOpenChange={setShowNonAssurableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copro non assurable</DialogTitle>
            <DialogDescription>La copropriété ne peut pas être assurée par nos partenaires. Ajoutez une note si besoin.</DialogDescription>
          </DialogHeader>
          <Textarea value={nonAssurableNote} onChange={(e) => setNonAssurableNote(e.target.value)} placeholder="Note (optionnelle)..." className="min-h-20" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowNonAssurableDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleNonAssurable} disabled={isPending}>Confirmer — Deal perdu</Button>
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
      <dt className="text-xs" style={{ color: "#656576" }}>{label}</dt>
      <dd className={cn("text-sm")} style={{ color: value ? "#26262C" : "#A2A1AF", fontStyle: value ? undefined : "italic" }}>{value || "Non renseigné"}</dd>
    </div>
  );
}

function StepProgressBar({ steps, currentStatut, lost, onStepClick }: {
  steps: typeof PIPELINE_STEPS;
  currentStatut: string;
  lost?: boolean;
  onStepClick?: (statut: string) => void;
}) {
  const currentIdx = steps.findIndex((s) => s.statut === currentStatut);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={step.statut} className="flex items-center gap-1 flex-shrink-0">
            <div
              onClick={onStepClick && !isCurrent ? () => onStepClick(step.statut) : undefined}
              className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-opacity", onStepClick && !isCurrent && "cursor-pointer hover:opacity-75")}
              style={
                isPast
                  ? { backgroundColor: "#EFFBF2", color: "#13762C" }
                  : isCurrent && lost
                  ? { backgroundColor: "#FFF5F5", color: "#CA1E12", border: "1px solid #CA1E12" }
                  : isCurrent
                  ? { backgroundColor: "#4E49FC", color: "#FFFFFF" }
                  : { backgroundColor: "#F7F7F8", color: "#A2A1AF" }
              }
            >
              {isPast && <CheckCircle2 className="h-3 w-3" />}
              {isCurrent && lost && <XCircle className="h-3 w-3" />}
              {step.shortLabel}
            </div>
            {idx < steps.length - 1 && <ChevronRight className="h-3 w-3 flex-shrink-0" style={{ color: "#E8E8EC" }} />}
          </div>
        );
      })}
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5 flex-shrink-0 mt-0.5";
  switch (type) {
    case "statut_change": return <ChevronRight className={cls} style={{ color: "#4E49FC" }} />;
    case "tache_completee": return <CheckCircle2 className={cls} style={{ color: "#13762C" }} />;
    case "note_ajoutee": return <MessageSquare className={cls} style={{ color: "#A2A1AF" }} />;
    default: return <Clock className={cls} style={{ color: "#A2A1AF" }} />;
  }
}
