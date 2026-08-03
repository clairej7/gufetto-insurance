"use client";

// Bouton "Récupérer via Front" (automatisation 1) — sur la fiche d'un dossier.
// Récupère les 3 infos (mail courtier, assureur, n° de contrat) depuis Front,
// remplit les champs et aiguille le dossier (ODR / RS en cours / reste).

import { useTransition } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { autofillDossierFromFront } from "@/lib/rs-autofill";

export function AutofillFrontButton({ pipelineId }: { pipelineId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const r = await autofillDossierFromFront(pipelineId);
        const info = r.info;
        if (info?.reliable) {
          const dest = r.moved
            ? ` → ${r.targetStatut === "odr_en_cours" ? "ODR" : "RS en cours"}`
            : "";
          const num = info.numeroContrat ? ` · n° ${info.numeroContrat}` : "";
          toast.success(`Front : ${info.assureur ?? "assureur ?"}${num}${dest}`, {
            description: info.mailCourtier ?? undefined,
          });
        } else {
          toast.message("Front : infos insuffisantes — reste en « Aucune action »", {
            description: info?.reasons.join(" · "),
          });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la récupération Front");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending} className="gap-1.5">
      <Zap className="h-4 w-4" />
      {isPending ? "Récupération…" : "Récupérer via Front"}
    </Button>
  );
}
