"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { logInsureurEmailSent } from "@/lib/actions";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, FileText, ChevronDown, ChevronUp, Clock, Upload } from "lucide-react";

interface SentEvent {
  id: string;
  createdAt: Date;
  metadata?: unknown;
}

interface ContratSigneActionProps {
  pipelineId: string;
  signedPdfUrl: string | null;
  devisRecommande: { assureur: string; primeTTC: number } | null;
  copro: { nom: string; adresse: string | null; gestionnaireEmail: string | null };
  sentEvents: SentEvent[];
}

const INSURER_EMAILS: Record<string, string> = {
  AXA: "achille.leboeuf@axa.fr",
  MILA: "souscription@mila.fr",
};

function getDefaultEmail(assureur: string): string {
  const key = Object.keys(INSURER_EMAILS).find((k) => assureur.toUpperCase().includes(k));
  return key ? INSURER_EMAILS[key] : "";
}

function formatGestionnaireNom(email: string | null | undefined): string {
  if (!email) return "L'équipe Matera";
  const local = email.split("@")[0];
  return local.split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function buildEmailBody(copro: { nom: string; adresse: string | null; gestionnaireEmail: string | null }): string {
  const adresse = copro.adresse ?? copro.nom;
  const gestionnaire = formatGestionnaireNom(copro.gestionnaireEmail);
  return `Bonjour,

Veuillez trouver ci-joint le contrat signé pour la souscription au contrat de MRI pour la copropriété située au ${adresse}.

Merci,

${gestionnaire}
Matera`;
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ContratSigneAction({
  pipelineId,
  signedPdfUrl,
  devisRecommande,
  copro,
  sentEvents,
}: ContratSigneActionProps) {
  const [body, setBody] = useState(buildEmailBody(copro));
  const [to, setTo] = useState(devisRecommande ? getDefaultEmail(devisRecommande.assureur) : "");
  const [subject, setSubject] = useState(`Matera - Souscription contrat MRI - ${copro.nom}`);
  const [isSending, setIsSending] = useState(false);
  const [showForm, setShowForm] = useState(sentEvents.length === 0);
  const [showEmailBody, setShowEmailBody] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [manualPdf, setManualPdf] = useState<File | null>(null);

  const latest = sentEvents[0];
  const previous = sentEvents.slice(1);
  const latestMeta = latest?.metadata as { to?: string; subject?: string; body?: string } | null;

  async function handleSend() {
    if (!to.trim() || !body.trim()) return;
    setIsSending(true);
    try {
      const formData = new FormData();
      formData.append("to", to);
      formData.append("subject", subject);
      formData.append("body", body);
      formData.append("refTag", `${pipelineId}:insureur`);
      if (signedPdfUrl) {
        formData.append("signedPdfPath", signedPdfUrl);
      } else if (manualPdf) {
        formData.append("contrat", manualPdf, manualPdf.name);
      }

      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const json = await res.json() as { success?: boolean; error?: string; conversationId?: string };
      if (json.success) {
        await logInsureurEmailSent(pipelineId, to, subject, body, json.conversationId);
        setShowForm(false);
        setShowEmailBody(false);
        toast.success(`Email envoyé à ${devisRecommande?.assureur} !`);
      } else {
        toast.error(json.error ?? "Erreur envoi");
      }
    } catch { toast.error("Erreur réseau"); }
    setIsSending(false);
  }

  return (
    <div className="space-y-4">
      {/* Info contrat signé / upload si absent */}
      {signedPdfUrl ? (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#EFFBF2" }}>
          <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#13762C" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#13762C" }}>
              Contrat {devisRecommande?.assureur} signé
            </p>
            <p className="text-xs" style={{ color: "#13762C" }}>
              PDF joint automatiquement à l&apos;envoi
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer rounded-xl border-2 border-dashed px-4 py-3 hover:opacity-80 transition-opacity"
            style={{ borderColor: "#E8E8EC", color: "#656576" }}>
            <Upload className="h-4 w-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {manualPdf ? (
                <p className="text-sm font-medium truncate" style={{ color: "#4E49FC" }}>{manualPdf.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">Joindre le contrat signé (PDF)</p>
                  <p className="text-xs" style={{ color: "#A2A1AF" }}>Aucun PDF signé trouvé — cliquez pour uploader</p>
                </>
              )}
            </div>
            <input type="file" accept=".pdf" className="hidden" onChange={(e) => setManualPdf(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      )}

      {/* Dernier envoi */}
      {latest && latestMeta && !showForm && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium flex-wrap" style={{ color: "#13762C" }}>
            <CheckCircle2 className="h-4 w-4" />
            Envoyé à <span style={{ color: "#26262C" }}>{latestMeta.to}</span>
            <span className="font-normal" style={{ color: "#A2A1AF" }}>· {fmtDate(latest.createdAt)}</span>
          </div>

          <button
            onClick={() => setShowEmailBody((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: "#8784FD" }}
          >
            {showEmailBody ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showEmailBody ? "Masquer l'email" : "Voir l'email envoyé"}
          </button>

          {showEmailBody && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "#A2A1AF" }}>Objet : {latestMeta.subject}</p>
              <div
                className="rounded-xl border p-3 text-xs leading-relaxed whitespace-pre-wrap"
                style={{ borderColor: "#E8E8EC", color: "#656576", background: "#FAFAFA" }}
              >
                {latestMeta.body}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="w-full text-sm"
              style={{ color: "#656576" }}
            >
              <Mail className="h-3.5 w-3.5 mr-2" />
              Renvoyer l&apos;email
            </Button>
          </div>
        </div>
      )}

      {/* Formulaire d'envoi */}
      {showForm && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium" style={{ color: "#656576" }}>Destinataire</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="souscription@assureur.fr"
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium" style={{ color: "#656576" }}>Objet</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium" style={{ color: "#656576" }}>Corps du mail — modifiable</p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded-xl border px-4 py-3 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#4E49FC] focus:border-transparent font-[inherit]"
              style={{ background: "#FAFAFA", borderColor: "#E8E8EC", color: "#26262C", fontSize: "0.95rem" }}
            />
          </div>

          <div className="flex gap-2">
            {sentEvents.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="flex-shrink-0">
                Annuler
              </Button>
            )}
            <Button
              onClick={handleSend}
              disabled={isSending || !to.trim()}
              className="flex-1"
              style={{ backgroundColor: "#4E49FC", color: "#fff" }}
            >
              {isSending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi en cours…</>
                : <><Mail className="h-4 w-4 mr-2" />Envoyer à {devisRecommande?.assureur}</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* Modale historique */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historique des envois</DialogTitle>
            <DialogDescription>Tous les emails envoyés au nouvel assureur pour ce dossier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {sentEvents.map((ev, i) => {
              const m = ev.metadata as { to?: string; subject?: string; body?: string } | null;
              return (
                <div key={ev.id} className="p-3 rounded-lg border space-y-2" style={{ borderColor: "#E8E8EC" }}>
                  <div className="flex items-center gap-2">
                    {i === 0 && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EFFBF2", color: "#13762C" }}>
                        Dernier
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "#A2A1AF" }}>{fmtDate(ev.createdAt)}</span>
                  </div>
                  <p className="text-sm" style={{ color: "#26262C" }}>À : {m?.to ?? "—"}</p>
                  <p className="text-xs" style={{ color: "#A2A1AF" }}>{m?.subject ?? "—"}</p>
                  {m?.body && (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap rounded-lg p-2" style={{ background: "#FAFAFA", color: "#656576" }}>
                      {m.body}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
