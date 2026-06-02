"use client";

import { useState, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  X,
  Star,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  Mail,
} from "lucide-react";
import {
  addDevisRecu,
  deleteDevisRecu,
  setRecommandeDevis,
} from "@/lib/actions";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

type ExtractedData = {
  assureur?: string;
  numeroContrat?: string | null;
  primeTTC?: number;
  primeHT?: number | null;
  taxes?: number | null;
  fraisCourtage?: number | null;
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
  copro: {
    nom: string;
    adresse: string | null;
    assureurActuel: string | null;
    primeActuelle: number | null;
    courtierActuel: string | null;
    contactCsEmail: string | null;
    contactCsNom: string | null;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseData(raw: string | null): ExtractedData {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ExtractedData;
  } catch {
    return {};
  }
}

function formatPrime(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

// ─── DropZone ───────────────────────────────────────────────────────────────

function DropZone({
  onDrop,
  loading,
}: {
  onDrop: (file: File) => void;
  loading: boolean;
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
    input.accept = ".pdf";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) onDrop(f);
    };
    input.click();
  }, [onDrop]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={loading ? undefined : handleClick}
      className={cn(
        "border-2 border-dashed rounded-xl p-6 text-center transition-colors",
        loading ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        isDragging
          ? "border-[#4E49FC] bg-[#F0EFFF]"
          : "border-[#E8E8EC] hover:border-[#8784FD] hover:bg-[#F7F7F8]"
      )}
    >
      {loading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#4E49FC" }} />
          <p className="text-sm font-medium" style={{ color: "#4E49FC" }}>
            Analyse du devis par Claude…
          </p>
          <p className="text-xs" style={{ color: "#A2A1AF" }}>
            Extraction des données en cours
          </p>
        </div>
      ) : (
        <>
          <Upload className="h-6 w-6 mx-auto mb-2" style={{ color: "#A2A1AF" }} />
          <p className="text-sm font-medium" style={{ color: "#656576" }}>
            Déposer un devis PDF ici
          </p>
          <p className="text-xs mt-1" style={{ color: "#A2A1AF" }}>
            ou cliquer pour parcourir — PDF uniquement
          </p>
        </>
      )}
    </div>
  );
}

// ─── GarantieChip ────────────────────────────────────────────────────────────

function GarantieChip({ label, value }: { label: string; value: boolean | undefined }) {
  if (value === undefined) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={
        value
          ? { backgroundColor: "#EFFBF2", color: "#13762C" }
          : { backgroundColor: "#F7F7F8", color: "#A2A1AF" }
      }
    >
      {value ? "✓" : "✗"} {label}
    </span>
  );
}

// ─── Section A: Upload + Form ────────────────────────────────────────────────

