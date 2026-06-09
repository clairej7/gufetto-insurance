"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  X,
  Star,
  CheckCircle2,
  Loader2,
  Mail,
  Sparkles,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import {
  addDevisRecu,
  deleteDevisRecu,
  setRecommandeDevis,
  saveContratActuelData,
  advanceStatut,
  logRecoSent,
} from "@/lib/actions";

async function uploadPdf(file: File, pipelineId: string): Promise<string | null> {
  try {
    const path = `devis/${pipelineId}/${Date.now()}-${file.name}`;
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("path", path);
    const res = await fetch("/api/storage/upload", { method: "POST", body: formData });
    const json = await res.json() as { success?: boolean; path?: string };
    return json.success ? json.path ?? null : null;
  } catch {
    return null;
  }
}
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

type ExtractedData = {
  assureur?: string;
  numeroContrat?: string | null;
  primeTTC?: number;
  primeHT?: number | null;
  franchiseIncendie?: string | null;
  franchiseDDE?: string | null;
  franchiseVol?: string | null;
  franchiseClimatique?: string | null;
  lci?: string | null;
  rcPlafond?: string | null;
  garanties?: {
    incendie?: boolean;
    dommagesElectriques?: boolean;
    evenementsClimatiques?: boolean;
    catastrophesNaturelles?: boolean;
    catastrophesTechnologiques?: boolean;
    degatsDesEaux?: boolean;
    vol?: boolean;
    brisDeGlace?: boolean;
    rc?: boolean;
    defenseRecours?: boolean;
    vandalisme?: boolean;
    effondrement?: boolean;
    brisDeMachines?: boolean;
    autresEvenements?: boolean;
    protectionJuridique?: boolean;
    protectionCS?: boolean;
    honoSyndic?: boolean;
  };
  pointsForts?: string[];
  pointsFaibles?: string[];
  _pdfName?: string;
};

type DevisRecu = {
  id: string;
  assureur: string;
  numeroContrat: string | null;
  primeTTC: number;
  data: string | null;
  notes: string | null;
  pdfName: string | null;
  recommande: boolean;
  createdAt: Date;
};

interface DevisRecusActionProps {
  pipelineId: string;
  devisRecus: DevisRecu[];
  contratActuelData: string | null;
  copro: {
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    primeActuelle: number | null;
    courtierActuel: string | null;
    contactCsEmail: string | null;
    contactCsNom: string | null;
    gestionnaireEmail: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseData(raw: string | null): ExtractedData {
  if (!raw) return {};
  try { return JSON.parse(raw) as ExtractedData; } catch { return {}; }
}

function formatPrime(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

async function extractPdf(file: File): Promise<ExtractedData> {
  const formData = new FormData();
  formData.append("pdf", file, file.name);
  const res = await fetch("/api/devis/extract", { method: "POST", body: formData });
  const json = await res.json() as { success?: boolean; data?: ExtractedData; error?: string };
  if (!json.success || !json.data) throw new Error(json.error ?? "Extraction échouée");
  return { ...json.data, _pdfName: file.name };
}

// ─── UploadZone ───────────────────────────────────────────────────────────────

function UploadZone({
  label,
  subtitle,
  file,
  onFile,
  disabled,
}: {
  label: string;
  subtitle?: string;
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleClick() {
    if (disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) onFile(f);
    };
    input.click();
  }

  if (file) {
    return (
      <div
        className="rounded-2xl border-2 p-5 space-y-3 transition-all"
        style={{ borderColor: "#4E49FC", background: "#F0EFFF" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8784FD" }}>
            {label}
          </p>
          {!disabled && (
            <button
              onClick={() => onFile(null)}
              className="rounded-full p-0.5 hover:opacity-70"
              style={{ color: "#8784FD" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#E8E7FF" }}>
            <FileText className="h-4 w-4" style={{ color: "#4E49FC" }} />
          </div>
          <p className="text-sm font-medium truncate" style={{ color: "#4E49FC" }}>{file.name}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#4E49FC" }}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Prêt pour l&apos;analyse
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={disabled ? undefined : handleClick}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={cn(
        "rounded-2xl border-2 border-dashed p-5 flex flex-col items-center justify-center gap-3 transition-all",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        isDragging
          ? "border-[#4E49FC] bg-[#F0EFFF]"
          : "border-[#E8E8EC] hover:border-[#8784FD] hover:bg-[#F7F7F8]"
      )}
      style={{ minHeight: 150 }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: isDragging ? "#E8E7FF" : "#F0EFFF" }}
      >
        <Upload className="h-6 w-6" style={{ color: "#4E49FC" }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color: "#26262C" }}>{label}</p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "#A2A1AF" }}>{subtitle}</p>
        )}
        <p className="text-xs mt-1.5" style={{ color: "#A2A1AF" }}>
          Glisser-déposer ou cliquer · PDF
        </p>
      </div>
    </div>
  );
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  data,
  isCurrent,
  isRecommande,
  primeActuelle,
}: {
  label: string;
  data: ExtractedData;
  isCurrent?: boolean;
  isRecommande?: boolean;
  primeActuelle?: number | null;
}) {
  const econ =
    !isCurrent && primeActuelle != null && data.primeTTC != null
      ? primeActuelle - data.primeTTC
      : null;

  return (
    <div
      className={cn("rounded-2xl border-2 p-5 space-y-3 transition-all")}
      style={{
        borderColor: isRecommande ? "#4E49FC" : isCurrent ? "#E8E8EC" : "#E8E8EC",
        background: isRecommande ? "#F0EFFF" : isCurrent ? "#F7F7F8" : "#FFFFFF",
      }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: isRecommande ? "#4E49FC" : "#A2A1AF" }}
        >
          {label}
        </p>
        {isRecommande && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: "#4E49FC", color: "#ffffff" }}
          >
            <Star className="h-3 w-3 fill-white" />
            Recommandé
          </div>
        )}
      </div>

