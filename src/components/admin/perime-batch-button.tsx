"use client";

// Automatisation 8 « clean avis d'échéance » — contrôles admin (données périmées).
// - « Trouver tous les dossiers aux données périmées » : identifie les dossiers à
//   échéance dépassée (> 6 mois) et pose/retire la mention (réconciliation).
// - « Vérifier 10 dossiers » : run court (10 nouveaux dossiers non encore tentés).
// - « Vérifier tous les dossiers aux données périmées » : parcourt en tranches tous
//   les dossiers flagués non encore tentés. Curseur persistant côté serveur → les
//   runs suivants ne prennent QUE de nouveaux dossiers. Barre de progression + live.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CHUNK = 5; // Front + Claude par dossier → tranches courtes

export function PerimeBatchButton({ stock }: { stock: number }) {
  const router = useRouter();
  const [running, setRunning] = useState<null | "find" | "10" | "all">(null);
  const [done, setDone] = useState(false);
  const [agg, setAgg] = useState({ processed: 0, resolved: 0 });
  const [denom, setDenom] = useState(0);
  const cancelRef = useRef(false);

  async function chunk(limit: number) {
    const res = await fetch("/api/perime/verify/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
    return j as { processed: number; resolved: number; done: boolean };
  }

  async function find() {
    setRunning("find");
    try {
      const res = await fetch("/api/perime/find", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      toast.success(`${j.concerned} dossier(s) aux données périmées (${j.flagged} ajouté(s), ${j.unflagged} retiré(s)).`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur détection");
    } finally {
      setRunning(null);
    }
  }

  async function run(mode: "10" | "all") {
    setRunning(mode);
    setDone(false);
    setAgg({ processed: 0, resolved: 0 });
    setDenom(mode === "10" ? Math.min(10, stock) : stock);
    cancelRef.current = false;
    const total = { processed: 0, resolved: 0 };
    try {
      if (mode === "10") {
        const j = await chunk(10);
        total.processed += j.processed; total.resolved += j.resolved;
        setAgg({ ...total });
      } else {
        while (!cancelRef.current) {
          const j = await chunk(CHUNK);
          total.processed += j.processed; total.resolved += j.resolved;
          setAgg({ ...total });
          if (j.done || j.processed === 0) break;
        }
      }
      toast.success(`Vérif terminée : ${total.resolved} dossier(s) résolu(s) sur ${total.processed} traité(s).`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur batch données périmées");
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
        <Button variant="outline" onClick={find} disabled={isRunning} className="gap-1.5 w-fit">
          <Search className="h-4 w-4" />
          {running === "find" ? "Détection…" : "Trouver tous les dossiers aux données périmées"}
        </Button>
        <Button variant="outline" onClick={() => run("10")} disabled={isRunning || stock === 0} className="gap-1.5 w-fit">
          <Zap className="h-4 w-4" />
          {running === "10" ? `Vérification… ${agg.processed}/10` : "Vérifier 10 dossiers"}
        </Button>
        <Button onClick={() => run("all")} disabled={isRunning || stock === 0} className="gap-1.5 w-fit">
          <Zap className="h-4 w-4" />
          {running === "all" ? `Vérification… ${agg.processed}` : `Vérifier tous les dossiers aux données périmées (${stock})`}
        </Button>
        {running === "all" && (
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="w-fit">
            Arrêter
          </Button>
        )}
      </div>

      {(running === "10" || running === "all" || done) && (
        <div className="flex flex-col gap-1" style={{ maxWidth: 460 }}>
          <div className="flex justify-between text-xs" style={{ color: "#656576" }}>
            <span>Récupération des données récentes dans Front…</span>
            <span>{agg.processed}{denom ? ` / ${denom}` : ""}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#EEE" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${denom > 0 ? Math.min(100, Math.round((agg.processed / denom) * 100)) : 0}%`, background: "#4E49FC" }} />
          </div>
          <p className="text-xs" style={{ color: "#656576" }}>
            <strong style={{ color: "#13762C" }}>{agg.resolved}</strong> dossier{agg.resolved > 1 ? "s" : ""} résolu{agg.resolved > 1 ? "s" : ""}
            {running ? " · en cours…" : " · terminé"}
          </p>
        </div>
      )}
    </div>
  );
}
