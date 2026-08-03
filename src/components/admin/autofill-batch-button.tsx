"use client";

// Bouton batch (admin) — automatisation 1 : lance l'autofill Front sur un lot de
// dossiers "Aucune action" et affiche le récap (aiguillés RS / ODR / non fiables).

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Stats = { traites: number; versRs: number; versOdr: number; nonFiables: number; erreurs: number };

export function AutofillBatchButton({ limit = 25 }: { limit?: number }) {
  const [isPending, startTransition] = useTransition();
  const [stats, setStats] = useState<Stats | null>(null);

  function handleClick() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
        setStats(json.stats);
        toast.success(
          `Autofill : ${json.stats.traites} traités · ${json.stats.versRs} → RS · ${json.stats.versOdr} → ODR · ${json.stats.nonFiables} non fiables`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur batch autofill");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={isPending} className="gap-1.5 w-fit">
        <Zap className="h-4 w-4" />
        {isPending ? "Traitement…" : `Pré-remplir les dossiers (lot de ${limit})`}
      </Button>
      {stats && (
        <p className="text-xs" style={{ color: "#656576" }}>
          {stats.traites} traités · {stats.versRs} → RS en cours · {stats.versOdr} → ODR ·{" "}
          {stats.nonFiables} restés en « Aucune action » · {stats.erreurs} erreurs
        </p>
      )}
    </div>
  );
}
