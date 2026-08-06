"use client";

// Automatisation 8 « clean prime » — contrôles admin.
// - « Trouver tous les dossiers sans prime » : rafraîchit le compteur de dossiers
//   sans prime (identification).
// - « Vérifier tous les dossiers sans prime » : parcourt en tranches (curseur) tous
//   les dossiers sans prime, cherche la prime dans Front, et affiche en direct le
//   nombre de dossiers résolus + le montant récupéré. Aucun changement d'étape.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CHUNK = 5; // Front + Claude par dossier → tranches courtes

export function PrimeBatchButton({ stock }: { stock: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [agg, setAgg] = useState({ processed: 0, resolved: 0, montant: 0 });
  const cancelRef = useRef(false);

  const eur = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €";

  async function run() {
    setRunning(true);
    setDone(false);
    setAgg({ processed: 0, resolved: 0, montant: 0 });
    cancelRef.current = false;
    const total = { processed: 0, resolved: 0, montant: 0 };
    let cursor = "";
    try {
      while (!cancelRef.current) {
        const res = await fetch("/api/prime/verify/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor, limit: CHUNK }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
        total.processed += j.processed;
        total.resolved += j.resolved;
        total.montant += j.montant;
        cursor = j.nextCursor;
        setAgg({ ...total });
        if (j.done || j.processed === 0) break;
      }
      toast.success(`Vérif terminée : ${total.resolved} prime(s) récupérée(s) · ${eur(total.montant)} sur ${total.processed} dossier(s).`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur batch prime");
      router.refresh();
    } finally {
      setRunning(false);
      setDone(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => router.refresh()} disabled={running} className="gap-1.5 w-fit">
          <Search className="h-4 w-4" />
          Trouver tous les dossiers sans prime
        </Button>
        <Button onClick={run} disabled={running || stock === 0} className="gap-1.5 w-fit">
          <Zap className="h-4 w-4" />
          {running ? `Vérification… ${agg.processed}` : `Vérifier tous les dossiers sans prime (${stock})`}
        </Button>
        {running && (
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="w-fit">
            Arrêter
          </Button>
        )}
      </div>

      {(running || done) && (
        <p className="text-xs" style={{ color: "#656576" }}>
          <strong style={{ color: "#13762C" }}>{agg.resolved}</strong> prime{agg.resolved > 1 ? "s" : ""} récupérée{agg.resolved > 1 ? "s" : ""} ·{" "}
          <strong style={{ color: "#13762C" }}>{eur(agg.montant)}</strong> récupérés · {agg.processed} dossier{agg.processed > 1 ? "s" : ""} vérifié{agg.processed > 1 ? "s" : ""}
          {running ? " · en cours…" : ""}
        </p>
      )}
    </div>
  );
}
