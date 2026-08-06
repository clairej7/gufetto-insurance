"use client";

// Automatisation 8 — volet 3 « correction GetHumanCall ». Applique l'excel GHC
// (table GhcContract) sur les dossiers : écrase assureur/courtier/n°/prime/échéance,
// aiguille les « identifie » (ODR/RS), enregistre un run + le rapport de divergences.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GhcApplyButton({ sourceRows }: { sourceRows: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function apply() {
    if (!confirm(`Appliquer l'excel GHC (${sourceRows} contrats) sur les dossiers ?\n\nGHC = source prioritaire : les données seront écrasées (assureur, courtier, n°, prime, échéance) et les dossiers en « Identification » seront aiguillés (ODR / RS).`)) return;
    setRunning(true);
    try {
      const res = await fetch("/api/ghc/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      toast.success(`GHC appliqué : ${j.dossiersClean} dossiers · ${j.assureursMaj} assureurs · ${j.primesMaj} primes · ${j.echeancesMaj} échéances · ${j.versOdr} → ODR · ${j.versRs} → RS · ${j.divergences} divergences.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur import GHC");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={apply} disabled={running} className="gap-1.5 w-fit">
      <Wand2 className="h-4 w-4" />
      {running ? "Application en cours… (~30 s)" : "Appliquer l'excel GHC aux dossiers"}
    </Button>
  );
}