function UploadSection({
  pipelineId,
  onSaved,
}: {
  pipelineId: string;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);

  // Editable form fields
  const [assureur, setAssureur] = useState("");
  const [numeroContrat, setNumeroContrat] = useState("");
  const [primeTTC, setPrimeTTC] = useState("");
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setLoading(true);
    setPdfName(file.name);
    try {
      const formData = new FormData();
      formData.append("pdf", file, file.name);
      const res = await fetch("/api/devis/extract", { method: "POST", body: formData });
      const json = await res.json() as { success?: boolean; data?: ExtractedData; error?: string };

      if (!json.success || !json.data) {
        toast.error(`Erreur d'extraction : ${json.error ?? "inconnu"}`);
        setLoading(false);
        return;
      }

      const d = json.data;
      setExtracted(d);
      setAssureur(d.assureur ?? "");
      setNumeroContrat(d.numeroContrat ?? "");
      setPrimeTTC(d.primeTTC != null ? String(d.primeTTC) : "");
      setNotes("");
      toast.success("Données extraites avec succès !");
    } catch (err) {
      toast.error("Erreur réseau lors de l'extraction");
      console.error(err);
    }
    setLoading(false);
  }

  function handleCancel() {
    setExtracted(null);
    setPdfName(null);
    setAssureur("");
    setNumeroContrat("");
    setPrimeTTC("");
    setNotes("");
  }

  function handleSave() {
    const prime = parseFloat(primeTTC);
    if (!assureur.trim()) { toast.error("Le nom de l'assureur est requis"); return; }
    if (isNaN(prime) || prime <= 0) { toast.error("La prime TTC doit être un nombre positif"); return; }

    startTransition(async () => {
      const result = await addDevisRecu(pipelineId, {
        assureur: assureur.trim(),
        numeroContrat: numeroContrat.trim() || null,
        primeTTC: prime,
        data: extracted ? JSON.stringify(extracted) : null,
        notes: notes.trim() || null,
        pdfName,
      });

      if (result.success) {
        toast.success("Devis enregistré !");
        handleCancel();
        onSaved();
      }
    });
  }

  if (!extracted) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
          Ajouter un devis reçu
        </p>
        <DropZone onDrop={handleFile} loading={loading} />
      </div>
    );
  }

  const g = extracted.garanties ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
          Données extraites — vérifier et enregistrer
        </p>
        <button onClick={handleCancel} style={{ color: "#A2A1AF" }} className="hover:opacity-70">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* PDF name */}
      {pdfName && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: "#F0EFFF" }}>
          <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#4E49FC" }} />
          <span style={{ color: "#4E49FC" }}>{pdfName}</span>
        </div>
      )}

      {/* Editable fields */}
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Assureur <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <Input
            value={assureur}
            onChange={(e) => setAssureur(e.target.value)}
            placeholder="Ex : AXA, Allianz…"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            N° contrat / devis
          </Label>
          <Input
            value={numeroContrat}
            onChange={(e) => setNumeroContrat(e.target.value)}
            placeholder="Optionnel"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Prime TTC annuelle (€) <span style={{ color: "#4E49FC" }}>*</span>
          </Label>
          <Input
            type="number"
            value={primeTTC}
            onChange={(e) => setPrimeTTC(e.target.value)}
            placeholder="Ex : 3500"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-sm font-medium" style={{ color: "#26262C" }}>
            Notes
          </Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Observations sur ce devis…"
            className="w-full rounded-xl border px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#4E49FC] focus:border-transparent font-[inherit]"
            style={{ background: "#FAFAFA", borderColor: "#E8E8EC", color: "#26262C" }}
          />
        </div>
      </div>

      {/* Extracted summary: franchises */}
      {(extracted.franchiseIncendie || extracted.franchiseDDE || extracted.franchiseVol || extracted.franchiseClimatique) && (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "#E8E8EC" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
            Franchises extraites
          </p>
          <div className="space-y-1 text-xs" style={{ color: "#656576" }}>
            {extracted.franchiseIncendie && <div><span style={{ color: "#26262C", fontWeight: 500 }}>Incendie :</span> {extracted.franchiseIncendie}</div>}
            {extracted.franchiseDDE && <div><span style={{ color: "#26262C", fontWeight: 500 }}>Dégâts des eaux :</span> {extracted.franchiseDDE}</div>}
            {extracted.franchiseVol && <div><span style={{ color: "#26262C", fontWeight: 500 }}>Vol :</span> {extracted.franchiseVol}</div>}
            {extracted.franchiseClimatique && <div><span style={{ color: "#26262C", fontWeight: 500 }}>Climatique :</span> {extracted.franchiseClimatique}</div>}
          </div>
        </div>
      )}

      {/* Garanties chips */}
      {Object.keys(g).length > 0 && (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "#E8E8EC" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
            Garanties détectées
          </p>
          <div className="flex flex-wrap gap-1.5">
            <GarantieChip label="Incendie" value={g.incendie} />
            <GarantieChip label="Dom. élec." value={g.dommagesElectriques} />
            <GarantieChip label="Événements clim." value={g.evenementsClimatiques} />
            <GarantieChip label="Cat. nat." value={g.catastrophesNaturelles} />
            <GarantieChip label="Dégâts eaux" value={g.degatsDesEaux} />
            <GarantieChip label="Vol" value={g.vol} />
            <GarantieChip label="Bris de glace" value={g.brisDeGlace} />
            <GarantieChip label="RC" value={g.rc} />
            <GarantieChip label="Vandalisme" value={g.vandalisme} />
            <GarantieChip label="Effondrement" value={g.effondrement} />
            <GarantieChip label="Bris machines" value={g.brisDeMachines} />
            <GarantieChip label="Prot. juridique" value={g.protectionJuridique} />
            <GarantieChip label="Prot. CS" value={g.protectionCS} />
            <GarantieChip label="Hono. syndic" value={g.honoSyndic} />
          </div>
        </div>
      )}

      {/* Points forts / faibles */}
      {((extracted.pointsForts?.length ?? 0) > 0 || (extracted.pointsFaibles?.length ?? 0) > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {(extracted.pointsForts?.length ?? 0) > 0 && (
            <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: "#BBF1C8", background: "#EFFBF2" }}>
              <p className="text-xs font-semibold" style={{ color: "#13762C" }}>Points forts</p>
              {extracted.pointsForts!.map((pt, i) => (
                <p key={i} className="text-xs" style={{ color: "#13762C" }}>✓ {pt}</p>
              ))}
            </div>
          )}
          {(extracted.pointsFaibles?.length ?? 0) > 0 && (
            <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: "#F5C97A", background: "#FFF7EB" }}>
              <p className="text-xs font-semibold" style={{ color: "#955804" }}>Points faibles</p>
              {extracted.pointsFaibles!.map((pt, i) => (
                <p key={i} className="text-xs" style={{ color: "#955804" }}>✗ {pt}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          onClick={handleCancel}
          className="flex-1"
          disabled={isPending}
        >
          Annuler
        </Button>
        <Button
          onClick={handleSave}
          disabled={isPending || !assureur.trim() || !primeTTC.trim()}
          className="flex-1 font-medium"
          style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
              Enregistrement…
            </>
          ) : (
            "Enregistrer ce devis"
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Section B: Devis Card ────────────────────────────────────────────────────

function DevisCard({
  devis,
  pipelineId,
  onDelete,
  onRecommande,
}: {
  devis: DevisRecu;
  pipelineId: string;
  onDelete: () => void;
  onRecommande: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const d = parseData(devis.data);

  const dateLabel = new Date(devis.createdAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden transition-all",
        devis.recommande
          ? "border-[#4E49FC]"
          : "border-[#E8E8EC]"
      )}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: devis.recommande ? "#F0EFFF" : "#F7F7F8" }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          {devis.recommande && (
            <Star className="h-4 w-4 fill-[#4E49FC]" style={{ color: "#4E49FC" }} />
          )}
          <div>
            <p className="text-sm font-semibold" style={{ color: "#26262C" }}>
              {devis.assureur}
            </p>
            <p className="text-xs" style={{ color: "#A2A1AF" }}>
              {formatPrime(devis.primeTTC)} · ajouté le {dateLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!devis.recommande && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                startTransition(async () => {
                  await setRecommandeDevis(devis.id, pipelineId);
                  onRecommande();
                  toast.success(`${devis.assureur} recommandé !`);
                });
              }}
              disabled={isPending}
              title="Recommander ce devis"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors hover:border-[#4E49FC] hover:text-[#4E49FC]"
              style={{ borderColor: "#E8E8EC", color: "#A2A1AF" }}
            >
              <Star className="h-3.5 w-3.5" />
              Recommander
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              startTransition(async () => {
                await deleteDevisRecu(devis.id, pipelineId);
                onDelete();
                toast.success("Devis supprimé");
              });
            }}
            disabled={isPending}
            title="Supprimer"
            className="p-1 rounded transition-colors hover:text-red-500"
            style={{ color: "#A2A1AF" }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {open ? (
            <ChevronUp className="h-4 w-4" style={{ color: "#A2A1AF" }} />
          ) : (
            <ChevronDown className="h-4 w-4" style={{ color: "#A2A1AF" }} />
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 py-3 border-t space-y-3" style={{ borderColor: "#E8E8EC" }}>
          {devis.pdfName && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "#656576" }}>
              <FileText className="h-3.5 w-3.5" />
              {devis.pdfName}
            </div>
          )}
          {devis.numeroContrat && (
            <p className="text-xs" style={{ color: "#656576" }}>
              N° contrat : <span style={{ color: "#26262C" }}>{devis.numeroContrat}</span>
            </p>
          )}
          {devis.notes && (
            <p className="text-xs leading-relaxed" style={{ color: "#656576" }}>
              {devis.notes}
            </p>
          )}
          {(d.franchiseIncendie || d.franchiseDDE || d.franchiseVol || d.franchiseClimatique) && (
            <div className="text-xs space-y-0.5" style={{ color: "#656576" }}>
              {d.franchiseIncendie && <div><strong>Incendie :</strong> {d.franchiseIncendie}</div>}
              {d.franchiseDDE && <div><strong>DDE :</strong> {d.franchiseDDE}</div>}
              {d.franchiseVol && <div><strong>Vol :</strong> {d.franchiseVol}</div>}
              {d.franchiseClimatique && <div><strong>Clim. :</strong> {d.franchiseClimatique}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section C: Comparison Table ─────────────────────────────────────────────

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
  return <span style={{ color: "#A2A1AF" }}>✗</span>;
}

function TextCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: "#A2A1AF" }}>—</span>;
  return <span style={{ color: "#26262C" }}>{value}</span>;
}

