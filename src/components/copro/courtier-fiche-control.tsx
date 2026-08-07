"use client";

// Auto 3 — contrôle courtier sur la fiche (dossiers « Récupération du RS »).
// « Vérifier le courtier » classe le dossier (vert/orange/rouge) ; si le courtier
// est valable mais sans mail et connu de la base, « Remplir via la base » complète
// le mail courtier.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Wand2, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";

type Bucket = "vert" | "orange" | "rouge";
type Row = { bucket: Bucket; reason: string; fillable: boolean; fillEmail: string | null; refNom: string | null };

const STYLE: Record<Bucket, { bg: string; fg: string; bd: string; Icon: typeof CheckCircle2 }> = {
  vert: { bg: "#EAF7EE", fg: "#13762C", bd: "#B7E4C4", Icon: CheckCircle2 },
  orange: { bg: "#FDF0D5", fg: "#B4690E", bd: "#F3D9A6", Icon: AlertTriangle },
  rouge: { bg: "#FDECEA", fg: "#CA1E12", bd: "#F5C6C0", Icon: XCircle },
};

export function CourtierFicheControl({ pipelineId }: { pipelineId: string }) {
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [filling, setFilling] = useState(false);

  async function verify() {
    setLoading(true);
    try {
      const res = await fetch(`/api/courtier/audit?pipelineId=${encodeURIComponent(pipelineId)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      setRow(data.row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la vérification");
    } finally {
      setLoading(false);
    }
  }

  async function fill() {
    setFilling(true);
    try {
      const res = await fetch("/api/courtier/autofill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      if (data.filled > 0) {
        toast.success("Mail courtier rempli via la base.");
        router.refresh();
      } else {
        toast.info("Aucun mail rempli (déjà renseigné ou non remplissable).");
      }
      await verify();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du remplissage");
    } finally {
      setFilling(false);
    }
  }

  const s = row ? STYLE[row.bucket] : null;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px dashed #E8E8EC" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={verify}
          disabled={loading}
          className="text-xs font-medium rounded-md px-2 py-0.5 transition-colors disabled:opacity-60 inline-flex items-center gap-1"
          style={{ color: "#4E49FC", border: "1px solid #D9D8FF", background: "#F5F5FF" }}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListChecks className="h-3 w-3" />}
          Vérifier le courtier
        </button>
        {row && s && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-0.5" style={{ color: s.fg, background: s.bg, border: `1px solid ${s.bd}` }}>
            <s.Icon className="h-3 w-3" /> {row.reason}
          </span>
        )}
      </div>
      {row?.fillable && (
        <div className="mt-2">
          <button
            onClick={fill}
            disabled={filling}
            className="text-xs font-medium rounded-md px-2 py-0.5 transition-colors disabled:opacity-60 inline-flex items-center gap-1"
            style={{ color: "#13762C", border: "1px solid #B7E4C4", background: "#EAF7EE" }}
          >
            {filling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            Remplir le mail via la base{row.fillEmail ? ` (${row.fillEmail})` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
