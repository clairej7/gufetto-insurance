"use client";

import { useState, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, ChevronRight, FileText, Paperclip, Upload, X } from "lucide-react";
import { updateCoproCaracteristiques, logDevisSent, advanceStatut } from "@/lib/actions";
import { toast } from "sonner";

type DroppedFile = { file: File; name: string };

function DropZone({
  label,
  hint,
  required,
  file,
  onDrop,
  onRemove,
}: {
  label: string;
  hint: string;
  required?: boolean;
  file: DroppedFile | null;
  onDrop: (file: File) => void;
  onRemove: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onDrop(dropped);
  }, [onDrop]);
  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.png,.jpg";
    input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onDrop(f); };
    input.click();
  }, [onDrop]);

  if (file) {
    return (
      <div className="flex items-center gap-3 p-3 bg-[#EFFBF2] border border-[#BBF1C8] rounded-xl">
        <FileText className="h-5 w-5 text-[#13762C] flex-shrink-0" />
        <span className="text-sm text-[#13762C] truncate flex-1">{file.name}</span>
        <button onClick={onRemove}><X className="h-4 w-4 text-[#13762C]" /></button>
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
        isDragging ? "border-[#8784FD] bg-[#F5F5FF]" : "border-[#E8E8EC] hover:border-[#A2A1AF] hover:bg-[#F7F7F8]"
      )}
    >
      <Upload className="h-5 w-5 text-[#A2A1AF] mx-auto mb-1" />
      <p className="text-sm font-medium" style={{ color: "#656576" }}>
        {label}{required && <span className="ml-1" style={{ color: "#4E49FC" }}>*</span>}
      </p>
      <p className="text-xs mt-0.5" style={{ color: "#A2A1AF" }}>{hint}</p>
    </div>
  );
}

type Assureur = "axa" | "mila";

const ACTIVITES_AGGRAVANTES = [
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

const CARACTERISTIQUES_PARTICULIERES = [
  "Présence d'amiante",
  "Ossature / façade / parement en bois (> 10%)",
  "Arrêté de péril en cours",
  "Monument historique",
  "Logements sociaux ou HLM",
  "Immeuble squatté",
  "Immeuble en cours de construction ou démolition",
  "Aucune",
];

const PERIODES_CONSTRUCTION = [
  { id: "avant_1950", label: "Avant 1950" },
  { id: "1950_1970", label: "1950 – 1970" },
  { id: "1970_1985", label: "1970 – 1985" },
  { id: "1985_2000", label: "1985 – 2000" },
  { id: "apres_2000", label: "Après 2000" },
  { id: "inconnue", label: "Inconnue" },
];

const NATURES_OCCUPATION = [
  { id: "habitation", label: "Habitation" },
  { id: "mixte", label: "Mixte" },
  { id: "professionnelle", label: "Professionnelle" },
];

const PROPORTIONS_INOCCUPEE = [
  { id: "moins_25", label: "Moins de 25%" },
  { id: "25_50", label: "Entre 25% et 50%" },
  { id: "50_75", label: "Entre 50% et 75%" },
  { id: "plus_75", label: "Plus de 75%" },
];

function EmailLogCard({ assureur, to, body, date }: { assureur: string; to: string; body: string | null; date: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E8E8EC" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "#EFFBF2" }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#13762C" }} />
          <span className="text-sm font-medium" style={{ color: "#13762C" }}>
            Mail envoyé à {assureur}
          </span>
          <span className="text-xs" style={{ color: "#13762C", opacity: 0.7 }}>{date}</span>
        </div>
        {body && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-xs underline"
            style={{ color: "#13762C" }}
          >
            {expanded ? "Masquer" : "Voir le contenu"}
          </button>
        )}
      </div>
      <div className="px-4 py-2 text-sm" style={{ color: "#656576" }}>
        Destinataire : <span style={{ color: "#26262C" }}>{to}</span>
      </div>
      {expanded && body && (
        <div className="px-4 pb-3 border-t" style={{ borderColor: "#E8E8EC" }}>
          <pre className="text-xs mt-2 whitespace-pre-wrap leading-relaxed" style={{ color: "#26262C", fontFamily: "inherit" }}>
            {body}
          </pre>
        </div>
      )}
    </div>
  );
}

