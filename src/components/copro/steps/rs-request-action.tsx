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
    numeroContrat: string | null;
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

function nameFromEmail(email: string | null): string {
  if (!email) return "";
  const local = email.split("@")[0];
  return local
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

Je vous contacte en qualité de syndic de la copropriété ${copro.adresse ?? copro.nom}${copro.numeroContrat ? `, contrat n° ${copro.numeroContrat}` : ""}.

Pourriez-vous nous faire parvenir le relevé de sinistralité des 3 dernières années dans les meilleurs délais ? Vous trouverez en pièce jointe le dernier avis d'échéance.

Merci et bonne journée,

${nameFromEmail(copro.gestionnaireEmail)}
Matera`;
}

function buildRelanceTemplate(
  copro: RSRequestActionProps["copro"],
  firstSentAt: Date | string,
  relanceNum: number
): string {
  const label = relanceNum === 1 ? "premier" : "second";
  return `Bonjour,

Je me permets de revenir vers vous suite à mon ${label} mail du ${formatDate(firstSentAt)} concernant le relevé de sinistralité de la copropriété ${copro.nom}${copro.adresse ? `, située ${copro.adresse}` : ""}.

Nous n'avons toujours pas reçu ce document, malgré plusieurs relances.

Pourriez-vous nous le faire parvenir dans les meilleurs délais ?

Cordialement,
${nameFromEmail(copro.gestionnaireEmail)}
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
      <div className="flex items-center gap-3 p-3 bg-[#EFFBF2] border border-[#BBF1C8] rounded-xl">
        <FileText className="h-5 w-5 text-[#13762C] flex-shrink-0" />
        <span className="text-sm text-[#13762C] truncate flex-1">{file.name}</span>
        <button onClick={onRemove} className="text-[#13762C] hover:text-[#13762C]">
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
          ? "border-[#8784FD] bg-[#F5F5FF]"
          : "border-[#E8E8EC] hover:border-[#A2A1AF] hover:bg-[#F7F7F8]"
      )}
    >
      <Upload className="h-5 w-5 text-[#A2A1AF] mx-auto mb-1" />
      <p className="text-sm font-medium text-[#656576]">{label}</p>
      <p className="text-xs text-[#A2A1AF] mt-0.5">{hint}</p>
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
    copro.numeroContrat
      ? `Demande de relevé de sinistralité - Contrat n° ${copro.numeroContrat}`
      : `Demande de relevé de sinistralité - Contrat n° [À compléter]`
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
      formData.append("refTag", `${pipelineId}:rs`);
      if (contratFile) formData.append("contrat", contratFile.file, contratFile.name);
      if (pvFile) formData.append("pv", pvFile.file, pvFile.name);

      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        if (data.fallback && data.mailtoUrl) {
          window.open(data.mailtoUrl, "_blank");
          toast.success("Client mail ouvert (Front pas encore configuré)");
        } else {
          toast.success("Mail envoyé !");
        }
        await logRSDraftSent(pipelineId, toEmail, 0, data.conversationId);
        onSent(toEmail);
      } else {
        toast.error(data.error || "Erreur lors de l'envoi du mail");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-[#656576] uppercase tracking-wide mb-2">
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
            label="Dernier avis d'échéance"
            hint="PDF, glisser ou cliquer"
            file={pvFile}
            onDrop={(f) => setPvFile({ file: f, name: f.name })}
            onRemove={() => setPvFile(null)}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs font-semibold text-[#656576] uppercase tracking-wide">
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
          <p className="text-xs text-[#A2A1AF] mt-1">Courtier actuel : {copro.courtierActuel}</p>
        )}
      </div>

      <div>
        <Label className="text-xs font-semibold text-[#656576] uppercase tracking-wide">
          Objet
        </Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
      </div>

      <div>
        <Label className="text-xs font-semibold text-[#656576] uppercase tracking-wide">
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
            Envoi en cours...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Envoyer le mail via Front
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
      formData.append("refTag", `${pipelineId}:rs_relance`);

      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        if (data.fallback && data.mailtoUrl) {
          window.open(data.mailtoUrl, "_blank");
          toast.success("Client mail ouvert");
        } else {
          toast.success(`Relance ${relanceNum} créée dans Front !`);
        }
        await logRSDraftSent(pipelineId, to, relanceNum, data.conversationId);
        onSent();
      } else {
        toast.error(data.error || "Erreur");
      }
    });
  }

  return (
    <div className="mt-3 p-3 bg-[#F5F5FF] border border-[#8784FD] rounded-xl space-y-3">
      <div>
        <Label className="text-xs text-[#656576]">Destinataire</Label>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          type="email"
          className="mt-1 bg-white"
        />
      </div>
      <div>
        <Label className="text-xs text-[#656576]">Objet</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 bg-white" />
      </div>
      <button
        type="button"
        onClick={() => setShowBody(!showBody)}
        className="flex items-center gap-1 text-xs text-[#4E49FC] hover:text-[#3f3ae0]"
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
              Envoyer le mail via Front
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

      {/* RS reçu — bouton principal */}
      <Button
        onClick={handleRSRecu}
        disabled={isPending}
        style={{ backgroundColor: "#13762C" }}
        className="w-full text-white hover:opacity-90"
        size="lg"
      >
        <Check className="h-4 w-4 mr-2" />
        J&apos;ai reçu le relevé de sinistralité
      </Button>

      {/* Relances */}
      <div className="border-t border-[#E8E8EC] pt-4 space-y-3">
        <p className="text-xs font-semibold text-[#A2A1AF] uppercase tracking-wide">
          Pas encore reçu ?
        </p>

        {/* Relance J+7 */}
        {!relance1Done ? (
          <div className="space-y-2">
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
            <Button onClick={handleRSRecu} disabled={isPending} variant="outline" size="sm" className="w-full border-[#BBF1C8] text-[#13762C] hover:bg-[#EFFBF2]">
              <Check className="h-3.5 w-3.5 mr-1.5" />
              J&apos;ai reçu le relevé de sinistralité
            </Button>
          </div>
        ) : (
          <RelanceRow label="Relance J+7" date={j7Date} available done />
        )}

        {/* Relance J+14 */}
        {relance2Done ? (
          <RelanceRow label="Relance J+14" date={j14Date} available done />
        ) : relance1Done ? (
          <div className="space-y-2">
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
            <Button onClick={handleRSRecu} disabled={isPending} variant="outline" size="sm" className="w-full border-[#BBF1C8] text-[#13762C] hover:bg-[#EFFBF2]">
              <Check className="h-3.5 w-3.5 mr-1.5" />
              J&apos;ai reçu le relevé de sinistralité
            </Button>
          </div>
        ) : (
          <RelanceRow label="Relance J+14" date={j14Date} available={false} done={false} locked />
        )}

        {/* Appel courtier J+28 */}
        {appellDone ? (
          <RelanceRow label="Appeler le courtier" date={j28Date} available done />
        ) : relance2Done ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 p-3 rounded-xl border",
              j28Available
                ? "border-[#F5C97A] bg-[#FFF7EB]"
                : "border-[#E8E8EC] bg-[#F7F7F8]"
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <Phone
                  className={cn(
                    "h-4 w-4",
                    j28Available ? "text-[#955804]" : "text-[#A2A1AF]"
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    j28Available ? "text-[#955804]" : "text-[#A2A1AF]"
                  )}
                >
                  J+28 — Appeler le courtier
                </span>
              </div>
              <p className="text-xs text-[#A2A1AF] mt-0.5 ml-6">
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
                j28Available && "bg-[#955804] hover:bg-[#7a4903] text-white border-[#955804]"
              )}
            >
              Créer la tâche
            </Button>
          </div>
        ) : (
          <RelanceRow label="J+28 — Appeler le courtier" date={j28Date} available={false} done={false} locked />
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
          done ? "bg-[#EFFBF2]" : "bg-[#F7F7F8]"
        )}
      >
        <CheckCircle2
          className={cn("h-3 w-3", done ? "text-[#13762C]" : "text-[#A2A1AF]")}
        />
      </div>
      <div>
        <span className="text-sm text-[#26262C]">{label}</span>
        {date && (
          <span className="text-xs text-[#A2A1AF] ml-2">{formatDate(date)}</span>
        )}
        {sub && <p className="text-xs text-[#A2A1AF]">{sub}</p>}
      </div>
    </div>
  );
}

