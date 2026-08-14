"use client";

// Automatisation 8 — volet 3 « correction GetHumanCall ». Applique l'excel GHC
// (table GhcContract) sur les dossiers, PAR TRANCHES → barre de progression.
// Écrase assureur/courtier/n°/prime/échéance, aiguille les « identifie » (ODR/RS),
// enregistre un run (incrémenté à chaque tranche) + le rapport de divergences.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CHUNK = 150;

export function GhcApplyButton({ sourceRows }: { sourceRows: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [agg, setAgg] = useState({ dossiersClean: 0, versOdr: 0, versRs: 0, divergences: 0 });
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const cancelRef = useRef(false);

  async function chunk(offset: number, runId: string | null) {
    const res = await fetch("/api/ghc/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, limit: CHUNK, runId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
    return j as { runId: string; total: number; processed: number; done: boolean; dossiersClean: number; assureursMaj: number; primesMaj: number; echeancesMaj: number; versOdr: number; versRs: number; divergences: number };
  }

  async function apply() {
    if (!confirm(`Appliquer l'excel GHC (${sourceRows} contrats) sur les dossiers ?\n\nMode FILL-ONLY : on remplit uniquement les champs vides (assureur, courtier, n°, prime, échéance) — aucune valeur existante n'est écrasée. Les champs qui diffèrent partent en DIVERGENCE dans le rapport « À contrôler ». Les dossiers en « Identification » sont aiguillés (ODR / RS).`)) return;
    setRunning(true); setDone(false); cancelRef.current = false;
    setAgg({ dossiersClean: 0, versOdr: 0, versRs: 0, divergences: 0 });
    setProgress({ processed: 0, total: 0 });
    const tot = { dossiersClean: 0, versOdr: 0, versRs: 0, divergences: 0 };
    let offset = 0, runId: string | null = null;
    try {
      // eslint-disable-next-line no-constant-condition
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur import GHC");
      router.refresh();
    } finally {
      setRunning(false); setDone(true);
    }
  }

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={apply} disabled={running} className="gap-1.5 w-fit">
          <Wand2 className="h-4 w-4" />
          {running ? `Application… ${pct}%` : "Appliquer l'excel GHC aux dossiers"}
        </Button>
        {running && (
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="w-fit">Arrêter</Button>
        )}
      </div>

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
