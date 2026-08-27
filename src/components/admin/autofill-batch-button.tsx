"use client";

// Bouton batch (admin) — automatisation 1, VOLET 1 « Remplissage des informations
// manquantes ». Complète depuis Front les champs manquants (assureur / courtier /
// n° / mail) d'un objectif de dossiers « Identification », en enchaînant des lots
// courts (chaque appel serveur reste borné → pas de timeout). N'AIGUILLE PAS : le
// routage ODR/RS est le rôle du Volet 2 (avec validation). Affiche la progression,
// le récap (complétés / sans info) et le détail déroulant des dossiers traités.

import { useRef, useState } from "react";
import { Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Stats = { traites: number; completes: number; sansInfo: number; erreurs: number };
const EMPTY: Stats = { traites: 0, completes: 0, sansInfo: 0, erreurs: 0 };

type Detail = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; numero: string | null; mail: string | null; wroteFields: boolean; champs: string[] };

// Taille d'un lot serveur (≤ 100, borne du back). 50 = requêtes courtes + progression fréquente.
const CHUNK = 50;

export function AutofillBatchButton({ defaultTarget = 5, stock }: { defaultTarget?: number; stock?: number }) {
  const [target, setTarget] = useState(defaultTarget);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agg, setAgg] = useState<Stats>(EMPTY);
  const [details, setDetails] = useState<Detail[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cancelRef = useRef(false);

  async function run() {
    const goal = Math.max(1, Math.floor(target));
    setRunning(true);
    setDone(false);
    setProgress(0);
    setAgg(EMPTY);
    setDetails([]);
    setDetailsOpen(false);
    cancelRef.current = false;

    let processed = 0;
    const total: Stats = { ...EMPTY };
    const allDetails: Detail[] = [];

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
        total.completes += s.completes;
        total.sansInfo += s.sansInfo;
        total.erreurs += s.erreurs;
        allDetails.push(...((json.details as Detail[]) ?? []));

        // Curseur persistant côté serveur (autofillTenteLe) → pas de `skip` :
        // chaque appel renvoie des dossiers frais, non re-traités.
        processed += json.count ?? 0;
        setProgress(processed);
        setAgg({ ...total });
        setDetails([...allDetails]);

        // Stock épuisé (lot plus court que demandé) ou rien traité → on s'arrête.
        if (!json.restants_potentiels || (json.count ?? 0) === 0) break;
      }
      toast.success(`Remplissage terminé : ${total.completes} complétés · ${total.sansInfo} sans info · ${total.erreurs} err.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur batch remplissage");
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
            {agg.traites} traités · <b style={{ color: "#13762C" }}>{agg.completes} complétés</b> ·{" "}
            {agg.sansInfo} sans info · {agg.erreurs} erreurs
            {running ? " · en cours…" : ""}
          </p>
        </div>
      )}

      {/* Détail des dossiers traités (menu déroulant) */}
      {done && details.length > 0 && (
        <div style={{ borderTop: "1px solid #F1F1F4", paddingTop: 10 }}>
          <button onClick={() => setDetailsOpen((o) => !o)} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#4E49FC" }}>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
            Détail des dossiers traités ({details.length})
          </button>
          {detailsOpen && (
            <div className="rounded-lg border overflow-hidden mt-2" style={{ borderColor: "#EBEBF0" }}>
              <div className="max-h-[220px] overflow-auto">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#8A8A99" }}>
                      {["Copropriété", "Assureur", "N° contrat", "Mail", "Champs complétés"].map((h, i) => (
                        <th key={i} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => (
                      <tr key={d.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: d.wroteFields ? undefined : "#FCFCFD" }}>
                        <td style={{ padding: "6px 10px", color: "#26262C" }}>
                          <a href={`/pipeline/${d.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{d.adresse || d.nom}</a>
                        </td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{d.assureur || "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{d.numero || "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{d.mail || "—"}</td>
                        <td style={{ padding: "6px 10px" }}>
                          {d.champs.length > 0
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: "#13762C", background: "#E4F3E9", borderRadius: 999, padding: "2px 8px" }}>{d.champs.join(", ")}</span>
                            : <span style={{ color: "#A2A1AF" }}>rien trouvé</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
