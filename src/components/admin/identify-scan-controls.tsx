"use client";

// Volet 2 de l'automatisation 1 — « Identification des dossiers ».
// Scanne les dossiers en « Identification », affiche un verdict de routage par
// dossier (ODR / RS / reste), et n'applique le déplacement qu'après validation
// (cases à cocher + bouton « Valider »). Barre de progression + historique.

import { useState } from "react";
import { Search, Loader2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Verdict = "odr" | "rs" | "manquant";
type Row = {
  pipelineId: string; nom: string; adresse: string | null;
  assureur: string | null; courtier: string | null; numeroContrat: string | null;
  verdict: Verdict; target: "odr_en_cours" | "rs_en_cours" | "identifie"; raison: string;
};
type HistoryEntry = { batchId: string; date: string; odr: number; rs: number; total: number; by: string };

const PAGE = 50;

const BADGE: Record<Verdict, { label: string; color: string; bg: string }> = {
  odr: { label: "→ ODR", color: "#7A3E00", bg: "#FDECD2" },
  rs: { label: "→ RS", color: "#13497A", bg: "#DCEBFB" },
  manquant: { label: "Reste", color: "#8A8A99", bg: "#F1F1F4" },
};

export function IdentifyScanControls({ total, history }: { total: number; history: HistoryEntry[] }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  async function scan() {
    setScanning(true);
    setDone(false);
    setRows([]);
    setScanned(0);
    setChecked(new Set());
    const acc: Row[] = [];
    let offset = 0;
    let tot = total;
    try {
      do {
        const res = await fetch("/api/autofill/identify/scan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: PAGE }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
        tot = json.total ?? tot;
        acc.push(...(json.rows as Row[]));
        offset += PAGE;
        setScanned(Math.min(offset, tot));
        setRows([...acc]);
      } while (offset < tot);
      // Coche par défaut tous les dossiers routables (ODR / RS).
      setChecked(new Set(acc.filter((r) => r.verdict !== "manquant").map((r) => r.pipelineId)));
      toast.success(`Scan terminé : ${acc.length} dossiers analysés.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur pendant le scan");
    } finally {
      setScanning(false);
      setDone(true);
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const routables = rows.filter((r) => r.verdict !== "manquant");
  const nOdr = rows.filter((r) => r.verdict === "odr").length;
  const nRs = rows.filter((r) => r.verdict === "rs").length;
  const nReste = rows.filter((r) => r.verdict === "manquant").length;
  const nChecked = routables.filter((r) => checked.has(r.pipelineId)).length;
  const pct = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;

  async function valider() {
    const items = routables
      .filter((r) => checked.has(r.pipelineId))
      .map((r) => ({ pipelineId: r.pipelineId, target: r.target }));
    if (!items.length) { toast.info("Aucun dossier coché."); return; }
    setApplying(true);
    try {
      const res = await fetch("/api/autofill/identify/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, batchId: `${Date.now()}` }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
      toast.success(`Validé : ${json.odr} → ODR · ${json.rs} → RS${json.ignores ? ` · ${json.ignores} ignorés` : ""}.`);
      // Retire les dossiers déplacés de la liste affichée.
      const movedIds = new Set(items.map((i) => i.pipelineId));
      setRows((prev) => prev.filter((r) => !movedIds.has(r.pipelineId)));
      setChecked(new Set());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la validation");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p style={{ fontSize: 13, color: "#656576", margin: 0 }}>
        {total} dossier{total > 1 ? "s" : ""} à l'étape « Identification » à passer en revue. Le scan propose un
        routage (ODR / RS) à partir des infos déjà présentes ; rien n'est déplacé avant ta validation.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={scan} disabled={scanning} className="gap-1.5 w-fit">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {scanning ? `Scan… ${scanned}/${total}` : "Scanner les dossiers"}
        </Button>
        {done && routables.length > 0 && (
          <Button onClick={valider} disabled={applying || nChecked === 0} className="gap-1.5 w-fit" style={{ background: "#13762C" }}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Valider {nChecked} dossier{nChecked > 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {(scanning || done) && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full" style={{ background: "#EEE" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#4E49FC" }} />
          </div>
          {done && (
            <p className="text-xs" style={{ color: "#656576" }}>
              {rows.length} analysés · <b style={{ color: "#7A3E00" }}>{nOdr} → ODR</b> ·{" "}
              <b style={{ color: "#13497A" }}>{nRs} → RS</b> · {nReste} restent en Identification
            </p>
          )}
        </div>
      )}

      {done && rows.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#EBEBF0" }}>
          <div className="max-h-[420px] overflow-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#8A8A99" }}>
                  {["", "Copropriété", "Assureur", "Courtier", "N° contrat", "Verdict", "Raison"].map((h, i) => (
                    <th key={i} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = BADGE[r.verdict];
                  const routable = r.verdict !== "manquant";
                  return (
                    <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: routable ? undefined : "#FCFCFD" }}>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>
                        {routable ? (
                          <input type="checkbox" checked={checked.has(r.pipelineId)} onChange={() => toggle(r.pipelineId)} />
                        ) : null}
                      </td>
                      <td style={{ padding: "6px 10px", color: "#26262C" }}>
                        <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.adresse || r.nom}</a>
                      </td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.assureur || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.courtier || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.numeroContrat || "—"}</td>
                      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: b.color, background: b.bg, borderRadius: 999, padding: "2px 8px" }}>{b.label}</span>
                      </td>
                      <td style={{ padding: "6px 10px", color: "#8A8A99" }}>{r.raison}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historique des validations */}
      <div style={{ borderTop: "1px solid #F1F1F4", paddingTop: 10 }}>
        <button onClick={() => setHistOpen((o) => !o)} className="text-xs font-semibold flex items-center gap-1" style={{ color: "#4E49FC" }}>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${histOpen ? "rotate-180" : ""}`} />
          Historique des validations ({history.length})
        </button>
        {histOpen && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {history.length === 0 && <p className="text-xs" style={{ color: "#A2A1AF" }}>Aucune validation pour l'instant.</p>}
            {history.map((h) => (
              <div key={h.batchId} className="text-xs" style={{ color: "#656576", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: "#26262C", fontWeight: 600 }}>{new Date(h.date).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span>{h.total} routés</span>
                <span style={{ color: "#7A3E00" }}>{h.odr} → ODR</span>
                <span style={{ color: "#13497A" }}>{h.rs} → RS</span>
                <span style={{ color: "#A2A1AF" }}>{h.by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
