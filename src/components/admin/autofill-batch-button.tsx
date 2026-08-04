"use client";

// Bouton batch (admin) — automatisation 1 : lance l'autofill Front pour ATTEINDRE
// un objectif de dossiers "Aucune action" traités, en enchaînant des lots courts
// (chaque appel serveur reste borné → pas de timeout). Affiche la progression en
// direct et le récap (aiguillés RS / ODR / restés en Aucune action).

import { useRef, useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Stats = { traites: number; versRs: number; versOdr: number; nonFiables: number; erreurs: number };
const EMPTY: Stats = { traites: 0, versRs: 0, versOdr: 0, nonFiables: 0, erreurs: 0 };

// Taille d'un lot serveur (≤ 100, borne du back). 50 = requêtes courtes + progression fréquente.
const CHUNK = 50;

export function AutofillBatchButton({ defaultTarget = 100, stock }: { defaultTarget?: number; stock?: number }) {
  const [target, setTarget] = useState(defaultTarget);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agg, setAgg] = useState<Stats>(EMPTY);
  const cancelRef = useRef(false);

  async function run() {
    const goal = Math.max(1, Math.floor(target));
    setRunning(true);
    setDone(false);
    setProgress(0);
    setAgg(EMPTY);
    cancelRef.current = false;

    let processed = 0;
    const total: Stats = { ...EMPTY };

    try {
      while (processed < goal && !cancelRef.current) {
        const take = Math.min(CHUNK, goal - processed);
        const res = await fetch("/api/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: take }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);

        const s: Stats = json.stats;
        total.traites += s.traites;
        total.versRs += s.versRs;
        total.versOdr += s.versOdr;
        total.nonFiables += s.nonFiables;
        total.erreurs += s.erreurs;

        // Curseur persistant côté serveur (autofillTenteLe) → pas de `skip` :
        // chaque appel renvoie des dossiers frais, non re-traités.
        processed += json.count ?? 0;
        setProgress(processed);
        setAgg({ ...total });

        // Stock épuisé (lot plus court que demandé) ou rien traité → on s'arrête.
        if (!json.restants_potentiels || (json.count ?? 0) === 0) break;
      }
      toast.success(
        `Autofill terminé : ${total.traites} traités · ${total.versRs} → RS · ${total.versOdr} → ODR · ${total.nonFiables} restés · ${total.erreurs} err.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur batch autofill");
    } finally {
      setRunning(false);
      setDone(true);
    }
  }

  const pct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "#656576" }}>
          Objectif (dossiers à traiter)
          <input
            type="number"
            min={1}
            max={stock ?? undefined}
            value={target}
            disabled={running}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-28 rounded-md border px-2 py-1 text-sm"
            style={{ borderColor: "#E8E8EC" }}
          />
        </label>
        <Button onClick={run} disabled={running} className="gap-1.5 w-fit">
          <Zap className="h-4 w-4" />
          {running ? `Traitement… ${progress}` : `Pré-remplir ${target} dossiers`}
        </Button>
        {running && (
          <Button
            variant="outline"
            onClick={() => { cancelRef.current = true; }}
            className="w-fit"
          >
            Arrêter
          </Button>
        )}
      </div>

      {(running || done) && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full" style={{ background: "#EEE" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#4E49FC" }} />
          </div>
          <p className="text-xs" style={{ color: "#656576" }}>
            {agg.traites} traités · {agg.versRs} → RS en cours · {agg.versOdr} → ODR ·{" "}
            {agg.nonFiables} restés en « Aucune action » · {agg.erreurs} erreurs
            {running ? " · en cours…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