function RelanceRow({
  label,
  date,
  available,
  done,
  locked,
  onAction,
  actionLabel,
  isOpen,
}: {
  label: string;
  date: Date;
  available: boolean;
  done: boolean;
  locked?: boolean;
  onAction?: () => void;
  actionLabel?: string;
  isOpen?: boolean;
}) {
  if (done) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#A2A1AF]">
        <CheckCircle2 className="h-3.5 w-3.5 text-[#13762C] flex-shrink-0" />
        <span>{label} — envoyée</span>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#E8E8EC] bg-[#F7F7F8] opacity-50">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#A2A1AF]" />
          <span className="text-sm font-medium text-[#A2A1AF]">{label}</span>
        </div>
        <span className="text-xs text-[#A2A1AF]">Disponible après l&apos;étape précédente</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 p-3 rounded-xl border",
        available ? "border-[#8784FD] bg-[#F5F5FF]" : "border-[#E8E8EC] bg-[#F7F7F8]"
      )}
    >
      <div className="flex items-center gap-2">
        <Clock
          className={cn("h-4 w-4", available ? "text-[#4E49FC]" : "text-[#A2A1AF]")}
        />
        <div>
          <span
            className={cn(
              "text-sm font-medium",
              available ? "text-[#4E49FC]" : "text-[#A2A1AF]"
            )}
          >
            {label}
          </span>
          {!available && (
            <p className="text-xs text-[#A2A1AF]">Disponible le {formatDate(date)}</p>
          )}
        </div>
      </div>
      {onAction && (
        <Button
          size="sm"
          variant="outline"
          onClick={onAction}
          className="border-[#8784FD] text-[#4E49FC] hover:bg-[#F5F5FF]"
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
  const [suiviOpen, setSuiviOpen] = useState(false);
  const [mail1Open, setMail1Open] = useState(false);

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

  // Auto-open the suivi panel once the first draft is confirmed from the server
  const autoOpen = !!firstDraftEvent && !suiviOpen;
  const panelOpen = firstDraftEvent ? (suiviOpen || autoOpen) : suiviOpen;

  return (
    <div className="space-y-5">
      {/* First email form — collapsible once sent */}
      {!hasSent ? (
        <FirstEmailForm
          pipelineId={pipelineId}
          copro={copro}
          onSent={(to) => {
            setLocalSentTo(to);
            setSuiviOpen(true);
          }}
        />
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <button
            onClick={() => setMail1Open((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-[#EFFBF2] hover:bg-[#d8f5e3] text-left"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#13762C]" />
              <span className="text-sm font-medium text-[#13762C]">Mail 1 envoyé</span>
              {firstDraftEvent && (
                <span className="text-xs text-[#13762C] opacity-70">
                  {new Date(firstDraftEvent.createdAt).toLocaleString("fr-FR", {
                    timeZone: "Europe/Paris",
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
              )}
            </div>
            {mail1Open ? <ChevronUp className="h-4 w-4 text-[#13762C]" /> : <ChevronDown className="h-4 w-4 text-[#13762C]" />}
          </button>
          {mail1Open && (
            <div className="p-4 border-t">
              <FirstEmailForm
                pipelineId={pipelineId}
                copro={copro}
                onSent={(to) => {
                  setLocalSentTo(to);
                  setSuiviOpen(true);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Optimistic state: sent locally but server not yet revalidated */}
      {hasSent && !firstDraftEvent && (
        <div className="text-center py-4">
          <div className="h-10 w-10 rounded-full bg-[#EFFBF2] flex items-center justify-center mx-auto mb-2">
            <Send className="h-5 w-5 text-[#13762C]" />
          </div>
          <p className="font-medium text-[#26262C] text-sm">Mail envoyé via Front</p>
          <p className="text-xs text-[#A2A1AF] mt-1">La page va se rafraîchir…</p>
        </div>
      )}

      {/* Suivi & relances — always shown, locked until first email sent */}
      <div className="border border-[#E8E8EC] rounded-xl overflow-hidden">
        <button
          onClick={() => hasSent && setSuiviOpen(!panelOpen)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
            hasSent ? "hover:bg-[#F7F7F8] cursor-pointer" : "cursor-default",
            panelOpen ? "bg-[#F7F7F8]" : "bg-white"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className={cn("h-4 w-4", hasSent ? "text-[#4E49FC]" : "text-[#A2A1AF]")} />
            <span className={cn("text-sm font-medium", hasSent ? "text-[#26262C]" : "text-[#A2A1AF]")}>
              Suivi des relances
            </span>
            {!hasSent && (
              <span className="text-xs text-[#A2A1AF] bg-[#F7F7F8] px-2 py-0.5 rounded-full">
                Disponible après envoi du 1er mail
              </span>
            )}
            {hasSent && relance1Event && !relance2Event && (
              <span className="text-xs text-[#4E49FC] bg-[#F5F5FF] px-2 py-0.5 rounded-full">Relance 1 envoyée</span>
            )}
            {hasSent && relance2Event && (
              <span className="text-xs text-[#4E49FC] bg-[#F5F5FF] px-2 py-0.5 rounded-full">Relance 2 envoyée</span>
            )}
          </div>
          {hasSent && (
            panelOpen
              ? <ChevronUp className="h-4 w-4 text-[#A2A1AF]" />
              : <ChevronDown className="h-4 w-4 text-[#A2A1AF]" />
          )}
        </button>

        {panelOpen && firstDraftEvent && (
          <div className="px-4 pb-4 pt-2 border-t border-[#E8E8EC]">
            <PostSendPanel
              pipelineId={pipelineId}
              copro={copro}
              firstDraftEvent={firstDraftEvent}
              relance1Event={relance1Event}
              relance2Event={relance2Event}
              appellTaskEvent={appellTaskEvent}
              localSentTo={localSentTo}
            />
          </div>
        )}
      </div>
    </div>
  );
}
