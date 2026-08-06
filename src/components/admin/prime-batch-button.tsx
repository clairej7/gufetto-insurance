"use client";

// Automatisation 8 « clean prime » — contrôles admin.
// - « Trouver tous les dossiers sans prime » : rafraîchit le compteur.
// - « Vérifier 10 dossiers » : run court (10 nouveaux dossiers non encore tentés).
// - « Vérifier tous les dossiers sans prime » : parcourt en tranches tous les
//   dossiers non encore tentés. Chaque run marque les dossiers vus (curseur
//   persistant côté serveur) → les runs suivants ne prennent QUE de nouveaux
//   dossiers. Compteur live + barre de progression. Un instantané d'historique
//   est enregistré en fin de run. Aucun changement d'étape.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CHUNK = 5; // Front + Claude par dossier → tranches courtes

export function PrimeBatchButton({ stock }: { stock: number }) {
  const router = useRouter();
  const [running, setRunning] = useState<null | "10" | "all">(null);
  const [done, setDone] = useState(false);
  const [agg, setAgg] = useState({ processed: 0, resolved: 0, montant: 0 });
  const [denom, setDenom] = useState(0);
  const cancelRef = useRef(false);

  const eur = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €";

  async function chunk(limit: number) {
    const res = await fetch("/api/prime/verify/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
    return j as { processed: number; resolved: number; montant: number; done: boolean };
  }

  async function run(mode: "10" | "all") {
    setRunning(mode);
    setDone(false);
    setAgg({ processed: 0, resolved: 0, montant: 0 });
    setDenom(mode === "10" ? Math.min(10, stock) : stock);
    cancelRef.current = false;
    const total = { processed: 0, resolved: 0, montant: 0 };
    try {
      if (mode === "10") {
        const j = await chunk(10);
        total.processed += j.processed; total.resolved += j.resolved; total.montant += j.montant;
        setAgg({ ...total });
      } else {
        while (!cancelRef.current) {
          const j = await chunk(CHUNK);
          total.processed += j.processed; total.resolved += j.resolved; total.montant += j.montant;
          setAgg({ ...total });
          if (j.done || j.processed === 0) break;
        }
      }
      if (total.processed > 0) {
        try { await fetch("/api/prime/snapshot", { method: "POST" }); } catch { /* non bloquant */ }
      }
      toast.success(`Vérif terminée : ${total.resolved} prime(s) récupérée(s) · ${eur(total.montant)} sur ${total.processed} dossier(s).`);
      router.refresh();
    } catch (e) {
      if (total.processed > 0) { try { await fetch("/api/prime/snapshot", { method: "POST" }); } catch { /* */ } }
      toast.error(e instanceof Error ? e.message : "Erreur batch prime");
      router.refresh();
    } finally {
      setRunning(null);
      setDone(true);
    }
  }

  const isRunning = running !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => router.refresh()} disabled={isRunning} className="gap-1.5 w-fit">
          <Search className="h-4 w-4" />
          Trouver tous les dossiers sans prime
        </Button>
        <Button variant="outline" onClick={() => run("10")} disabled={isRunning || stock === 0} className="gap-1.5 w-fit">
          <Zap className="h-4 w-4" />
          {running === "10" ? `Vérification… ${agg.processed}/10` : "Vérifier 10 dossiers"}
        </Button>
        <Button onClick={() => run("all")} disabled={isRunning || stock === 0} className="gap-1.5 w-fit">
          <Zap className="h-4 w-4" />
          {running === "all" ? `Vérification… ${agg.processed}` : `Vérifier tous les dossiers sans prime (${stock})`}
        </Button>
        {running === "all" && (
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="w-fit">
            Arrêter
          </Button>
        )}
      </div>

      {(isRunning || done) && (
        <div className="flex flex-col gap-1" style={{ maxWidth: 460 }}>
          <div className="flex justify-between text-xs" style={{ color: "#656576" }}>
            <span>Vérification des dossiers sans prime…</span>
            <span>{agg.processed}{denom ? ` / ${denom}` : ""}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#EEE" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${denom > 0 ? Math.min(100, Math.round((agg.processed / denom) * 100)) : 0}%`, background: "#4E49FC" }} />
          </div>
          <p className="text-xs" style={{ color: "#656576" }}>
            <strong style={{ color: "#13762C" }}>{agg.resolved}</strong> prime{agg.resolved > 1 ? "s" : ""} récupérée{agg.resolved > 1 ? "s" : ""} ·{" "}
            <strong style={{ color: "#13762C" }}>{eur(agg.montant)}</strong> récupérés
            {isRunning ? " · en cours…" : " · terminé"}
          </p>
        </div>
      )}
    </div>
  );
}