function ComparisonTable({
  cols,
}: {
  cols: ColDef[];
}) {
  const currentPrime = cols[0]?.prime ?? null;

  const rows: Array<
    | { type: "separator"; label: string }
    | { type: "prime" }
    | { type: "economy" }
    | { type: "text"; label: string; field: keyof ExtractedData }
    | { type: "bool"; label: string; garantieKey: keyof NonNullable<ExtractedData["garanties"]> }
  > = [
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
    { type: "bool", label: "Dégâts des eaux", garantieKey: "degatsDesEaux" },
    { type: "bool", label: "Vol", garantieKey: "vol" },
    { type: "bool", label: "Bris de glace", garantieKey: "brisDeGlace" },
    { type: "bool", label: "Vandalisme", garantieKey: "vandalisme" },
    { type: "bool", label: "Effondrement", garantieKey: "effondrement" },
    { type: "bool", label: "Bris machines", garantieKey: "brisDeMachines" },
    { type: "separator", label: "Options" },
    { type: "bool", label: "Protection juridique", garantieKey: "protectionJuridique" },
    { type: "bool", label: "Protection CS", garantieKey: "protectionCS" },
    { type: "bool", label: "Honoraires syndic", garantieKey: "honoSyndic" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#E8E8EC" }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {/* Criterion label col */}
            <th
              className="text-left px-3 py-2.5 text-xs font-semibold sticky left-0 z-10"
              style={{
                backgroundColor: "#F7F7F8",
                color: "#656576",
                minWidth: 140,
                borderBottom: "1px solid #E8E8EC",
              }}
            >
              Critère
            </th>
            {cols.map((col, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-center font-semibold"
                style={{
                  backgroundColor: col.isCurrent
                    ? "#F7F7F8"
                    : col.isRecommande
                    ? "#F0EFFF"
                    : "#FFFFFF",
                  color: col.isCurrent ? "#656576" : col.isRecommande ? "#4E49FC" : "#26262C",
                  minWidth: 130,
                  borderBottom: "1px solid #E8E8EC",
                  borderLeft: "1px solid #E8E8EC",
                }}
              >
                <div className="flex items-center justify-center gap-1">
                  {col.isRecommande && <Star className="h-3 w-3 fill-[#4E49FC]" style={{ color: "#4E49FC" }} />}
                  {col.label}
                </div>
                {col.isCurrent && (
                  <div className="text-xs font-normal mt-0.5" style={{ color: "#A2A1AF" }}>
                    Contrat actuel
                  </div>
                )}
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
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wide"
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
                  <td
                    className="px-3 py-3 font-semibold sticky left-0"
                    style={{ backgroundColor: rowBg, color: "#26262C", borderRight: "1px solid #E8E8EC" }}
                  >
                    Prime TTC annuelle
                  </td>
                  {cols.map((col, i) => (
                    <td
                      key={i}
                      className="px-3 py-3 text-center"
                      style={{
                        backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg,
                        borderLeft: "1px solid #E8E8EC",
                      }}
                    >
                      <span
                        className="text-base font-bold"
                        style={{ color: col.isCurrent ? "#26262C" : col.isRecommande ? "#4E49FC" : "#26262C" }}
                      >
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
                  <td
                    className="px-3 py-2 font-medium sticky left-0"
                    style={{ backgroundColor: rowBg, color: "#656576", borderRight: "1px solid #E8E8EC" }}
                  >
                    Économie annuelle
                  </td>
                  {cols.map((col, i) => {
                    if (col.isCurrent || currentPrime == null || col.prime == null) {
                      return (
                        <td
                          key={i}
                          className="px-3 py-2 text-center"
                          style={{
                            backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg,
                            borderLeft: "1px solid #E8E8EC",
                            color: "#A2A1AF",
                          }}
                        >
                          —
                        </td>
                      );
                    }
                    const econ = currentPrime - col.prime;
                    const isPositive = econ > 0;
                    return (
                      <td
                        key={i}
                        className="px-3 py-2 text-center font-semibold"
                        style={{
                          backgroundColor: col.isRecommande ? "#F0EFFF" : rowBg,
                          borderLeft: "1px solid #E8E8EC",
                          color: isPositive ? "#13762C" : "#CA1E12",
                        }}
                      >
                        {isPositive ? "−" : "+"}
                        {Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €
                      </td>
                    );
                  })}
                </tr>
              );
            }

            if (row.type === "text") {
              return (
                <tr key={rowIdx} style={{ borderTop: "1px solid #E8E8EC" }}>
                  <td
                    className="px-3 py-2 sticky left-0"
                    style={{ backgroundColor: rowBg, color: "#656576", borderRight: "1px solid #E8E8EC" }}
                  >
                    {row.label}
                  </td>
                  {cols.map((col, i) => {
                    const val = col.data[row.field as keyof ExtractedData];
                    return (
                      <td
                        key={i}
                        className="px-3 py-2 text-center"
                        style={{
                          backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg,
                          borderLeft: "1px solid #E8E8EC",
                        }}
                      >
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
                  <td
                    className="px-3 py-2 sticky left-0"
                    style={{ backgroundColor: rowBg, color: "#656576", borderRight: "1px solid #E8E8EC" }}
                  >
                    {row.label}
                  </td>
                  {cols.map((col, i) => {
                    const val = col.data.garanties?.[row.garantieKey];
                    return (
                      <td
                        key={i}
                        className="px-3 py-2 text-center"
                        style={{
                          backgroundColor: col.isCurrent ? "#F7F7F8" : col.isRecommande ? "#F0EFFF" : rowBg,
                          borderLeft: "1px solid #E8E8EC",
                        }}
                      >
                        <BoolCell value={val} />
                      </td>
                    );
                  })}
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

// ─── Section D: Recommendation Email ─────────────────────────────────────────

function RecommandationEmail({
  pipelineId,
  recommande,
  copro,
  allDevis,
}: {
  pipelineId: string;
  recommande: DevisRecu;
  copro: DevisRecusActionProps["copro"];
  allDevis: DevisRecu[];
}) {
  const d = parseData(recommande.data);
  const econ =
    copro.primeActuelle != null
      ? copro.primeActuelle - recommande.primeTTC
      : null;

  function buildBody(): string {
    const lines: string[] = [
      `Bonjour${copro.contactCsNom ? ` ${copro.contactCsNom}` : ""},`,
      "",
      `Suite à notre appel d'offres pour la copropriété ${copro.nom}${copro.adresse ? ` (${copro.adresse})` : ""}, nous avons analysé les devis reçus et souhaitons vous présenter notre recommandation.`,
      "",
      `Nous vous recommandons le devis proposé par ${recommande.assureur}.`,
      "",
      "── Résumé de l'offre ──",
      "",
      `Prime annuelle TTC : ${formatPrime(recommande.primeTTC)}`,
    ];

    if (econ != null) {
      if (econ > 0) {
        lines.push(
          `Économie par rapport au contrat actuel : ${econ.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € / an`
        );
      } else {
        lines.push(
          `Variation par rapport au contrat actuel : +${Math.abs(econ).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € / an`
        );
      }
    }

    if (d.rcPlafond) lines.push(`RC plafond : ${d.rcPlafond}`);
    if (d.lci) lines.push(`LCI : ${d.lci}`);

    if ((d.pointsForts?.length ?? 0) > 0) {
      lines.push("", "Points forts :", ...(d.pointsForts ?? []).map((p) => `  ✓ ${p}`));
    }

    if (allDevis.length > 1) {
      lines.push(
        "",
        "── Comparatif des devis reçus ──",
        ""
      );
      for (const dv of allDevis) {
        lines.push(
          `${dv.recommande ? "★ " : "  "}${dv.assureur} : ${formatPrime(dv.primeTTC)}${dv.recommande ? " (recommandé)" : ""}`
        );
      }
    }

    lines.push(
      "",
      "Nous restons disponibles pour tout renseignement complémentaire.",
      "",
      "Cordialement,",
      "L'équipe Matera"
    );

    return lines.join("\n");
  }

  const [to, setTo] = useState(copro.contactCsEmail ?? "");
  const [subject, setSubject] = useState(
    `Recommandation assurance MRI — ${copro.nom}`
  );
  const [body, setBody] = useState(() => buildBody());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!to.trim()) { toast.error("L'adresse email du CS est requise"); return; }
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("to", to);
      formData.append("subject", subject);
      formData.append("body", body);
      const res = await fetch("/api/front/draft", { method: "POST", body: formData });
      const json = await res.json() as { success?: boolean; fallback?: boolean; mailtoUrl?: string; error?: string };
      if (json.success) {
        if (json.fallback && json.mailtoUrl) window.open(json.mailtoUrl, "_blank");
        setSent(true);
        toast.success("Email de recommandation envoyé au CS !");
        // Log the event
        await fetch(`/api/pipeline/${pipelineId}/log-recommandation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assureur: recommande.assureur, to }),
        }).catch(() => {});
      } else {
        toast.error(`Erreur : ${json.error ?? "inconnu"}`);
      }
    } catch {
      toast.error("Erreur réseau");
    }
    setSending(false);
  }

  return (
    <div className="rounded-xl border-2 border-[#4E49FC] p-4 space-y-4" style={{ background: "#FAFEFF" }}>
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 fill-[#4E49FC]" style={{ color: "#4E49FC" }} />
        <p className="text-sm font-semibold" style={{ color: "#4E49FC" }}>
          Envoyer la recommandation au Conseil Syndical
        </p>
      </div>
      <p className="text-xs" style={{ color: "#656576" }}>
        <strong style={{ color: "#26262C" }}>{recommande.assureur}</strong> est recommandé à{" "}
        <strong style={{ color: "#26262C" }}>{formatPrime(recommande.primeTTC)}</strong>
        {econ != null && econ > 0 && (
          <> — économie de <strong style={{ color: "#13762C" }}>{econ.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/an</strong></>
        )}
      </p>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium" style={{ color: "#656576" }}>Destinataire</Label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@cs.fr"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" style={{ color: "#656576" }}>Objet</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" style={{ color: "#656576" }}>Corps du mail</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="w-full rounded-xl border px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#4E49FC] focus:border-transparent font-[inherit]"
            style={{ background: "#FAFAFA", borderColor: "#E8E8EC", color: "#26262C" }}
          />
        </div>
      </div>

      {sent ? (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm"
          style={{ backgroundColor: "#EFFBF2", color: "#13762C" }}
        >
          <CheckCircle2 className="h-4 w-4" />
          Email de recommandation envoyé au CS
        </div>
      ) : (
        <Button
          onClick={handleSend}
          disabled={sending || !to.trim()}
          className="w-full font-medium flex items-center gap-2"
          style={{ backgroundColor: "#4E49FC", color: "#ffffff" }}
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours…</>
          ) : (
            <><Mail className="h-4 w-4" />Envoyer au CS</>
          )}
        </Button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DevisRecusAction({
  pipelineId,
  devisRecus,
  copro,
}: DevisRecusActionProps) {
  // We use a key trick to force re-renders after saves by incrementing
  const [refreshKey, setRefreshKey] = useState(0);
  const [localDevis, setLocalDevis] = useState<DevisRecu[]>(devisRecus ?? []);

  // Sync with server props (after revalidatePath)
  // Since it's a client component, we rely on server revalidation
  // but localDevis will be in-sync after the parent re-renders

  // Update local when server props change (parent revalidation)
  // This is a simplified approach — proper pattern with useEffect
  const recommande = localDevis.find((d) => d.recommande) ?? null;

  // Build comparison columns
  const cols: ColDef[] = [];

  // Column 0: current contract
  cols.push({
    label: copro.assureurActuel ?? "Contrat actuel",
    prime: copro.primeActuelle,
    data: {},
    isCurrent: true,
  });

  // Columns 1+: received devis
  for (const d of localDevis) {
    cols.push({
      label: d.assureur,
      prime: d.primeTTC,
      data: parseData(d.data),
      isRecommande: d.recommande,
    });
  }

  return (
    <div className="space-y-6" key={refreshKey}>
      {/* Section A: Upload */}
      <UploadSection
        pipelineId={pipelineId}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />

      {/* Section B: List of received devis */}
      {localDevis.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
            Devis reçus ({localDevis.length})
          </p>
          {localDevis.map((devis) => (
            <DevisCard
              key={devis.id}
              devis={devis}
              pipelineId={pipelineId}
              onDelete={() => setRefreshKey((k) => k + 1)}
              onRecommande={() => setRefreshKey((k) => k + 1)}
            />
          ))}
        </div>
      )}

      {/* Section C: Comparison table */}
      {localDevis.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#A2A1AF" }}>
            Tableau comparatif
          </p>
          <ComparisonTable cols={cols} />
        </div>
      )}

      {/* Section D: Recommendation email */}
      {recommande && (
        <RecommandationEmail
          pipelineId={pipelineId}
          recommande={recommande}
          copro={copro}
          allDevis={localDevis}
        />
      )}
    </div>
  );
}
