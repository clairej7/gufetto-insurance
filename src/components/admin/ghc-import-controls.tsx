"use client";

// Automatisation 8 — volet 3 « correction GetHumanCall ».
// Deux boutons côte à côte :
//  1. « Importer un nouvel excel » → upload .xlsx (parse + remplace GhcContract + stocke
//     le fichier + ligne d'historique téléchargeable). N'applique PAS aux dossiers.
//  2. « Appliquer l'excel GHC » → applique GhcContract aux dossiers PAR TRANCHES (fill-only,
//     aiguillage ODR/RS, rapport de divergences). Actif UNIQUEMENT après un import réussi.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Upload, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CHUNK = 150;

export function GhcImportControls({ sourceRows, currentVersionHref }: { sourceRows: number; currentVersionHref: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [freshImport, setFreshImport] = useState(false); // un nouvel excel a été versé cette session

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [agg, setAgg] = useState({ dossiersClean: 0, versOdr: 0, versRs: 0, divergences: 0 });
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const cancelRef = useRef(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // permet de re-sélectionner le même fichier
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { toast.error("Format attendu : .xlsx"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ghc/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      setFreshImport(true);
      setDone(false);
      toast.success(`Excel importé (${j.label}) : ${j.count} contrats chargés. Clique « Appliquer » pour propager aux dossiers.`);
      router.refresh(); // met à jour l'historique + le compteur (l'état client est conservé)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import échoué");
    } finally {
      setUploading(false);
    }
  }

  async function chunk(offset: number, runId: string | null) {
    const res = await fetch("/api/ghc/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, limit: CHUNK, runId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
    return j as { runId: string; total: number; processed: number; done: boolean; dossiersClean: number; versOdr: number; versRs: number; divergences: number };
  }

  async function apply() {
    if (!confirm(`Appliquer l'excel GHC (${sourceRows} contrats) sur les dossiers ?\n\nMode FILL-ONLY : on remplit uniquement les champs vides — aucune valeur existante n'est écrasée. Les champs qui diffèrent partent en DIVERGENCE dans le rapport « À contrôler ». Les dossiers en « Identification » sont aiguillés (ODR / RS).`)) return;
    setRunning(true); setDone(false); cancelRef.current = false;
    setAgg({ dossiersClean: 0, versOdr: 0, versRs: 0, divergences: 0 });
    setProgress({ processed: 0, total: 0 });
    const tot = { dossiersClean: 0, versOdr: 0, versRs: 0, divergences: 0 };
    let offset = 0, runId: string | null = null;
    try {
      while (!cancelRef.current) {
        const j = await chunk(offset, runId);
        runId = j.runId;
        offset += j.processed;
        tot.dossiersClean += j.dossiersClean; tot.versOdr += j.versOdr; tot.versRs += j.versRs; tot.divergences += j.divergences;
        setAgg({ ...tot });
        setProgress({ processed: offset, total: j.total });
        if (j.done || j.processed === 0) break;
      }
      toast.success(`GHC appliqué : ${tot.dossiersClean} dossiers · ${tot.versOdr} → ODR · ${tot.versRs} → RS · ${tot.divergences} divergences.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur application GHC");
      router.refresh();
    } finally {
      setRunning(false); setDone(true);
    }
  }

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0;
  const applyDisabled = running || !freshImport;

  return (
    <div className="flex flex-col gap-3">
      {/* Ligne 1 : importer un nouvel excel + télécharger la version courante */}
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} style={{ display: "none" }} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5 w-fit">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Import…" : "Importer un nouvel excel"}
        </Button>
        <a href={currentVersionHref} download>
          <Button variant="outline" className="gap-1.5 w-fit" type="button">
            <Download className="h-4 w-4" />
            Télécharger l&apos;excel GHC
          </Button>
        </a>
      </div>

      {/* Ligne 2 : appliquer aux dossiers (actif seulement après un import) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={apply}
          disabled={applyDisabled}
          title={freshImport ? undefined : "Importe d'abord un nouvel excel pour l'appliquer"}
          className="gap-1.5 w-fit"
          style={applyDisabled ? { opacity: 0.4 } : undefined}
        >
          <Wand2 className="h-4 w-4" />
          {running ? `Application… ${pct}%` : "Appliquer l'excel GHC aux dossiers"}
        </Button>

        {running && (
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="w-fit">Arrêter</Button>
        )}
      </div>

      {!freshImport && (
        <p className="text-xs" style={{ color: "#8A8A99" }}>
          Le bouton « Appliquer » s&apos;active dès qu&apos;un nouvel excel est importé.
        </p>
      )}

      {(running || done) && (
        <div className="flex flex-col gap-1" style={{ maxWidth: 460 }}>
          <div className="flex justify-between text-xs" style={{ color: "#656576" }}>
            <span>Application de l&apos;excel GHC…</span>
            <span>{progress.processed}{progress.total ? ` / ${progress.total}` : ""}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#EEE" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#4E49FC" }} />
          </div>
          <p className="text-xs" style={{ color: "#656576" }}>
            <strong style={{ color: "#13762C" }}>{agg.dossiersClean}</strong> dossiers · {agg.versOdr} → ODR · {agg.versRs} → RS · {agg.divergences} divergences
            {running ? " · en cours…" : " · terminé"}
          </p>
        </div>
      )}
    </div>
  );
}
