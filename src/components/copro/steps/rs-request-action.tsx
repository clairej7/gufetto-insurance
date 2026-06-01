"use client";

import { useState, useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, X, Upload, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
}

type DroppedFile = { file: File; name: string };

function formatDate(date: Date | null): string {
  if (!date) return "date inconnue";
  return new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function buildEmailTemplate(copro: RSRequestActionProps["copro"]): string {
  return `Bonjour,

Je me permets de vous contacter en tant que syndic professionnel de la copropriété ${copro.nom}${copro.adresse ? `, située ${copro.adresse}` : ""}.

Dans le cadre du renouvellement du contrat d'assurance MRI arrivant à échéance le ${formatDate(copro.dateEcheance)}, nous souhaitons étudier les conditions de renouvellement.

Pourriez-vous nous faire parvenir le relevé de sinistralité des 3 dernières années dans les meilleurs délais ? Vous trouverez en pièce jointe notre mandat de syndic ainsi que le contrat d'assurance actuel.

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onDrop(dropped);
  }, [onDrop]);

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
        isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      )}
    >
      <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
    </div>
  );
}

export function RSRequestAction({ pipelineId, copro }: RSRequestActionProps) {
  const [isPending, startTransition] = useTransition();
  const [contratFile, setContratFile] = useState<DroppedFile | null>(null);
  const [pvFile, setPvFile] = useState<DroppedFile | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState(`Demande de relevé de sinistralité – ${copro.nom}`);
  const [body, setBody] = useState(() => buildEmailTemplate(copro));
  const [sent, setSent] = useState(false);

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

      const res = await fetch("/api/front/draft", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        if (data.fallback && data.mailtoUrl) {
          window.open(data.mailtoUrl, "_blank");
          toast.success("Client mail ouvert (Front pas encore configuré)");
        } else {
          toast.success("Brouillon créé dans Front !");
        }
        setSent(true);
      } else {
        toast.error(data.error || "Erreur lors de la création du brouillon");
      }
    });
  }

  if (sent) {
    return (
      <div className="text-center py-6">
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <Send className="h-6 w-6 text-green-600" />
        </div>
        <p className="font-medium text-gray-800">Brouillon créé dans Front</p>
        <p className="text-sm text-gray-400 mt-1">Le mail est prêt à être envoyé depuis Front</p>
        <button onClick={() => setSent(false)} className="text-xs text-blue-500 mt-3 hover:underline">
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Documents */}
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

      {/* To */}
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

      {/* Subject */}
      <div>
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Objet
        </Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1"
        />
      </div>

      {/* Body */}
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

      {/* Send */}
      <Button
        onClick={handleSend}
        disabled={isPending}
        className="w-full"
        size="lg"
      >
        {isPending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Création du brouillon...</>
        ) : (
          <><Send className="h-4 w-4 mr-2" />Créer le brouillon dans Front</>
        )}
      </Button>
    </div>
  );
}