      <div>
        <p className="text-base font-bold truncate" style={{ color: "#26262C" }}>
          {data.assureur ?? "—"}
        </p>
        <p
          className="text-2xl font-bold mt-1"
          style={{ color: isRecommande ? "#4E49FC" : "#26262C" }}
        >
          {formatPrime(data.primeTTC)}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#A2A1AF" }}>/ an TTC</p>
      </div>

      {econ != null && (
        <div
          className="flex items-center gap-1.5 text-sm font-semibold rounded-xl px-3 py-2"
          style={
            econ > 0
              ? { background: "#EFFBF2", color: "#13762C" }
              : { background: "#FFF7EB", color: "#955804" }
          }
        >
          {econ > 0 ? (
            <>
              <ArrowRight className="h-3.5 w-3.5" />
              Économie {econ.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an
            </>
          ) : (
            <>
              <ArrowRight className="h-3.5 w-3.5" />
              +{Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an
            </>
          )}
        </div>
      )}

      {data._pdfName && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#A2A1AF" }}>
          <FileText className="h-3 w-3" />
          {data._pdfName}
        </div>
      )}
    </div>
  );
}

// ─── ComparisonTable ──────────────────────────────────────────────────────────

type ColDef = {
  label: string;
  prime: number | null;
  data: ExtractedData;
  isCurrent?: boolean;
  isRecommande?: boolean;
};

function BoolCell({ value }: { value: boolean | undefined }) {
  if (value === undefined) return <span style={{ color: "#A2A1AF" }}>—</span>;
  if (value) return <span style={{ color: "#13762C", fontWeight: 600 }}>✓</span>;
  return <span style={{ color: "#D1D0DB" }}>✗</span>;
}

function TextCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: "#A2A1AF" }}>—</span>;
  return <span style={{ color: "#26262C" }}>{value}</span>;
}

