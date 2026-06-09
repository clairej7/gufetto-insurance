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
import { logResiliationEmailSent } from "@/lib/actions";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface SentEvent {
  id: string;
  createdAt: Date;
  metadata?: unknown;
}

interface ResiliationActionProps {
  pipelineId: string;
  assureurActuel: string | null;
  copro: { nom: string; adresse: string | null; gestionnaireEmail: string | null; dateEcheance: Date | null; numeroContrat: string | null };
  sentEvents: SentEvent[];
}

function formatGestionnaireNom(email: string | null | undefined): string {
  if (!email) return "L'équipe Matera";
  const local = email.split("@")[0];
  return local.split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function buildEmailBody(
  copro: { nom: string; adresse: string | null; gestionnaireEmail: string | null; dateEcheance: Date | null; numeroContrat: string | null },
  assureurActuel: string | null
): string {
  const adresse = copro.adresse ?? copro.nom;
  const gestionnaire = formatGestionnaireNom(copro.gestionnaireEmail);
  const echeance = copro.dateEcheance
    ? new Date(copro.dateEcheance).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "[date d'échéance]";
  const assureur = assureurActuel ?? "[assureur actuel]";
  const contrat = ` n° ${copro.numeroContrat ?? "[contrat]"}`;

  return `Bonjour,

Nous vous contactons au nom de la copropriété située au ${adresse}, actuellement assurée auprès de ${assureur} (contrat${contrat}).

Par la présente, nous vous informons de notre décision de ne pas renouveler le contrat d'assurance MRI arrivant à échéance le ${echeance}.

Conformément aux dispositions légales, nous vous demandons de bien vouloir prendre acte de cette résiliation et de nous confirmer la bonne réception de ce courrier.

Cordialement,

${gestionnaire}
Matera`;
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ResiliationAction({
  pipelineId,
  assureurActuel,
  copro,
  sentEvents,
}: ResiliationActionProps) {
  const [body, setBody] = useState(buildEmailBody(copro, assureurActuel));
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(`Matera - Résiliation contrat MRI n° ${copro.numeroContrat ?? "[contrat]"}`);
  const [isSending, setIsSending] = useState(false);
  const [showForm, setShowForm] = useState(sentEvents.length === 0);
  const [showEmailBody, setShowEmailBody] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
      formData.append("refTag", `${pipelineId}:resiliation`);

      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const json = await res.json() as { success?: boolean; error?: string; conversationId?: string };
      if (json.success) {
        await logResiliationEmailSent(pipelineId, to, subject, body, json.conversationId);
        setShowForm(false);
        setShowEmailBody(false);
        toast.success(`Email de résiliation envoyé à ${assureurActuel ?? to} !`);
      } else {
        toast.error(json.error ?? "Erreur envoi");
      }
    } catch { toast.error("Erreur réseau"); }
    setIsSending(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#FFF8EC", border: "1px solid #FDDFA0" }}>
        <span className="text-lg leading-none mt-0.5">📮</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#7A4F00" }}>Courrier recommandé obligatoire</p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#A06A00" }}>
            En complément de cet email, la résiliation doit être envoyée par <strong>lettre recommandée avec accusé de réception</strong> à l&apos;assureur actuel.
          </p>
        </div>
      </div>
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
              placeholder={assureurActuel ? `Email de ${assureurActuel}` : "resiliation@assureur.fr"}
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
              rows={10}
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
                : <><Mail className="h-4 w-4 mr-2" />Envoyer la résiliation{assureurActuel ? ` à ${assureurActuel}` : ""}</>
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
            <DialogDescription>Tous les emails de résiliation envoyés pour ce dossier.</DialogDescription>
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
