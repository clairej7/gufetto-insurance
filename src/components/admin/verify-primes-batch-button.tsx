"use client";

// Bouton batch (admin) — automatisation 6 : vérifie d'un coup la dernière prime
// payée de toutes les comparaisons de devis en cours (statut devis_recus) et
// signale celles à recaler (prime réelle > contrat) et les cas étranges.
// AUDIT lecture seule (pas d'écriture pour l'instant). Enchaîne des lots via
// `offset` (appels Front séquentiels bornés) et affiche la progression + la liste.

import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Stats = {
  verifies: number;
  recale: number;
  coherent: number;
  bloque: number;
  introuvable: number;
  erreurs: number;
};
const EMPTY: Stats = { verifies: 0, recale: 0, coherent: 0, bloque: 0, introuvable: 0, erreurs: 0 };
type Item = { nom: string; contrat: number | null; prime: number; verdict: "recale" | "etrange" };

const CHUNK = 10;

export function VerifyPrimesBatchButton({ stock }: { stock: number }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(stock);
  const [agg, setAgg] = useState<Stats>(EMPTY);
  const [items, setItems] = useState<Item[]>([]);
  const cancelRef = useRef(false);

  async function run() {
    setRunning(true);
    setDone(false);
    setProgress(0);
    setAgg(EMPTY);
    setItems([]);
    cancelRef.current = false;

    let offset = 0;
    const acc: Stats = { ...EMPTY };
    const list: Item[] = [];

    try {
      while (!cancelRef.current) {
        const res = await fetch("/api/devis/prime-payee/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: CHUNK }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);

        const s: Stats = json.stats;
        acc.verifies += s.verifies;
        acc.recale += s.recale;
        acc.coherent += s.coherent;
        acc.bloque += s.bloque;
        acc.introuvable += s.introuvable;
        acc.erreurs += s.erreurs;
        list.push(...((json.aTraiter ?? []) as Item[]));

        offset += json.count ?? 0;
        setTotal(json.total ?? total);
        setProgress(offset);
        setAgg({ ...acc });
        setItems([...list]);

        if (json.done || (json.count ?? 0) === 0) break;
      }
      toast.success(
        `Vérif terminée : ${acc.verifies} dossiers · ${acc.recale} à recaler · ${acc.bloque} étranges · ${acc.introuvable} introuvables`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur batch vérification");
    } finally {
      setRunning(false);
      setDone(true);
    }
  }

  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button onClick={run} disabled={running || stock === 0} className="gap-1.5 w-fit">
          <Search className="h-4 w-4" />
          {running ? `Vérification… ${progress}/${total}` : `Vérifier les ${stock} comparaison${stock > 1 ? "s" : ""}`}
        </Button>
        {running && (
          <Button variant="outline" onClick={() => { cancelRef.current = true; }} className="w-fit">
            Arrêter
          </Button>
        )}
      </div>

      {(running || done) && (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full" style={{ background: "#EEE" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#4E49FC" }} />
          </div>
          <p className="text-xs" style={{ color: "#656576" }}>
            {agg.verifies} vérifiés · <b style={{ color: "#955804" }}>{agg.recale} à recaler</b> · {agg.coherent} cohérents ·{" "}
            {agg.bloque} étranges · {agg.introuvable} introuvables · {agg.erreurs} err.{running ? " · en cours…" : ""}
          </p>
          {items.length > 0 && (
            <div className="text-xs rounded-lg border max-w-2xl overflow-hidden" style={{ borderColor: "#E8E8EC" }}>
              {items.slice(0, 50).map((it, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5"
                  style={{ borderTop: i ? "1px solid #F2F2F4" : "none", color: "#4E4E58" }}
                >
                  <span className="truncate pr-2">{it.nom}</span>
                  <span className="shrink-0 tabular-nums">
                    contrat {it.contrat != null ? `${it.contrat.toLocaleString("fr-FR")} €` : "—"} → prime{" "}
                    {it.prime.toLocaleString("fr-FR")} €
                    {it.verdict === "etrange" && <span style={{ color: "#CA1E12" }}> ⚠︎ étrange</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
