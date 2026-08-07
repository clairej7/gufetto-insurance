"use client";

// Contrôles admin — Automatisation 3. Deux commandes sur l'étape « Récupération
// du RS » : (1) « Vérifier les courtiers » = classe les dossiers en 3 buckets
// (vert / orange / rouge) ; (2) « Remplir automatiquement les mails courtiers »
// = complète via la base les dossiers « courtier valable mais sans mail ». L'état
// final est ré-affiché après remplissage.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, XCircle, ListChecks, Wand2, Loader2, Eraser, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Counts = { vert: number; orange: number; rouge: number };
type OrangeRow = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; courtier: string | null; refNom: string | null; mail: string | null; fillable: boolean; fillEmail: string | null };
type ReadyRow = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; courtier: string | null; mail: string | null; rsSent: boolean };
type HistRow = { sentAt: string; count: number };
type Audit = { counts: Counts; total: number; stepTotal: number; fillable: number; orange: OrangeRow[]; ready: ReadyRow[]; history: HistRow[] };

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
  const [mutated, setMutated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filling, setFilling] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [showOrange, setShowOrange] = useState(false);
  const [showReady, setShowReady] = useState(false);

  const nonFillable = audit ? audit.orange.filter((r) => !r.fillable).length : 0;
  const isClean = !!audit && audit.counts.orange === 0;

  async function verify() {
    setLoading(true);
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
      toast.success(`${data.filled} mail(s) courtier rempli(s) via la base.`);
      setMutated(true);
      router.refresh();
      await verify();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du remplissage");
    } finally {
      setFilling(false);
    }
  }

  async function sendToAuto4() {
    if (!audit || !isClean) return;
    if (!window.confirm(`Charger l'échantillon clean (${audit.ready.length} dossier(s) courtier + mail) dans l'automatisation 4 ?`)) return;
    setSending(true);
    try {
      const res = await fetch("/api/courtier/send-to-auto4", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      setLoaded(data.loaded);
      toast.success(`${data.loaded} dossier(s) chargé(s) dans l'automatisation 4.`);
      router.refresh();
      await verify(); // les dossiers chargés sortent de l'audit + l'historique se met à jour
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du chargement");
    } finally {
      setSending(false);
    }
  }

  async function clearNonFillable() {
    if (!audit || nonFillable === 0) return;
    if (!window.confirm(`Basculer ${nonFillable} dossier(s) « courtier hors base non résolvable » en « sans courtier » ?\n\nLe champ courtier sera vidé (le nom d'origine reste tracé dans l'historique du dossier). But : plus aucun dossier orange.`)) return;
    setClearing(true);
    try {
      const res = await fetch("/api/courtier/clear-nonfillable", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`${data.cleared} dossier(s) basculé(s) en « sans courtier ».`);
      setMutated(true);
      router.refresh();
      await verify();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'opération");
    } finally {
      setClearing(false);
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
        <Button onClick={clearNonFillable} disabled={!audit || clearing || nonFillable === 0} variant="outline" size="sm">
          {clearing ? <Loader2 size={15} className="animate-spin" /> : <Eraser size={15} />}
          Enlever les non-remplissables{audit ? ` (${nonFillable})` : ""}
        </Button>
      </div>

      {audit && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, marginBottom: 6, color: mutated && audit.counts.orange === 0 ? "#13762C" : "#A2A1AF", fontWeight: mutated && audit.counts.orange === 0 ? 600 : 400 }}>
            {mutated && audit.counts.orange === 0 && "✓ Échantillon clean — "}
            {audit.stepTotal} dossiers en « Récupération du RS », {audit.total} encore en cours de vérification avant d&apos;envoyer à l&apos;automatisation 4
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
                              r.mail ? (
                                <span><span style={{ color: "#B4690E", textDecoration: "line-through" }}>{r.mail}</span> <span style={{ color: "#13762C" }}>→ {r.fillEmail}</span></span>
                              ) : (
                                <span style={{ color: "#13762C" }}>proposé : {r.fillEmail}</span>
                              )
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

          {/* Échantillon clean prêt pour l'auto 4 (courtier + mail, RS non envoyée). */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F1F4" }}>
            <button onClick={() => setShowReady((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#13762C", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showReady ? "▾" : "▸"} Échantillon clean pour l&apos;auto 4 — {audit.ready.length} dossier(s){audit.ready.some((r) => r.rsSent) ? ` (dont ${audit.ready.filter((r) => r.rsSent).length} RS déjà envoyée)` : ""}
            </button>
            {showReady && (
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
                    {audit.ready.map((r) => (
                      <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
                        <td style={{ padding: "6px 10px", color: "#26262C" }}>
                          <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a>
                          {r.rsSent && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#EAF3FE", color: "#1F6FE0" }}>RS déjà envoyée</span>}
                        </td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{r.assureur || "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#656576" }}>{r.courtier || "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#13762C" }}>{r.mail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <Button onClick={sendToAuto4} disabled={!isClean || sending || audit.ready.length === 0} size="sm">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Envoyer l&apos;échantillon clean à l&apos;automatisation 4 ({audit.ready.length})
              </Button>
              {!isClean && (
                <p style={{ fontSize: 11, color: "#B4690E", marginTop: 6 }}>
                  Disponible une fois l&apos;échantillon clean (0 orange) — remplis les mails puis enlève les non-remplissables.
                </p>
              )}
              {loaded !== null && (
                <p style={{ fontSize: 12, color: "#13762C", fontWeight: 600, marginTop: 6 }}>
                  ✓ {loaded} dossier(s) chargé(s) dans l&apos;automatisation 4.
                </p>
              )}
            </div>

            {audit.history.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#A2A1AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Historique des envois</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {audit.history.map((h, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#656576", display: "flex", gap: 8 }}>
                      <span style={{ color: "#26262C", fontVariantNumeric: "tabular-nums" }}>{new Date(h.sentAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>→ {h.count} dossier{h.count > 1 ? "s" : ""} envoyé{h.count > 1 ? "s" : ""} à l&apos;auto 4</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
