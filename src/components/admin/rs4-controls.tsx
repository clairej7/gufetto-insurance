"use client";

// Automatisation 4 — 3 volets.
// Volet 1 : vérification de l'échantillon chargé depuis l'auto 3 (à date) → tri
//           complets / incomplets + 2 déroulés de contrôle.
// Volet 2 : envoi des mails aux courtiers (à venir).
// Volet 3 : dossiers en cours + boucle de relances (à venir).

import { useState } from "react";
import { ListChecks, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Row = { pipelineId: string; nom: string; assureur: string | null; numeroContrat: string | null; courtier: string | null; mail: string | null; manque: string[] };
type Sample = { total: number; complete: number; incomplete: number; completeRows: Row[]; incompleteRows: Row[] };

const COLS = ["Copropriété", "Assureur", "N° de contrat", "Courtier", "Mail courtier"] as const;

function Table({ rows, showManque }: { rows: Row[]; showManque?: boolean }) {
  return (
    <div style={{ marginTop: 8, maxHeight: 340, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
            {[...COLS, ...(showManque ? ["Manque"] : [])].map((h) => (
              <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
              <td style={{ padding: "6px 10px", color: "#26262C" }}>
                <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.nom}</a>
              </td>
              <td style={{ padding: "6px 10px", color: r.assureur ? "#656576" : "#CA1E12" }}>{r.assureur || "manquant"}</td>
              <td style={{ padding: "6px 10px", color: r.numeroContrat ? "#656576" : "#CA1E12" }}>{r.numeroContrat || "manquant"}</td>
              <td style={{ padding: "6px 10px", color: "#656576" }}>{r.courtier || "—"}</td>
              <td style={{ padding: "6px 10px", color: r.mail ? "#13762C" : "#CA1E12" }}>{r.mail || "manquant"}</td>
              {showManque && <td style={{ padding: "6px 10px", color: "#B4690E" }}>{r.manque.join(", ")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VoletTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#26262C", margin: "0 0 8px" }}>
      <span style={{ color: "#A2A1AF" }}>Volet {n} — </span>{children}
    </div>
  );
}

export function Rs4Controls({ batchCount, volet2Count }: { batchCount: number; volet2Count: number }) {
  const [sample, setSample] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [volet2, setVolet2] = useState(volet2Count);
  const [showComplete, setShowComplete] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);

  async function verify() {
    setLoading(true);
    try {
      const res = await fetch("/api/rs4/verify");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      setSample(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la vérification");
    } finally {
      setLoading(false);
    }
  }

  async function moveToVolet2() {
    if (!sample || sample.complete === 0) return;
    if (!window.confirm(`Passer les ${sample.complete} dossier(s) « infos complètes » au volet 2 (envoi des mails) ?`)) return;
    setMoving(true);
    try {
      const res = await fetch("/api/rs4/move-to-volet2", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      setVolet2(data.volet2Total);
      toast.success(`${data.moved} dossier(s) passé(s) au volet 2.`);
      await verify(); // les dossiers passés sortent du volet 1
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du passage au volet 2");
    } finally {
      setMoving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Volet 1 ── */}
      <div>
        <VoletTitle n={1}>Vérification de l&apos;échantillon</VoletTitle>
        <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
          Échantillon à date : <strong>{batchCount}</strong> dossier{batchCount > 1 ? "s" : ""} chargé{batchCount > 1 ? "s" : ""} depuis l&apos;automatisation 3 (mis à jour au fil des envois).
        </p>
        <Button onClick={verify} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
          Vérifier l&apos;échantillon
        </Button>

        {sample && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              <div style={{ border: "1px solid #B7E4C4", background: "#EAF7EE", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#13762C" }}>
                  <CheckCircle2 size={16} /><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{sample.complete}</span>
                  <span style={{ fontSize: 12, color: "#656576", marginLeft: "auto" }}>{sample.total ? Math.round((sample.complete / sample.total) * 100) : 0}%</span>
                </div>
                <div style={{ fontSize: 12, color: "#656576", marginTop: 6 }}>Infos complètes (assureur + n° contrat + mail)</div>
              </div>
              <div style={{ border: "1px solid #F3D9A6", background: "#FDF0D5", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#B4690E" }}>
                  <AlertTriangle size={16} /><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{sample.incomplete}</span>
                  <span style={{ fontSize: 12, color: "#656576", marginLeft: "auto" }}>{sample.total ? Math.round((sample.incomplete / sample.total) * 100) : 0}%</span>
                </div>
                <div style={{ fontSize: 12, color: "#656576", marginTop: 6 }}>Infos incomplètes (au moins un champ manquant)</div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {sample.complete > 0 && (
                <div>
                  <button onClick={() => setShowComplete((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#13762C", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {showComplete ? "▾" : "▸"} Détail des {sample.complete} dossiers complets
                  </button>
                  {showComplete && <Table rows={sample.completeRows} />}
                </div>
              )}
              {sample.incomplete > 0 && (
                <div>
                  <button onClick={() => setShowIncomplete((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#B4690E", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {showIncomplete ? "▾" : "▸"} Détail des {sample.incomplete} dossiers incomplets
                  </button>
                  {showIncomplete && <Table rows={sample.incompleteRows} showManque />}
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <Button onClick={moveToVolet2} disabled={moving || sample.complete === 0} size="sm">
                {moving ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                Passer les {sample.complete} dossiers complets au volet 2
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Volet 2 ── */}
      <div>
        <VoletTitle n={2}>Envoi des mails aux courtiers</VoletTitle>
        {volet2 > 0 && (
          <p style={{ fontSize: 13, color: "#656576", margin: "0 0 6px" }}>
            <strong style={{ color: "#13762C" }}>{volet2}</strong> dossier{volet2 > 1 ? "s" : ""} chargé{volet2 > 1 ? "s" : ""} depuis le volet 1.
          </p>
        )}
        <p style={{ fontSize: 12, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Envoi des mails : infos à venir.</p>
      </div>

      {/* ── Volet 3 ── */}
      <div>
        <VoletTitle n={3}>Dossiers toujours en cours · boucle de relances</VoletTitle>
        <p style={{ fontSize: 12, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Infos à venir.</p>
      </div>
    </div>
  );
}
