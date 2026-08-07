"use client";

// Contrôles admin — Automatisation 3. Deux commandes sur l'étape « Récupération
// du RS » : (1) « Vérifier les courtiers » = classe les dossiers en 3 buckets
// (vert / orange / rouge) ; (2) « Remplir automatiquement les mails courtiers »
// = complète via la base les dossiers « courtier valable mais sans mail ». L'état
// final est ré-affiché après remplissage.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, XCircle, ListChecks, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Counts = { vert: number; orange: number; rouge: number };
type OrangeRow = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; courtier: string | null; refNom: string | null; mail: string | null; fillable: boolean; fillEmail: string | null };
type Audit = { counts: Counts; total: number; fillable: number; orange: OrangeRow[] };

function Buckets({ counts, total }: { counts: Counts; total: number }) {
  const items = [
    { key: "vert", label: "Courtier + mail", n: counts.vert, icon: CheckCircle2, bg: "#EAF7EE", fg: "#13762C", bd: "#B7E4C4" },
    { key: "orange", label: "Courtier sans mail / mail incohérent", n: counts.orange, icon: AlertTriangle, bg: "#FDF0D5", fg: "#B4690E", bd: "#F3D9A6" },
    { key: "rouge", label: "Sans courtier (ou assureur à la place)", n: counts.rouge, icon: XCircle, bg: "#FDECEA", fg: "#CA1E12", bd: "#F5C6C0" },
  ] as const;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.key} style={{ border: `1px solid ${it.bd}`, background: it.bg, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: it.fg }}>
              <Icon size={16} />
              <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{it.n}</span>
              <span style={{ fontSize: 12, color: "#656576", marginLeft: "auto" }}>{total ? Math.round((it.n / total) * 100) : 0}%</span>
            </div>
            <div style={{ fontSize: 12, color: "#656576", marginTop: 6 }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CourtierAuditControls() {
  const router = useRouter();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [after, setAfter] = useState<{ counts: Counts; total: number; fillable: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [filling, setFilling] = useState(false);
  const [showOrange, setShowOrange] = useState(false);

  async function verify() {
    setLoading(true);
    setAfter(null);
    try {
      const res = await fetch("/api/courtier/audit");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      setAudit(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la vérification");
    } finally {
      setLoading(false);
    }
  }

  async function autofill() {
    if (!audit) return;
    setFilling(true);
    try {
      const res = await fetch("/api/courtier/autofill", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      setAfter(data.after);
      toast.success(`${data.filled} mail(s) courtier rempli(s) via la base.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du remplissage");
    } finally {
      setFilling(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#26262C", marginBottom: 8 }}>Audit des courtiers — étape « Récupération du RS »</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button onClick={verify} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}
          Vérifier les courtiers
        </Button>
        <Button onClick={autofill} disabled={!audit || filling || audit.fillable === 0} size="sm">
          {filling ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          Remplir automatiquement les mails courtiers{audit ? ` (${audit.fillable})` : ""}
        </Button>
      </div>

      {audit && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#A2A1AF", marginBottom: 6 }}>
            {after ? "Avant remplissage" : `${audit.total} dossiers en « Récupération du RS »`}
          </div>
          <Buckets counts={audit.counts} total={audit.total} />

          {audit.orange.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowOrange((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#B4690E", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {showOrange ? "▾" : "▸"} Détail des {audit.orange.length} dossiers orange (à checker avant remplissage) — {audit.fillable} remplissable(s)
              </button>
              {showOrange && (
                <div style={{ marginTop: 8, maxHeight: 340, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                        {["Adresse", "Assureur", "Courtier", "Mail courtier"].map((h) => (
                          <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {audit.orange.map((r) => (
                        <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: r.fillable ? "#FCFEFC" : undefined }}>
                          <td style={{ padding: "6px 10px", color: "#26262C" }}>
                            <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a>
                          </td>
                          <td style={{ padding: "6px 10px", color: "#656576" }}>{r.assureur || "—"}</td>
                          <td style={{ padding: "6px 10px", color: "#656576" }}>
                            {r.courtier || "—"}{r.refNom && r.refNom !== r.courtier ? <span style={{ color: "#A2A1AF" }}> (→{r.refNom})</span> : null}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            {r.fillable ? (
                              <span style={{ color: "#13762C" }}>proposé : {r.fillEmail}</span>
                            ) : r.mail ? (
                              <span style={{ color: "#B4690E" }}>{r.mail}</span>
                            ) : (
                              <span style={{ color: "#A2A1AF", fontStyle: "italic" }}>hors base — non remplissable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ fontSize: 11, color: "#A2A1AF", marginTop: 6 }}>
                Lignes vertes = mail proposé via la base (seront remplies). Lignes orange = mail présent mais d&apos;un autre domaine/cabinet (à vérifier). Clique une adresse pour ouvrir le dossier.
              </p>
            </div>
          )}
        </div>
      )}

      {after && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#13762C", marginBottom: 6 }}>État final après remplissage</div>
          <Buckets counts={after.counts} total={after.total} />
        </div>
      )}
    </div>
  );
}