interface DevisEvent {
  id: string;
  createdAt: Date;
  metadata?: unknown;
}

interface DevisRequestActionProps {
  pipelineId: string;
  coproId: string;
  devisEvents: DevisEvent[];
  userName?: string;
  copro: {
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    primeActuelle: number | null;
    surfaceDeveloppee: number | null;
    periodeConstruction: string | null;
    natureOccupation: string | null;
    activitesAggravantes: string | null;
    caracteristiquesParticulieres: string | null;
    proportionInoccupee: string | null;
    protectionJuridique: string | null;
    assureursDevis: string | null;
  };
}

type Step = "assureurs" | "formulaire" | "preview";

function parseMulti(val: string | null): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return val.split(",").map(s => s.trim()).filter(Boolean); }
}

function ChoiceButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2",
        selected
          ? "border-[#4E49FC] bg-[#F0EFFF]"
          : "border-[#E8E8EC] bg-white hover:border-[#C5C4F0]"
      )}
      style={{ color: selected ? "#4E49FC" : "#26262C" }}
    >
      <span
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center",
          selected ? "border-[#4E49FC] bg-[#4E49FC]" : "border-[#C5C4D0]"
        )}
      >
        {selected && <Check className="h-3 w-3 text-white" />}
      </span>
      {label}
    </button>
  );
}

function RadioButton({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-2",
        selected
          ? "border-[#4E49FC] bg-[#F0EFFF]"
          : "border-[#E8E8EC] bg-white hover:border-[#C5C4F0]"
      )}
      style={{ color: selected ? "#4E49FC" : "#26262C" }}
    >
      <span
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
          selected ? "border-[#4E49FC]" : "border-[#C5C4D0]"
        )}
      >
        {selected && <span className="w-2.5 h-2.5 rounded-full bg-[#4E49FC]" />}
      </span>
      {label}
    </button>
  );
}


