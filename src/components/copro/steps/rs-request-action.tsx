"use client";

import { useState, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  FileText,
  X,
  Upload,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  Phone,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logRSDraftSent, marquerRSRecu, createAppelCourtierTask } from "@/lib/actions";

interface RsEvent {
  id: string;
  createdAt: Date;
  metadata?: unknown;
}

interface RSRequestActionProps {
  pipelineId: string;
  copro: {
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    courtierActuel: string | null;
    dateEcheance: Date | null;
    gestionnaireEmail: string | null;
  };
  rsEvents: RsEvent[];
}

type DroppedFile = { file: File; name: string };

function parseMeta(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  return metadata as Record<string, unknown>;
}

function formatDate(date: Date | null | string): string {
  if (!date) return "date inconnue";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function addDays(date: Date | string, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildFirstEmailTemplate(
  copro: RSRequestActionProps["copro"]
): string {
  return `Bonjour,

Je me permets de vous contacter en tant que syndic professionnel de la copropriété ${copro.nom}${copro.adresse ? `, située ${copro.adresse}` : ""}.

Dans le cadre du renouvellement du contrat d'assurance MRI arrivant à échéance le ${formatDate(copro.dateEcheance)}, nous souhaitons étudier les conditions de renouvellement.

Pourriez-vous nous faire parvenir le relevé de sinistralité des 3 dernières années dans les meilleurs délais ? Vous trouverez en pièce jointe notre mandat de syndic ainsi que le contrat d'assurance actuel.

Cordialement,
Matera Syndic`;
}

function buildRelanceTemplate(
  copro: RSRequestActionProps["copro"],
  firstSentAt: Date | string,
  relanceNum: number
): string {
  const label = relanceNum === 1 ? "premier" : "second";
  return `Bonjour,

Je me permets de revenir vers vous suite à mon ${label} mail du ${formatDate(firstSentAt)} concernant le relevé de sinistralité de la copropriété ${copro.nom}${copro.adresse ? `, située ${copro.adresse}` : ""}.

Nous n'avons toujours pas reçu ce document, indispensable pour l'étude du renouvellement du contrat d'assurance MRI (échéance le ${formatDate(copro.dateEcheance)}).

Pourriez-vous nous le faire parvenir dans les meilleurs délais ?

Cordialement,
Matera Syndic`;
}

function DropZone({
  label,
  hint,
  file,
  onDrop,
  onRemove,
}: {
  label: string;
  hint: string;
  file: DroppedFile | null;
  onDrop: (file: File) => void;
  onRemove: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onDrop(dropped);
    },
    [onDrop]
  );

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.png,.jpg";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) onDrop(f);
    };
    input.click();
  }, [onDrop]);

  if (file) {
    return (
      <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
        <FileText className="h-5 w-5 text-green-600 flex-shrink-0" />
        <span className="text-sm text-green-800 truncate flex-1">{file.name}</span>
        <button onClick={onRemove} className="text-green-400 hover:text-green-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
        isDragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
    </div>
  );
}

// ─── First email form ───────────────────────────────────────────────────────