function ComparisonTable({ cols }: { cols: ColDef[] }) {
  const currentPrime = cols[0]?.prime ?? null;

  type TableRow =
    | { type: "separator"; label: string }
    | { type: "prime" }
    | { type: "economy" }
    | { type: "text"; label: string; field: keyof ExtractedData }
    | { type: "bool"; label: string; garantieKey: keyof NonNullable<ExtractedData["garanties"]> };

  const rows: TableRow[] = [
    { type: "prime" },
    { type: "economy" },
    { type: "separator", label: "Franchises" },
    { type: "text", label: "Incendie", field: "franchiseIncendie" },
    { type: "text", label: "Dégâts des eaux", field: "franchiseDDE" },
    { type: "text", label: "Vol", field: "franchiseVol" },
    { type: "text", label: "Climatique", field: "franchiseClimatique" },
    { type: "separator", label: "Responsabilité civile" },
    { type: "text", label: "RC plafond", field: "rcPlafond" },
    { type: "text", label: "LCI", field: "lci" },
    { type: "separator", label: "Garanties" },
    { type: "bool", label: "Incendie", garantieKey: "incendie" },
    { type: "bool", label: "Dom. électriques", garantieKey: "dommagesElectriques" },
    { type: "bool", label: "Événements clim.", garantieKey: "evenementsClimatiques" },
    { type: "bool", label: "Cat. naturelles", garantieKey: "catastrophesNaturelles" },
    { type: "bool", label: "Dégâts des eaux", garantieKey: "degatsDesEaux" },
    { type: "bool", label: "Vol", garantieKey: "vol" },
    { type: "bool", label: "Bris de glace", garantieKey: "brisDeGlace" },
    { type: "bool", label: "RC", garantieKey: "rc" },
    { type: "bool", label: "Vandalisme", garantieKey: "vandalisme" },
    { type: "bool", label: "Effondrement", garantieKey: "effondrement" },
    { type: "bool", label: "Bris machines", garantieKey: "brisDeMachines" },
    { type: "separator", label: "Options" },
    { type: "bool", label: "Protection juridique", garantieKey: "protectionJuridique" },
    { type: "bool", label: "Protection CS", garantieKey: "protectionCS" },
    { type: "bool", label: "Honoraires syndic", garantieKey: "honoSyndic" },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "#E8E8EC" }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th
              className="text-left px-4 py-3 text-xs font-semibold sticky left-0 z-10"
              style={{ backgroundColor: "#F7F7F8", color: "#656576", minWidth: 160, borderBottom: "2px solid #E8E8EC" }}
            >
              Critère
            </th>
            {cols.map((col, i) => (
              <th
                key={i}
                className="px-4 py-3 text-center font-semibold"
                style={{
                  backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : "#FFFFFF",
                  color: col.isCurrent ? "#656576" : col.isRecommande ? "#4E49FC" : "#26262C",
                  minWidth: 160,
                  borderBottom: "2px solid #E8E8EC",
                  borderLeft: "1px solid #E8E8EC",
                }}
              >
                <div className="flex items-center justify-center gap-1.5">
                  {col.isRecommande && <Star className="h-3.5 w-3.5 fill-[#4E49FC]" style={{ color: "#4E49FC" }} />}
                  {col.label}
                </div>
                <div className="text-xs font-normal mt-0.5" style={{ color: col.isRecommande ? "#8784FD" : "#A2A1AF" }}>
                  {col.isCurrent ? "Contrat actuel" : `Devis ${i}`}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            if (row.type === "separator") {
              return (
                <tr key={rowIdx}>
                  <td
                    colSpan={cols.length + 1}
                    className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
                    style={{ backgroundColor: "#F7F7F8", color: "#A2A1AF", borderTop: "1px solid #E8E8EC" }}
                  >
                    {row.label}
                  </td>
                </tr>
              );
            }

            const isEven = rowIdx % 2 === 0;
            const rowBg = isEven ? "#FFFFFF" : "#FAFAFA";

            if (row.type === "prime") {
              return (
                <tr key={rowIdx} style={{ borderTop: "1px solid #E8E8EC" }}>
                  <td className="px-4 py-4 font-semibold sticky left-0" style={{ backgroundColor: rowBg, color: "#26262C", borderRight: "1px solid #E8E8EC" }}>
                    Prime TTC annuelle
                  </td>
                  {cols.map((col, i) => (
                    <td key={i} className="px-4 py-4 text-center" style={{ backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg, borderLeft: "1px solid #E8E8EC" }}>
                      <span className="text-xl font-bold" style={{ color: col.isCurrent ? "#26262C" : col.isRecommande ? "#4E49FC" : "#26262C" }}>
                        {formatPrime(col.prime)}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            }

            if (row.type === "economy") {
              return (
                <tr key={rowIdx} style={{ borderTop: "1px solid #E8E8EC" }}>
                  <td className="px-4 py-3 font-medium sticky left-0" style={{ backgroundColor: rowBg, color: "#656576", borderRight: "1px solid #E8E8EC" }}>
                    Économie annuelle
                  </td>
                  {cols.map((col, i) => {
                    if (col.isCurrent || currentPrime == null || col.prime == null) {
                      return (
                        <td key={i} className="px-4 py-3 text-center" style={{ backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg, borderLeft: "1px solid #E8E8EC", color: "#A2A1AF" }}>—</td>
                      );
                    }
                    const econ = currentPrime - col.prime;
                    const isPos = econ > 0;
                    return (
                      <td key={i} className="px-4 py-3 text-center font-bold" style={{ backgroundColor: col.isRecommande ? "#F0EFFF" : rowBg, borderLeft: "1px solid #E8E8EC", color: isPos ? "#13762C" : "#CA1E12" }}>
                        {isPos ? "−" : "+"}{Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €
                      </td>
                    );
                  })}
                </tr>
              );
            }

            if (row.type === "text") {
              return (
                <tr key={rowIdx} style={{ borderTop: "1px solid #E8E8EC" }}>
                  <td className="px-4 py-3 sticky left-0" style={{ backgroundColor: rowBg, color: "#656576", borderRight: "1px solid #E8E8EC" }}>{row.label}</td>
                  {cols.map((col, i) => {
                    const val = col.data[row.field as keyof ExtractedData];
                    return (
                      <td key={i} className="px-4 py-3 text-center" style={{ backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg, borderLeft: "1px solid #E8E8EC" }}>
                        <TextCell value={typeof val === "string" ? val : null} />
                      </td>
                    );
                  })}
                </tr>
              );
            }

            if (row.type === "bool") {
              return (
                <tr key={rowIdx} style={{ borderTop: "1px solid #E8E8EC" }}>
                  <td className="px-4 py-3 sticky left-0" style={{ backgroundColor: rowBg, color: "#656576", borderRight: "1px solid #E8E8EC" }}>{row.label}</td>
                  {cols.map((col, i) => (
                    <td key={i} className="px-4 py-3 text-center" style={{ backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg, borderLeft: "1px solid #E8E8EC" }}>
                      <BoolCell value={col.data.garanties?.[row.garantieKey]} />
                    </td>
                  ))}
                </tr>
              );
            }
            return null;
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── RecoAndEmailSection ─────────────────────────────────────────────────────

function RecoAndEmailSection({
  pipelineId,
  copro,
  contratActuelData,
  allDevis,
}: {
  pipelineId: string;
  copro: DevisRecusActionProps["copro"];
  contratActuelData: ExtractedData;
  allDevis: DevisRecu[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isChanging, setIsChanging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [to, setTo] = useState(copro.contactCsEmail ?? "");
  const [subject, setSubject] = useState("Matera - Renégociation de votre contrat MRI");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const recommande = allDevis.find((d) => d.recommande) ?? null;
  const primeActuelle = contratActuelData.primeTTC ?? copro.primeActuelle;
  const hasAutoGenRef = useRef<string | null>(null);

  async function generateEmail(d: DevisRecu) {
    setIsGenerating(true);
    setRecommendation(null);
    try {
      const res = await fetch("/api/devis/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copro: {
            nom: copro.nom,
            adresse: copro.adresse,
            contactCsNom: copro.contactCsNom,
            primeActuelle: copro.primeActuelle,
            gestionnaireEmail: copro.gestionnaireEmail,
          },
          contratActuel: contratActuelData,
          devis: allDevis.map((dv) => ({
            assureur: dv.assureur,
            primeTTC: dv.primeTTC,
            data: parseData(dv.data),
          })),
          recommandeAssureur: d.assureur,
        }),
      });
      const json = await res.json() as { success?: boolean; recommendation?: string; error?: string };
      if (json.success && json.recommendation) {
        setRecommendation(json.recommendation);
      } else {
        toast.error(`Erreur : ${json.error ?? "inconnu"}`);
      }
    } catch { toast.error("Erreur réseau"); }
    setIsGenerating(false);
  }

  // Auto-sélection si un seul devis, ou auto-génération si devis déjà recommandé
  useEffect(() => {
    if (!recommande && allDevis.length === 1) {
      handleSelectDevis(allDevis[0]);
    } else if (recommande && !isGenerating && hasAutoGenRef.current !== recommande.id) {
      hasAutoGenRef.current = recommande.id;
      generateEmail(recommande);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectDevis(d: DevisRecu) {
    hasAutoGenRef.current = d.id;
    setIsChanging(false);
    toast.success(`${d.assureur} sélectionné`);
    startTransition(async () => { await setRecommandeDevis(d.id, pipelineId); });
    generateEmail(d);
  }

  async function handleSend() {
    if (!to.trim() || !recommendation?.trim()) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("to", to);
      formData.append("subject", subject);
      formData.append("body", recommendation);
      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const json = await res.json() as { success?: boolean; fallback?: boolean; mailtoUrl?: string; error?: string; conversationId?: string };
      if (json.success) {
        if (json.fallback && json.mailtoUrl) window.open(json.mailtoUrl, "_blank");
        setSent(true);
        toast.success("Email envoyé au CS !");
        await logRecoSent(pipelineId, to, subject, recommendation, json.conversationId);
        await advanceStatut(pipelineId, true);
      } else {
        toast.error(`Erreur : ${json.error ?? "inconnu"}`);
      }
    } catch { toast.error("Erreur réseau"); }
    setSending(false);
  }

  // Pas encore de sélection ou en train de changer
  if ((!recommande || isChanging) && !isGenerating) {
    return (
      <div className="space-y-3">
        {isChanging && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "#26262C" }}>Choisir un autre devis</p>
            <button onClick={() => setIsChanging(false)} className="text-sm" style={{ color: "#A2A1AF" }}>Annuler</button>
          </div>
        )}
        {!isChanging && (
          <p className="text-sm" style={{ color: "#656576" }}>
            Sélectionnez le devis à recommander au Conseil Syndical — l&apos;email sera généré automatiquement.
          </p>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${allDevis.length}, 1fr)` }}>
          {allDevis.map((d) => {
            const econ = primeActuelle != null ? primeActuelle - d.primeTTC : null;
            return (
              <div key={d.id} className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: "#E8E8EC", background: "#FAFAFA" }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: "#26262C" }}>{d.assureur}</p>
                  <p className="text-xl font-bold mt-1">{formatPrime(d.primeTTC)}</p>
                  {econ != null && (
                    <p className="text-sm font-semibold mt-0.5" style={{ color: econ > 0 ? "#13762C" : "#CA1E12" }}>
                      {econ > 0 ? `Économie ${econ.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an` : `+${Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an`}
                    </p>
                  )}
                </div>
                <Button
                  className="w-full font-medium flex items-center gap-2"
                  style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
                  disabled={isPending}
                  onClick={() => handleSelectDevis(d)}
                >
                  <Star className="h-4 w-4" />
                  Recommander ce devis
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Génération en cours
  if (isGenerating) {
    const currentName = recommande?.assureur ?? "ce devis";
    return (
      <div className="rounded-2xl border-2 border-[#4E49FC] p-5 space-y-3" style={{ background: "#FAFEFF" }}>
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-[#13762C]" style={{ color: "#13762C" }} />
          <p className="text-sm font-semibold" style={{ color: "#26262C" }}>{currentName} sélectionné</p>
        </div>
        <div className="flex items-center gap-3 py-3">
          <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" style={{ color: "#4E49FC" }} />
          <p className="text-sm" style={{ color: "#656576" }}>
            Claude rédige l&apos;email de recommandation…
          </p>
        </div>
      </div>
    );
  }

  // Email prêt
  return (
    <div className="rounded-2xl border-2 border-[#4E49FC] p-5 space-y-4" style={{ background: "#FAFEFF" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-[#13762C]" style={{ color: "#13762C" }} />
          <p className="text-base font-semibold" style={{ color: "#26262C" }}>
            Recommandation : <span style={{ color: "#4E49FC" }}>{recommande?.assureur}</span>
          </p>
        </div>
        <button
          onClick={() => { setIsChanging(true); setRecommendation(null); setSent(false); }}
          className="text-xs font-medium"
          style={{ color: "#A2A1AF" }}
        >
          Changer
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: "#656576" }}>Corps du mail — modifiable avant envoi</p>
        <button
          onClick={() => { if (recommande) { hasAutoGenRef.current = null; generateEmail(recommande); } }}
          className="text-xs font-medium flex items-center gap-1"
          style={{ color: "#8784FD" }}
        >
          <RefreshCw className="h-3 w-3" />
          Regénérer
        </button>
      </div>

      <textarea
        value={recommendation ?? ""}
        onChange={(e) => setRecommendation(e.target.value)}
        rows={14}
        className="w-full rounded-xl border px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#4E49FC] focus:border-transparent font-[inherit]"
        style={{ background: "#FAFAFA", borderColor: "#E8E8EC", color: "#26262C" }}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium" style={{ color: "#656576" }}>Destinataire (CS)</Label>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@cs.fr" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" style={{ color: "#656576" }}>Objet</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>

      {sent ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium" style={{ backgroundColor: "#EFFBF2", color: "#13762C" }}>
          <CheckCircle2 className="h-5 w-5" />
          Email envoyé au CS
        </div>
      ) : (
        <Button
          onClick={handleSend}
          disabled={sending || !to.trim() || !recommendation?.trim()}
          className="w-full font-medium flex items-center gap-2"
          style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
        >
          {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours…</> : <><Mail className="h-4 w-4" />Envoyer au CS</>}
        </Button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DevisRecusAction({
  pipelineId,
  devisRecus,
  contratActuelData,
  copro,
}: DevisRecusActionProps) {
  type Phase = "upload" | "comparing" | "results";

  const hasExistingData = Boolean(contratActuelData && (devisRecus ?? []).length > 0);
  const [phase, setPhase] = useState<Phase>(hasExistingData ? "results" : "upload");

  // Upload phase files
  const [contratFile, setContratFile] = useState<File | null>(null);
  const [devis1File, setDevis1File] = useState<File | null>(null);
  const [devis2File, setDevis2File] = useState<File | null>(null);

  // Freshly extracted data (after comparison, before DB sync)
  const [freshContrat, setFreshContrat] = useState<ExtractedData | null>(null);
  const [freshDevis, setFreshDevis] = useState<ExtractedData[]>([]);

  // Display data: fresh extraction takes priority, then DB props
  const displayContrat = freshContrat ?? parseData(contratActuelData);
  const displayDevisList = freshDevis.length > 0
    ? freshDevis.map((d, i) => ({
        assureur: d.assureur ?? `Devis ${i + 1}`,
        primeTTC: d.primeTTC ?? 0,
        data: d,
        recommande: false,
      }))
    : (devisRecus ?? []).map((d) => ({
        assureur: d.assureur,
        primeTTC: d.primeTTC,
        data: parseData(d.data),
        recommande: d.recommande,
      }));

  const contratPrime = displayContrat.primeTTC ?? copro.primeActuelle;

  const cols: ColDef[] = [
    {
      label: displayContrat.assureur ?? copro.assureurActuel ?? "Contrat actuel",
      prime: contratPrime,
      data: displayContrat,
      isCurrent: true,
    },
    ...displayDevisList.map((d) => ({
      label: d.assureur,
      prime: d.primeTTC,
      data: d.data,
      isRecommande: d.recommande,
    })),
  ];

  async function handleCompare() {
    if (!contratFile || !devis1File) return;
    setPhase("comparing");
    try {
      const devisFiles = [devis1File, devis2File].filter(Boolean) as File[];
      const filesToExtract = [contratFile, ...devisFiles];

      // Extraction + upload en parallèle
      const [results, ...pdfUrls] = await Promise.all([
        Promise.all(filesToExtract.map(extractPdf)),
        ...devisFiles.map((f) => uploadPdf(f, pipelineId)),
      ]);
      const [contratData, ...devisData] = results as ExtractedData[];
      const uploadedUrls = pdfUrls as (string | null)[];

      // Show results immediately from memory
      setFreshContrat(contratData);
      setFreshDevis(devisData);
      setPhase("results");

      // Save to DB in background
      await saveContratActuelData(pipelineId, JSON.stringify(contratData));
      for (const d of (devisRecus ?? [])) {
        await deleteDevisRecu(d.id, pipelineId);
      }
      for (let i = 0; i < devisData.length; i++) {
        const d = devisData[i];
        await addDevisRecu(pipelineId, {
          assureur: d.assureur ?? `Devis ${i + 1}`,
          primeTTC: d.primeTTC ?? 0,
          data: JSON.stringify(d),
          pdfName: devisFiles[i]?.name ?? null,
          pdfUrl: uploadedUrls[i] ?? null,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'analyse");
      setPhase("upload");
    }
  }

  const numFiles = [contratFile, devis1File, devis2File].filter(Boolean).length;
  const canCompare = Boolean(contratFile && devis1File);

  // ── Phase: Upload ──────────────────────────────────────────────────────────

  if (phase === "upload") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1" style={{ color: "#26262C" }}>
            Comparez les offres d&apos;assurance
          </h3>
          <p className="text-sm" style={{ color: "#A2A1AF" }}>
            Uploadez le contrat actuel et les devis reçus — Claude analyse tout en parallèle.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <UploadZone
            label="Contrat actuel"
            file={contratFile}
            onFile={setContratFile}
          />
          <UploadZone
            label="Devis 1"
            file={devis1File}
            onFile={setDevis1File}
          />
          <UploadZone
            label="Devis 2"
            subtitle="Optionnel"
            file={devis2File}
            onFile={setDevis2File}
          />
        </div>

        <Button
          onClick={handleCompare}
          disabled={!canCompare}
          className="w-full font-semibold text-base flex items-center gap-2 py-6"
          style={{
            backgroundColor: canCompare ? "#4E49FC" : "#E8E8EC",
            color: canCompare ? "#ffffff" : "#A2A1AF",
          }}
        >
          <Sparkles className="h-5 w-5" />
          Lancer la comparaison
          {numFiles > 0 && ` · ${numFiles} document${numFiles > 1 ? "s" : ""}`}
        </Button>

        {hasExistingData && (
          <button
            onClick={() => setPhase("results")}
            className="w-full text-center text-sm font-medium"
            style={{ color: "#8784FD" }}
          >
            Voir la dernière analyse →
          </button>
        )}
      </div>
    );
  }

  // ── Phase: Comparing ───────────────────────────────────────────────────────

  if (phase === "comparing") {
    return (
      <div className="py-16 flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#F0EFFF" }}>
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#4E49FC" }} />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold" style={{ color: "#26262C" }}>Analyse en cours…</p>
          <p className="text-sm" style={{ color: "#656576" }}>
            Claude lit {numFiles} document{numFiles > 1 ? "s" : ""} en parallèle et extrait les données clés
          </p>
        </div>
        <div className="flex gap-6">
          {[contratFile, devis1File, devis2File].filter(Boolean).map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "#A2A1AF" }}>
              <Loader2 className="h-3 w-3 animate-spin" />
              {f!.name.length > 20 ? f!.name.slice(0, 20) + "…" : f!.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Phase: Results ─────────────────────────────────────────────────────────

  const dbDevis = devisRecus ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#26262C" }}>Résultats de la comparaison</h3>
          <p className="text-sm mt-0.5" style={{ color: "#A2A1AF" }}>
            {displayDevisList.length} devis comparé{displayDevisList.length > 1 ? "s" : ""} au contrat actuel
          </p>
        </div>
        <button
          onClick={() => {
            setFreshContrat(null);
            setFreshDevis([]);
            setContratFile(null);
            setDevis1File(null);
            setDevis2File(null);
            setPhase("upload");
          }}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-[#F7F7F8]"
          style={{ borderColor: "#E8E8EC", color: "#656576" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Nouvelle analyse
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${1 + displayDevisList.length}, 1fr)` }}>
        <SummaryCard
          label="Contrat actuel"
          data={displayContrat}
          isCurrent
        />
        {displayDevisList.map((d, i) => (
          <SummaryCard
            key={i}
            label={`Devis ${i + 1}`}
            data={d.data}
            isRecommande={d.recommande}
            primeActuelle={contratPrime}
          />
        ))}
      </div>

      {/* Comparison table */}
      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: "#26262C" }}>Comparatif détaillé</p>
        <ComparisonTable cols={cols} />
      </div>

      {/* Reco + Email CS fusionnés */}
      <div className="space-y-3">
        <p className="text-sm font-semibold" style={{ color: "#26262C" }}>Recommandation et email au CS</p>
        {dbDevis.length > 0 ? (
          <RecoAndEmailSection
            pipelineId={pipelineId}
            copro={copro}
            contratActuelData={displayContrat}
            allDevis={dbDevis}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3" style={{ background: "#F0EFFF", color: "#8784FD" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sauvegarde en cours…
          </div>
        )}
      </div>
    </div>
  );
}