export function DevisRequestAction({ pipelineId, coproId, devisEvents, copro, userName }: DevisRequestActionProps) {
  function initAssureurs(): Set<Assureur> {
    try {
      const saved = copro.assureursDevis ? JSON.parse(copro.assureursDevis) as Assureur[] : [];
      return new Set(saved);
    } catch { return new Set(); }
  }

  const [step, setStep] = useState<Step>(() => copro.assureursDevis ? "formulaire" : "assureurs");
  const [assureurs, setAssureurs] = useState<Set<Assureur>>(initAssureurs);
  const [activeTab, setActiveTab] = useState<Assureur>(() => {
    try {
      const saved = copro.assureursDevis ? JSON.parse(copro.assureursDevis) as Assureur[] : [];
      return saved[0] ?? "axa";
    } catch { return "axa"; }
  });

  // Formulaire — pré-rempli depuis la base
  const [assureurActuel, setAssureurActuel] = useState(copro.assureurActuel ?? "");
  const [primeActuelle, setPrimeActuelle] = useState(copro.primeActuelle?.toString() ?? "");
  const [surface, setSurface] = useState(copro.surfaceDeveloppee?.toString() ?? "");
  const [periode, setPeriode] = useState<string | null>(copro.periodeConstruction ?? null);
  const [nature, setNature] = useState<string | null>(copro.natureOccupation ?? null);
  const [activites, setActivites] = useState<string[]>(parseMulti(copro.activitesAggravantes));
  const [caracteristiques, setCaracteristiques] = useState<string[]>(parseMulti(copro.caracteristiquesParticulieres));
  const [proportion, setProportion] = useState<string>(copro.proportionInoccupee ?? "moins_25");
  const [protectionJuridique, setProtectionJuridique] = useState<boolean | null>(
    copro.protectionJuridique === "oui" ? true : copro.protectionJuridique === "non" ? false : null
  );
  const [contratFile, setContratFile] = useState<DroppedFile | null>(null);
  const [rsFile, setRsFile] = useState<DroppedFile | null>(null);

  // Champs destinataires + corps dans la prévisualisation
  const [emailAxa, setEmailAxa] = useState("achille.leboeuf@axa.fr");
  const [emailMila, setEmailMila] = useState("souscription@mila.fr");
  const [bodyAxa, setBodyAxa] = useState("");
  const [bodyMila, setBodyMila] = useState("");

  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [showLog, setShowLog] = useState(true);

  // Events de devis déjà envoyés
  const sentEvents = devisEvents.filter(e => {
    const m = e.metadata as Record<string, unknown> | null;
    return m?.devisType === "devis_sent";
  });
  const hasSentBefore = sentEvents.length > 0;

  function toggleAssureur(id: Assureur | "les_deux") {
    if (id === "les_deux") { setAssureurs(new Set(["axa", "mila"])); return; }
    setAssureurs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleMulti(list: string[], setList: (v: string[]) => void, value: string) {
    if (value === "Aucune") { setList(["Aucune"]); return; }
    const next = list.filter(v => v !== "Aucune");
    if (next.includes(value)) setList(next.filter(v => v !== value));
    else setList([...next, value]);
  }

  function isAssureurSelected(id: Assureur | "les_deux") {
    if (id === "les_deux") return assureurs.has("axa") && assureurs.has("mila");
    return assureurs.has(id);
  }

  const assureurLabel =
    assureurs.size === 2 ? "AXA + Mila"
    : assureurs.has("axa") ? "AXA"
    : assureurs.has("mila") ? "Mila"
    : null;

  const formValid =
    surface.trim() !== "" &&
    periode !== null &&
    nature !== null &&
    activites.length > 0 &&
    caracteristiques.length > 0 &&
    proportion !== "" &&
    protectionJuridique !== null &&
    contratFile !== null &&
    rsFile !== null;

  async function sendOneEmail(assureur: Assureur, email: string, body: string) {
    const formData = new FormData();
    formData.append("to", email);
    formData.append("subject", "Matera - demande de devis MRI");
    formData.append("body", body);
    formData.append("refTag", `${pipelineId}:devis_${assureur}`);
    if (contratFile) formData.append("contrat", contratFile.file, contratFile.name);
    if (rsFile) formData.append("pv", rsFile.file, rsFile.name);
    const res = await fetch("/api/front/draft", { method: "POST", body: formData });
    return res.json() as Promise<{ success: boolean; fallback?: boolean; mailtoUrl?: string; error?: string; conversationId?: string }>;
  }

  function handleSendDevis() {
    startTransition(async () => {
      await updateCoproCaracteristiques(coproId, pipelineId, {
        assureurActuel: assureurActuel.trim() || null,
        primeActuelle: parseFloat(primeActuelle) || null,
        surfaceDeveloppee: parseFloat(surface) || null,
        periodeConstruction: periode,
        natureOccupation: nature,
        activitesAggravantes: JSON.stringify(activites),
        caracteristiquesParticulieres: JSON.stringify(caracteristiques),
        proportionInoccupee: proportion || null,
        protectionJuridique: protectionJuridique === true ? "oui" : protectionJuridique === false ? "non" : null,
        assureursDevis: JSON.stringify(Array.from(assureurs)),
      });

      const toSend: { assureur: Assureur; email: string; body: string }[] = [];
      if (assureurs.has("axa")) toSend.push({ assureur: "axa", email: emailAxa, body: bodyAxa });
      if (assureurs.has("mila")) toSend.push({ assureur: "mila", email: emailMila, body: bodyMila });

      let allOk = true;
      for (const { assureur, email, body } of toSend) {
        const data = await sendOneEmail(assureur, email, body);
        if (data.success) {
          if (data.fallback && data.mailtoUrl) window.open(data.mailtoUrl, "_blank");
          await logDevisSent(pipelineId, assureur, email, body, data.conversationId);
        } else {
          allOk = false;
          toast.error(`Erreur envoi ${assureur.toUpperCase()} : ${data.error ?? "inconnu"}`);
        }
      }

      if (allOk) {
        setSent(true);
        await advanceStatut(pipelineId, true);
        toast.success(
          toSend.length === 2
            ? "Demandes de devis envoyées à AXA et Mila !"
            : `Demande de devis envoyée à ${toSend[0].assureur.toUpperCase()} !`
        );
      }
    });
  }

  function generateEmailBody(): string {
    const pLabel = PERIODES_CONSTRUCTION.find(p => p.id === periode)?.label ?? periode ?? "Non renseignée";
    const nLabel = NATURES_OCCUPATION.find(n => n.id === nature)?.label ?? nature ?? "Non renseignée";
    const prLabel = PROPORTIONS_INOCCUPEE.find(p => p.id === proportion)?.label ?? proportion ?? "Non renseignée";
    const actLabel = activites.length > 0 ? activites.join(", ") : "Aucune";
    const caracLabel = caracteristiques.length > 0 ? caracteristiques.join(", ") : "Aucune";
    const surfLabel = surface.trim() ? `${surface} m²` : "Non renseignée";
    const primeLabel = primeActuelle.trim() ? `${primeActuelle} €` : "Non renseignées";
    const pjLabel = protectionJuridique === true ? "Oui" : protectionJuridique === false ? "Non" : "Non renseigné";

    return [
      "Bonjour,",
      "",
      "Pourriez-vous nous adresser un devis d'assurance pour la copropriété dont vous trouverez les informations ci-dessous :",
      "",
      `- Mode de gestion de la copropriété : Syndic professionnel`,
      `- Adresse de la copropriété : ${copro.adresse ?? "—"}`,
      `- Nom du souscripteur : Matera`,
      `- Surface développée : ${surfLabel}`,
      `- Date de construction approximative : ${pLabel}`,
      `- Nature de l'occupation : ${nLabel}`,
      `- Activités aggravantes ou réservées : ${actLabel}`,
      `- Caractéristiques complémentaires : ${caracLabel}`,
      `- Proportion de logements inoccupés : ${prLabel}`,
      `- Assureur actuel : ${assureurActuel.trim() || "—"}`,
      `- Dernières primes payées : ${primeLabel}`,
      `- Intérêt pour la protection juridique : ${pjLabel}`,
      "",
      "Merci d'avance,",
      "Excellente journée,",
      "",
      userName ?? "L'équipe Matera",
      "Matera",
    ].join("\n");
  }

  // ─── Vue log (emails déjà envoyés) ─────────────────────────────────────────
  if (hasSentBefore && showLog) {
    return (
      <div className="space-y-4">
        {sentEvents.map(e => {
          const m = e.metadata as Record<string, unknown>;
          const assureur = (m.assureur as string ?? "").toUpperCase();
          const to = m.to as string ?? "";
          const body = m.body as string | null;
          const date = new Date(e.createdAt).toLocaleString("fr-FR", {
            timeZone: "Europe/Paris",
            day: "2-digit", month: "2-digit", year: "2-digit",
            hour: "2-digit", minute: "2-digit", hour12: false,
          });
          return (
            <EmailLogCard key={e.id} assureur={assureur} to={to} body={body} date={date} />
          );
        })}
        <button
          type="button"
          onClick={() => setShowLog(false)}
          className="w-full text-sm py-2 rounded-lg border-2 border-dashed transition-colors hover:border-[#4E49FC] hover:text-[#4E49FC]"
          style={{ borderColor: "#E8E8EC", color: "#A2A1AF" }}
        >
          Renvoyer / recommencer une demande de devis
        </button>
      </div>
    );
  }

  // ─── Étape 1 : choix assureur ───────────────────────────────────────────────
  if (step === "assureurs") {
    return (
      <div>
        <p className="text-sm mb-4" style={{ color: "#656576" }}>
          À quel(s) assureur(s) souhaites-tu demander un devis ?
        </p>
        <div className="flex gap-3 mb-6">
          {(["axa", "mila", "les_deux"] as const).map((id) => {
            const label = id === "axa" ? "AXA" : id === "mila" ? "Mila" : "Les deux";
            const sel = isAssureurSelected(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleAssureur(id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all",
                  sel ? "border-[#4E49FC] bg-[#F0EFFF]" : "border-[#E8E8EC] bg-white hover:border-[#C5C4F0]"
                )}
                style={{ color: sel ? "#4E49FC" : "#26262C" }}
              >
                {sel && <Check className="h-4 w-4" />}
                {label}
              </button>
            );
          })}
        </div>
        <Button
          disabled={assureurs.size === 0}
          onClick={() => setStep("formulaire")}
          className="w-full font-medium flex items-center gap-2"
          style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
        >
          Continuer{assureurLabel && <span className="opacity-75">({assureurLabel})</span>}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ─── Étape 2 : formulaire ───────────────────────────────────────────────────
  if (step === "formulaire") {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setStep("assureurs")}
          className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-70"
          style={{ color: "#A2A1AF" }}
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Changer d&apos;assureur
        </button>

        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
          Informations pour la demande de devis — {assureurLabel}
        </p>

        {/* Assureur actuel */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Assureur actuel
          </Label>
          <Input
            placeholder="Ex : Allianz"
            value={assureurActuel}
            onChange={e => setAssureurActuel(e.target.value)}
          />
        </div>

        {/* Dernières primes payées */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Dernières primes payées
          </Label>
          <div className="relative">
            <Input
              type="number"
              placeholder="Ex : 3 500"
              value={primeActuelle}
              onChange={e => setPrimeActuelle(e.target.value)}
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#A2A1AF" }}>€</span>
          </div>
        </div>

        {/* Surface */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Surface développée <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <div className="relative">
            <Input
              type="number"
              placeholder="Ex : 1 200"
              value={surface}
              onChange={e => setSurface(e.target.value)}
              className="pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#A2A1AF" }}>m²</span>
          </div>
        </div>

        {/* Période de construction */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Période de construction <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <Select value={periode} onValueChange={v => setPeriode(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionner une période">
                {PERIODES_CONSTRUCTION.find(p => p.id === periode)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PERIODES_CONSTRUCTION.map(({ id, label }) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Nature occupation */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Nature de l&apos;occupation <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <Select value={nature} onValueChange={v => setNature(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionner une nature">
                {NATURES_OCCUPATION.find(n => n.id === nature)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {NATURES_OCCUPATION.map(({ id, label }) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Activités aggravantes */}
        <div className="space-y-2">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Activités aggravantes <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <p className="text-xs" style={{ color: "#A2A1AF" }}>Choix multiple</p>
          <div className="space-y-1.5">
            {ACTIVITES_AGGRAVANTES.map(label => (
              <ChoiceButton
                key={label}
                label={label}
                selected={activites.includes(label)}
                onClick={() => toggleMulti(activites, setActivites, label)}
              />
            ))}
          </div>
        </div>

        {/* Caractéristiques particulières */}
        <div className="space-y-2">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Caractéristiques particulières <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <p className="text-xs" style={{ color: "#A2A1AF" }}>Choix multiple</p>
          <div className="space-y-1.5">
            {CARACTERISTIQUES_PARTICULIERES.map(label => (
              <ChoiceButton
                key={label}
                label={label}
                selected={caracteristiques.includes(label)}
                onClick={() => toggleMulti(caracteristiques, setCaracteristiques, label)}
              />
            ))}
          </div>
        </div>

        {/* Proportion inoccupée */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Proportion de logements inoccupés <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <Select value={proportion} onValueChange={v => setProportion(v ?? "moins_25")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Moins de 25%">
                {PROPORTIONS_INOCCUPEE.find(p => p.id === proportion)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PROPORTIONS_INOCCUPEE.map(({ id, label }) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Protection juridique */}
        <div className="space-y-2">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Besoin d&apos;un contrat de protection juridique <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <RadioButton label="Oui" selected={protectionJuridique === true} onClick={() => setProtectionJuridique(true)} />
            <RadioButton label="Non" selected={protectionJuridique === false} onClick={() => setProtectionJuridique(false)} />
          </div>
        </div>

        {/* Documents obligatoires */}
        <div className="space-y-2">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Documents à joindre
          </Label>
          <div className="space-y-2">
            <DropZone
              label="Contrat d'assurance actuel"
              hint="Glisse le fichier ici ou clique pour parcourir"
              required
              file={contratFile}
              onDrop={f => setContratFile({ file: f, name: f.name })}
              onRemove={() => setContratFile(null)}
            />
            <DropZone
              label="Relevé de sinistralité"
              hint="Glisse le fichier ici ou clique pour parcourir"
              required
              file={rsFile}
              onDrop={f => setRsFile({ file: f, name: f.name })}
              onRemove={() => setRsFile(null)}
            />
          </div>
        </div>

        <div className="pt-2">
          <Button
            disabled={!formValid}
            onClick={() => {
              const body = generateEmailBody();
              setBodyAxa(body);
              setBodyMila(body);
              setActiveTab(assureurs.has("axa") ? "axa" : "mila");
              setStep("preview");
            }}
            className="w-full font-medium flex items-center gap-2"
            style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
          >
            Prévisualiser le mail pour les assureurs
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── Étape 3 : prévisualisation ─────────────────────────────────────────────
  const bothAssureurs = assureurs.has("axa") && assureurs.has("mila");

  const emailForTab = activeTab === "axa" ? emailAxa : emailMila;
  const setEmailForTab = activeTab === "axa" ? setEmailAxa : setEmailMila;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setStep("formulaire")}
        className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-70"
        style={{ color: "#A2A1AF" }}
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        Retour au formulaire
      </button>

      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
        Prévisualisation du mail
      </p>

      {/* Onglets si les deux assureurs */}
      {bothAssureurs && (
        <div className="flex gap-2">
          {(["axa", "mila"] as Assureur[]).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => setActiveTab(a)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all",
                activeTab === a
                  ? "border-[#4E49FC] bg-[#F0EFFF]"
                  : "border-[#E8E8EC] bg-white hover:border-[#C5C4F0]"
              )}
              style={{ color: activeTab === a ? "#4E49FC" : "#656576" }}
            >
              {a === "axa" ? "AXA" : "Mila"}
            </button>
          ))}
          {bothAssureurs && (
            <span className="ml-auto text-xs self-center" style={{ color: "#A2A1AF" }}>
              2 emails distincts seront envoyés
            </span>
          )}
        </div>
      )}

      {/* Destinataire */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
          Destinataire — {activeTab === "axa" ? "AXA" : "Mila"}
        </Label>
        <Input
          type="email"
          placeholder={activeTab === "axa" ? "email@axa.fr" : "email@mila.fr"}
          value={emailForTab}
          onChange={e => setEmailForTab(e.target.value)}
        />
      </div>

      {/* Objet */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium" style={{ color: "#26262C" }}>Objet</Label>
        <div
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: "#F7F7F8", color: "#26262C" }}
        >
          Matera - demande de devis MRI
        </div>
      </div>

      {/* Corps du mail — éditable */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium" style={{ color: "#26262C" }}>Corps du mail</Label>
        <textarea
          value={activeTab === "axa" ? bodyAxa : bodyMila}
          onChange={e => activeTab === "axa" ? setBodyAxa(e.target.value) : setBodyMila(e.target.value)}
          rows={22}
          className="w-full rounded-xl border px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#4E49FC] focus:border-transparent font-[inherit]"
          style={{ background: "#FAFAFA", borderColor: "#E8E8EC", color: "#26262C" }}
        />
      </div>

      {/* Pièces jointes */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
          <Paperclip className="inline h-4 w-4 mr-1" style={{ verticalAlign: "middle" }} />
          Pièces jointes
        </Label>
        <div className="space-y-1.5">
          {contratFile && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: "#F0EFFF" }}>
              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#4E49FC" }} />
              <span style={{ color: "#4E49FC" }}>{contratFile.name}</span>
            </div>
          )}
          {rsFile && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: "#F0EFFF" }}>
              <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#4E49FC" }} />
              <span style={{ color: "#4E49FC" }}>{rsFile.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bouton d'envoi */}
      <div className="pt-2">
        {sent ? (
          <div
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm"
            style={{ backgroundColor: "#EFFBF2", color: "#13762C" }}
          >
            <CheckCircle2 className="h-4 w-4" />
            {bothAssureurs ? "Demandes envoyées à AXA et Mila" : `Demande envoyée à ${assureurs.has("axa") ? "AXA" : "Mila"}`}
          </div>
        ) : bothAssureurs ? (
          <div className="space-y-2">
            <Button
              disabled={!emailAxa.trim() || !emailMila.trim() || isPending}
              onClick={handleSendDevis}
              className="w-full font-medium"
              style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
            >
              {isPending ? "Envoi en cours…" : "Envoyer à AXA et Mila"}
            </Button>
            {(!emailAxa.trim() || !emailMila.trim()) && (
              <p className="text-xs text-center" style={{ color: "#A2A1AF" }}>
                Renseigne les deux adresses email pour envoyer
              </p>
            )}
          </div>
        ) : (
          <Button
            disabled={!emailForTab.trim() || isPending}
            onClick={handleSendDevis}
            className="w-full font-medium"
            style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
          >
            {isPending ? "Envoi en cours…" : `Envoyer à ${assureurs.has("axa") ? "AXA" : "Mila"}`}
          </Button>
        )}
      </div>
    </div>
  );
}