function FirstEmailForm({
  pipelineId,
  copro,
  onSent,
}: {
  pipelineId: string;
  copro: RSRequestActionProps["copro"];
  onSent: (toEmail: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [contratFile, setContratFile] = useState<DroppedFile | null>(null);
  const [pvFile, setPvFile] = useState<DroppedFile | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState(
    `Demande de relevé de sinistralité – ${copro.nom}`
  );
  const [body, setBody] = useState(() => buildFirstEmailTemplate(copro));

  function handleSend() {
    if (!toEmail.trim()) {
      toast.error("Veuillez renseigner l'adresse email du destinataire");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("pipelineId", pipelineId);
      formData.append("to", toEmail);
      formData.append("subject", subject);
      formData.append("body", body);
      if (contratFile) formData.append("contrat", contratFile.file, contratFile.name);
      if (pvFile) formData.append("pv", pvFile.file, pvFile.name);

      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        if (data.fallback && data.mailtoUrl) {
          window.open(data.mailtoUrl, "_blank");
          toast.success("Client mail ouvert (Front pas encore configuré)");
        } else {
          toast.success("Brouillon créé dans Front !");
        }
        await logRSDraftSent(pipelineId, toEmail, 0);
        onSent(toEmail);
      } else {
        toast.error(data.error || "Erreur lors de la création du brouillon");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Documents à joindre
        </p>
        <div className="grid grid-cols-2 gap-3">
          <DropZone
            label="Contrat actuel"
            hint="PDF, glisser ou cliquer"
            file={contratFile}
            onDrop={(f) => setContratFile({ file: f, name: f.name })}
            onRemove={() => setContratFile(null)}
          />
          <DropZone
            label="PV désignant Matera"
            hint="PDF, glisser ou cliquer"
            file={pvFile}
            onDrop={(f) => setPvFile({ file: f, name: f.name })}
            onRemove={() => setPvFile(null)}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Destinataire (courtier / assureur actuel)
        </Label>
        <Input
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder="courtier@assureur.fr"
          type="email"
          className="mt-1"
        />
        {copro.courtierActuel && (
          <p className="text-xs text-gray-400 mt-1">Courtier actuel : {copro.courtierActuel}</p>
        )}
      </div>

      <div>
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Objet
        </Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
      </div>

      <div>
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Message
        </Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="mt-1 min-h-48 text-sm font-mono"
        />
      </div>

      <Button onClick={handleSend} disabled={isPending} className="w-full" size="lg">
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Création du brouillon...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Créer le brouillon dans Front
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Relance mini-form ───────────────────────────────────────────────────────

function RelanceForm({
  pipelineId,
  copro,
  toEmail,
  relanceNum,
  firstSentAt,
  onSent,
  onCancel,
}: {
  pipelineId: string;
  copro: RSRequestActionProps["copro"];
  toEmail: string;
  relanceNum: number;
  firstSentAt: Date | string;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [to, setTo] = useState(toEmail);
  const [subject, setSubject] = useState(
    `[Relance ${relanceNum}] Relevé de sinistralité – ${copro.nom}`
  );
  const [body, setBody] = useState(() =>
    buildRelanceTemplate(copro, firstSentAt, relanceNum)
  );
  const [showBody, setShowBody] = useState(false);

  function handleSend() {
    if (!to.trim()) {
      toast.error("Email destinataire requis");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("pipelineId", pipelineId);
      formData.append("to", to);
      formData.append("subject", subject);
      formData.append("body", body);

      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        if (data.fallback && data.mailtoUrl) {
          window.open(data.mailtoUrl, "_blank");
          toast.success("Client mail ouvert");
        } else {
          toast.success(`Relance ${relanceNum} créée dans Front !`);
        }
        await logRSDraftSent(pipelineId, to, relanceNum);
        onSent();
      } else {
        toast.error(data.error || "Erreur");
      }
    });
  }

  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
      <div>
        <Label className="text-xs text-gray-500">Destinataire</Label>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          type="email"
          className="mt-1 bg-white"
        />
      </div>
      <div>
        <Label className="text-xs text-gray-500">Objet</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 bg-white" />
      </div>
      <button
        type="button"
        onClick={() => setShowBody(!showBody)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
      >
        {showBody ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showBody ? "Masquer le message" : "Voir / modifier le message"}
      </button>
      {showBody && (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="text-sm font-mono min-h-36 bg-white"
        />
      )}
      <div className="flex gap-2">
        <Button onClick={handleSend} disabled={isPending} size="sm" className="flex-1">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Créer le brouillon dans Front
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

// ─── Post-send follow-up panel ───────────────────────────────────────────────

function PostSendPanel({
  pipelineId,
  copro,
  firstDraftEvent,
  relance1Event,
  relance2Event,
  appellTaskEvent,
  localSentTo,
}: {
  pipelineId: string;
  copro: RSRequestActionProps["copro"];
  firstDraftEvent: RsEvent;
  relance1Event: RsEvent | null;
  relance2Event: RsEvent | null;
  appellTaskEvent: RsEvent | null;
  localSentTo: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [activeForm, setActiveForm] = useState<null | 1 | 2>(null);
  const [appellDone, setAppellDone] = useState(!!appellTaskEvent);
  const [relance1Done, setRelance1Done] = useState(!!relance1Event);
  const [relance2Done, setRelance2Done] = useState(!!relance2Event);

  const firstMeta = parseMeta(firstDraftEvent.metadata);
  const toEmail =
    (firstMeta?.to as string | undefined) || localSentTo || "";
  const firstSentAt = firstDraftEvent.createdAt;

  const j7Date = addDays(firstSentAt, 7);
  const j14Date = addDays(firstSentAt, 14);
  const j28Date = addDays(firstSentAt, 28);
  const now = new Date();

  const j7Available = now >= j7Date;
  const j14Available = now >= j14Date;
  const j28Available = now >= j28Date;

  function handleRSRecu() {
    startTransition(async () => {
      await marquerRSRecu(pipelineId);
      toast.success("RS reçu — passage aux devis !");
    });
  }

  function handleAppelCourtier() {
    startTransition(async () => {
      await createAppelCourtierTask(pipelineId);
      setAppellDone(true);
      toast.success("Tâche créée : appeler le courtier");
    });
  }

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="space-y-1.5">
        <TimelineItem
          done
          label="Demande RS envoyée"
          date={firstSentAt}
          sub={toEmail}
        />
        {relance1Done && relance1Event && (
          <TimelineItem done label="Relance 1 envoyée" date={relance1Event.createdAt} />
        )}
        {relance2Done && relance2Event && (
          <TimelineItem done label="Relance 2 envoyée" date={relance2Event.createdAt} />
        )}
        {appellDone && (
          <TimelineItem done label="Tâche créée : appeler le courtier" />
        )}
      </div>

      {/* RS reçu */}
      <Button
        onClick={handleRSRecu}
        disabled={isPending}
        className="w-full bg-green-600 hover:bg-green-700 text-white"
        size="lg"
      >
        <Check className="h-4 w-4 mr-2" />
        J&apos;ai reçu le relevé de sinistralité
      </Button>

      {/* Relances */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Pas encore reçu ?
        </p>

        {/* Relance J+7 */}
        {!relance1Done && (
          <div>
            <RelanceRow
              label="Relance J+7"
              date={j7Date}
              available={j7Available}
              done={false}
              onAction={() => setActiveForm(activeForm === 1 ? null : 1)}
              actionLabel="Préparer la relance"
              isOpen={activeForm === 1}
            />
            {activeForm === 1 && (
              <RelanceForm
                pipelineId={pipelineId}
                copro={copro}
                toEmail={toEmail}
                relanceNum={1}
                firstSentAt={firstSentAt}
                onSent={() => {
                  setRelance1Done(true);
                  setActiveForm(null);
                }}
                onCancel={() => setActiveForm(null)}
              />
            )}
          </div>
        )}

        {/* Relance J+14 */}
        {relance1Done && !relance2Done && (
          <div>
            <RelanceRow
              label="Relance J+14"
              date={j14Date}
              available={j14Available}
              done={false}
              onAction={() => setActiveForm(activeForm === 2 ? null : 2)}
              actionLabel="Préparer la relance"
              isOpen={activeForm === 2}
            />
            {activeForm === 2 && (
              <RelanceForm
                pipelineId={pipelineId}
                copro={copro}
                toEmail={toEmail}
                relanceNum={2}
                firstSentAt={firstSentAt}
                onSent={() => {
                  setRelance2Done(true);
                  setActiveForm(null);
                }}
                onCancel={() => setActiveForm(null)}
              />
            )}
          </div>
        )}

        {/* Relances done indicators */}
        {relance1Done && !relance2Done && (
          <RelanceRow label="Relance J+7" date={j7Date} available done />
        )}
        {relance2Done && (
          <>
            <RelanceRow label="Relance J+7" date={j7Date} available done />
            <RelanceRow label="Relance J+14" date={j14Date} available done />
          </>
        )}

        {/* Appel courtier J+28 */}
        {relance2Done && (
          <div>
            {appellDone ? (
              <RelanceRow
                label="Appeler le courtier"
                date={j28Date}
                available
                done
              />
            ) : (
              <div
                className={cn(
                  "flex items-center justify-between gap-3 p-3 rounded-lg border",
                  j28Available
                    ? "border-orange-200 bg-orange-50"
                    : "border-gray-100 bg-gray-50"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Phone
                      className={cn(
                        "h-4 w-4",
                        j28Available ? "text-orange-500" : "text-gray-300"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        j28Available ? "text-orange-700" : "text-gray-400"
                      )}
                    >
                      J+28 — Appeler le courtier
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 ml-6">
                    {j28Available
                      ? "Créer une tâche de rappel"
                      : `Disponible le ${formatDate(j28Date)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={j28Available ? "default" : "outline"}
                  disabled={!j28Available || isPending}
                  onClick={handleAppelCourtier}
                  className={cn(
                    j28Available && "bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
                  )}
                >
                  Créer la tâche
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineItem({
  done,
  label,
  date,
  sub,
}: {
  done: boolean;
  label: string;
  date?: Date | string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          "mt-0.5 h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0",
          done ? "bg-green-100" : "bg-gray-100"
        )}
      >
        <CheckCircle2
          className={cn("h-3 w-3", done ? "text-green-600" : "text-gray-300")}
        />
      </div>
      <div>
        <span className="text-sm text-gray-700">{label}</span>
        {date && (
          <span className="text-xs text-gray-400 ml-2">{formatDate(date)}</span>
        )}
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function RelanceRow({
  label,
  date,
  available,
  done,
  onAction,
  actionLabel,
  isOpen,
}: {
  label: string;
  date: Date;
  available: boolean;
  done: boolean;
  onAction?: () => void;
  actionLabel?: string;
  isOpen?: boolean;
}) {
  if (done) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
        <span>{label} — envoyée</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 p-3 rounded-lg border",
        available ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50"
      )}
    >
      <div className="flex items-center gap-2">
        <Clock
          className={cn("h-4 w-4", available ? "text-blue-500" : "text-gray-300")}
        />
        <div>
          <span
            className={cn(
              "text-sm font-medium",
              available ? "text-blue-700" : "text-gray-400"
            )}
          >
            {label}
          </span>
          {!available && (
            <p className="text-xs text-gray-400">Disponible le {formatDate(date)}</p>
          )}
        </div>
      </div>
      {onAction && (
        <Button
          size="sm"
          variant="outline"
          disabled={!available}
          onClick={onAction}
          className={cn(
            available && "border-blue-300 text-blue-700 hover:bg-blue-100"
          )}
        >
          {isOpen ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 mr-1" />
              Fermer
            </>
          ) : (
            actionLabel
          )}
        </Button>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function RSRequestAction({
  pipelineId,
  copro,
  rsEvents,
}: RSRequestActionProps) {
  const [localSentTo, setLocalSentTo] = useState<string | null>(null);

  const draftEvents = rsEvents.filter((e) => {
    const m = parseMeta(e.metadata);
    return m?.rsType === "draft_sent";
  });

  const firstDraftEvent =
    draftEvents.find((e) => parseMeta(e.metadata)?.relanceNum === 0) || null;
  const relance1Event =
    draftEvents.find((e) => parseMeta(e.metadata)?.relanceNum === 1) || null;
  const relance2Event =
    draftEvents.find((e) => parseMeta(e.metadata)?.relanceNum === 2) || null;
  const appellTaskEvent =
    rsEvents.find((e) => parseMeta(e.metadata)?.rsType === "appel_courtier_task") ||
    null;

  const hasSent = !!firstDraftEvent || !!localSentTo;

  if (!hasSent) {
    return (
      <FirstEmailForm
        pipelineId={pipelineId}
        copro={copro}
        onSent={(to) => setLocalSentTo(to)}
      />
    );
  }

  if (!firstDraftEvent) {
    // Just sent locally — show loading/optimistic state until revalidation kicks in
    return (
      <div className="text-center py-6">
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <Send className="h-6 w-6 text-green-600" />
        </div>
        <p className="font-medium text-gray-800">Brouillon créé dans Front</p>
        <p className="text-sm text-gray-400 mt-1">
          La page va se rafraîchir pour afficher le suivi
        </p>
      </div>
    );
  }

  return (
    <PostSendPanel
      pipelineId={pipelineId}
      copro={copro}
      firstDraftEvent={firstDraftEvent}
      relance1Event={relance1Event}
      relance2Event={relance2Event}
      appellTaskEvent={appellTaskEvent}
      localSentTo={localSentTo}
    />
  );
}
