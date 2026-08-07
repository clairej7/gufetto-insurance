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
type FillRow = { pipelineId: string; nom: string; courtier: string | null; refNom: string | null; email: string | null };
type IncohRow = { nom: string; courtier: string | null; mail: string | null; refNom: string | null };
type Audit = { counts: Counts; total: number; fillable: number; fillableList: FillRow[]; incoherents: IncohRow[] };

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
  const [showFill, setShowFill] = useState(false);
  const [showIncoh, setShowIncoh] = useState(false);

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

          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {audit.fillable > 0 && (
              <button onClick={() => setShowFill((v) => !v)} style={{ fontSize: 12, color: "#1F6FE0", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {showFill ? "▾" : "▸"} {audit.fillable} remplissable(s) via la base
              </button>
            )}
            {audit.incoherents.length > 0 && (
              <button onClick={() => setShowIncoh((v) => !v)} style={{ fontSize: 12, color: "#B4690E", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {showIncoh ? "▾" : "▸"} {audit.incoherents.length} mail(s) incohérent(s) à vérifier
              </button>
            )}
          </div>

          {showFill && audit.fillable > 0 && (
            <div style={{ marginTop: 8, maxHeight: 200, overflowY: "auto", border: "1px solid #E8E8EC", borderRadius: 8, fontSize: 12 }}>
              {audit.fillableList.map((r) => (
                <div key={r.pipelineId} style={{ display: "flex", gap: 8, padding: "5px 10px", borderTop: "1px solid #F1F1F4" }}>
                  <span style={{ color: "#26262C", flex: 1 }}>{r.nom} · <span style={{ color: "#A2A1AF" }}>{r.courtier}</span></span>
                  <span style={{ color: "#13762C" }}>→ {r.email}</span>
                </div>
              ))}
            </div>
          )}
          {showIncoh && audit.incoherents.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #E8E8EC", borderRadius: 8, fontSize: 12 }}>
              {audit.incoherents.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "5px 10px", borderTop: "1px solid #F1F1F4" }}>
                  <span style={{ color: "#26262C", flex: 1 }}>{r.nom} · <span style={{ color: "#A2A1AF" }}>{r.courtier}{r.refNom && r.refNom !== r.courtier ? ` (→${r.refNom})` : ""}</span></span>
                  <span style={{ color: "#B4690E", maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.mail}</span>
                </div>
              ))}
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
