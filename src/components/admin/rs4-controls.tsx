"use client";

// Automatisation 4 — 5 volets.
// Volet 1 : vérification de l'échantillon (complets / incomplets) + passage au volet 2.
// Volet 2 : template + envoi en masse des demandes de RS (infos par dossier + signature Front).
// Volet 3 : détecteur de réponses (scan Front, verdict par dossier, aiguillage par clic).
// Volet 4 : boucle de relances successives (dossiers « sans réponse » routés depuis V3).
// Volet 5 : RS en cours de récupération (courtier a répondu, doc à venir).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Send, Mail, Check, Search, PauseCircle, Archive, Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Row = { pipelineId: string; nom: string; assureur: string | null; numeroContrat: string | null; courtier: string | null; mail: string | null; manque: string[] };
type Sample = { total: number; complete: number; incomplete: number; completeRows: Row[]; incompleteRows: Row[] };
type Volet2Row = { pipelineId: string; nom: string; adresse: string | null; assureur: string | null; numeroContrat: string | null; courtier: string | null; mail: string | null; sendMail: string | null; hold: boolean; holdReason: string };
type Volet2 = { total: number; nouveaux: number; dejaEnvoyes: number; sent: number; rows: Volet2Row[] };
type Volet3Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; relances: number; replyKind: string | null; replyAt: string | null; replySnippet: string | null; replyConvUrl: string | null };
type Volet3 = { total: number; rows: Volet3Row[]; stages: { num: number; day: number; eligibles: number }[]; replyCounts: Record<string, number>; lastScanAt: string | null };
type Detector = { total: number; scanned: number; nonScanne: number; sansReponse: number; replyCounts: Record<string, number>; lastScanAt: string | null; rows: Volet3Row[] };
type Volet4Row = { pipelineId: string; nom: string; adresse: string | null; courtier: string | null; mail: string | null; joursDepuisEnvoi: number; replyKind: string | null; replySnippet: string | null; replyConvUrl: string | null };
type Volet4 = { total: number; rows: Volet4Row[] };
type SendHist = { sentAt: string; kind: string; relanceNum: number | null; count: number; failed: number };

// Métadonnées d'affichage des verdicts du détecteur.
const KIND_META: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  rs_recu:      { label: "RS reçu",        emoji: "📩", color: "#13762C", bg: "#EAF7EE", border: "#B7E4C4" },
  attente:      { label: "En attente",     emoji: "⏳", color: "#1F6FE0", bg: "#EAF3FE", border: "#C7DEF9" },
  info:         { label: "Info demandée",  emoji: "❓", color: "#B4690E", bg: "#FDF0D5", border: "#F3D9A6" },
  redirect:     { label: "Redirection",    emoji: "↩️", color: "#7A3EC8", bg: "#F3ECFB", border: "#DDC9F2" },
  pj:           { label: "Mauvais n° (PJ)", emoji: "⚠️", color: "#B4690E", bg: "#FDF0D5", border: "#F3D9A6" },
  bounce:       { label: "Bounce",         emoji: "⛔", color: "#CA1E12", bg: "#FDECEA", border: "#F5C6C0" },
  autre:        { label: "À vérifier",     emoji: "🔍", color: "#656576", bg: "#F1F1F4", border: "#E8E8EC" },
  sans_reponse: { label: "Pas de réponse", emoji: "—",  color: "#A2A1AF", bg: "#FAFAFC", border: "#E8E8EC" },
  non_scanne:   { label: "Non scanné",     emoji: "·",  color: "#A2A1AF", bg: "#FAFAFC", border: "#E8E8EC" },
};
function Badge({ kind }: { kind: string | null }) {
  if (!kind) return <span style={{ color: "#C7C7D1", fontSize: 11 }}>—</span>;
  const m = KIND_META[kind] ?? KIND_META.non_scanne;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, color: m.color, background: m.bg, border: `1px solid ${m.border}`, whiteSpace: "nowrap" }}>{m.emoji} {m.label}</span>;
}

// ── Templates par défaut (éditables). Placeholders : {adresse} {assureur} {numeroContrat} {jours} ──
const DEFAULT_SUBJECT = "Demande de relevé de sinistralité — {adresse} — contrat n° {numeroContrat}";
const DEFAULT_BODY = `Bonjour,

Je me permets de vous contacter en qualité de syndic de la copropriété {adresse}, contrat n° {numeroContrat}.

Pourriez-vous nous faire parvenir le contrat MRI actuel ainsi que le relevé de sinistralité des 3 dernières années dans les meilleurs délais ?

Je vous en remercie par avance.

Bien cordialement,`;

const RELANCE_SUBJECT = (n: number) => `[Relance ${n}] Relevé de sinistralité — {adresse} — contrat n° {numeroContrat}`;
const RELANCE_BODY = `Bonjour,

Sauf erreur de ma part, nous n'avons pas encore reçu le relevé de sinistralité de la copropriété {adresse} (contrat n° {numeroContrat}, {assureur}), demandé il y a {jours} jours.

Pourriez-vous nous le faire parvenir dès que possible ? Je reste à votre disposition.

Je vous en remercie,

Bien cordialement,`;

const btn = (color: string, bg: string, border: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 });

function VoletTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#26262C", margin: "0 0 8px" }}>
      <span style={{ color: "#A2A1AF" }}>Volet {n} — </span>{children}
    </div>
  );
}

const V1_COLS = ["Copropriété", "Assureur", "N° de contrat", "Courtier", "Mail courtier"] as const;

function V1Table({ rows, showManque }: { rows: Row[]; showManque?: boolean }) {
  return (
    <div style={{ marginTop: 8, maxHeight: 320, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
            {[...V1_COLS, ...(showManque ? ["Manque"] : [])].map((h) => (
              <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
              <td style={{ padding: "6px 10px", color: "#26262C" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.nom}</a></td>
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

export function Rs4Controls({ volet1Count, volet2, detector, volet3, volet4, sendHistory }: { volet1Count: number; volet2: Volet2; detector: Detector; volet3: Volet3; volet4: Volet4; sendHistory: SendHist[] }) {
  const router = useRouter();
  // Volet 3 — Détecteur
  const [scanning, setScanning] = useState(false);
  const [scanProg, setScanProg] = useState<{ done: number; total: number } | null>(null);
  const [showDet, setShowDet] = useState(false);
  const [detSearch, setDetSearch] = useState("");
  const [routing, setRouting] = useState<string | null>(null);
  // Volet 1
  const [sample, setSample] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [perso, setPerso] = useState<{ total: number; perso: number; csMatch: number; rows: { pipelineId: string; nom: string; courtier: string | null; mail: string | null; motif: string }[] } | null>(null);
  const [checkingPerso, setCheckingPerso] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  // Volet 2
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showTpl, setShowTpl] = useState(false);
  const [showV2, setShowV2] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [v2Search, setV2Search] = useState("");
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // Volet 3
  const [relancing, setRelancing] = useState<number | null>(null);
  const [showV3, setShowV3] = useState(false);
  const [v3Search, setV3Search] = useState("");

  async function verify() {
    setLoading(true);
    try {
      const res = await fetch("/api/rs4/verify");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      setSample(await res.json());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setLoading(false); }
  }

  async function checkPerso() {
    setCheckingPerso(true);
    try {
      const res = await fetch("/api/rs4/check-perso");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      setPerso(await res.json());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setCheckingPerso(false); }
  }

  async function moveToVolet2() {
    if (!sample || sample.complete === 0) return;
    if (!window.confirm(`Passer les ${sample.complete} dossier(s) « infos complètes » au volet 2 ?`)) return;
    setMoving(true);
    try {
      const res = await fetch("/api/rs4/move-to-volet2", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`${data.moved} dossier(s) passé(s) au volet 2.`);
      await verify();
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setMoving(false); }
  }

  async function sendVolet2(limit?: number) {
    if (volet2.nouveaux === 0 && volet2.dejaEnvoyes === 0) return;
    const n = limit ? Math.min(limit, volet2.nouveaux) : volet2.nouveaux;
    const msg = limit
      ? `Envoyer un lot de test de ${n} demande(s) de RS ?`
      : `Envoyer ${volet2.nouveaux} demande(s) de RS aux courtiers maintenant ?${volet2.dejaEnvoyes ? `\n(${volet2.dejaEnvoyes} dossier(s) déjà envoyé(s) seront basculés au suivi, sans nouveau mail.)` : ""}`;
    if (!window.confirm(msg)) return;
    setSending(true);
    try {
      const res = await fetch("/api/rs4/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, ...(limit ? { limit } : {}) }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`${data.sent} mail(s) envoyé(s)${data.movedExisting ? `, ${data.movedExisting} basculé(s) au suivi` : ""}${data.failed ? `, ${data.failed} échec(s)` : ""}.`);
      if (data.errors?.length) console.warn("[rs4/send] erreurs:", data.errors);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'envoi"); } finally { setSending(false); }
  }

  async function archiveOpen() {
    setArchiving(true);
    try {
      const res = await fetch("/api/rs4/archive-open", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`${data.archived} conversation(s) ré-archivée(s) (sur ${data.scanned}).`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setArchiving(false); }
  }

  async function moveSentToV3() {
    if (volet2.dejaEnvoyes === 0) return;
    if (!window.confirm(`Basculer ${volet2.dejaEnvoyes} dossier(s) déjà envoyé(s) à la main directement au suivi (volet 3), avec leur vraie date d'envoi ? Aucun mail ne part.`)) return;
    setSending(true);
    try {
      const res = await fetch("/api/rs4/move-sent-to-volet3", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`${data.moved} dossier(s) basculé(s) au suivi (volet 3).`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setSending(false); }
  }

  async function sendRelance(num: number, eligibles: number) {
    if (eligibles === 0) return;
    if (!window.confirm(`Envoyer la relance ${num} à ${eligibles} dossier(s) ?`)) return;
    setRelancing(num);
    try {
      const res = await fetch("/api/rs4/relance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relanceNum: num, subject: RELANCE_SUBJECT(num), body: RELANCE_BODY }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`Relance ${num} : ${data.sent} envoyée(s)${data.failed ? `, ${data.failed} échec(s)` : ""}.`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de la relance"); } finally { setRelancing(null); }
  }

  async function scanReplies() {
    if (detector.total === 0) return;
    setScanning(true);
    setScanProg({ done: 0, total: detector.total });
    try {
      let offset = 0;
      for (;;) {
        const res = await fetch("/api/rs4/scan-replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offset, limit: 40 }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
        const data = await res.json();
        offset = data.nextOffset;
        setScanProg({ done: Math.min(offset, data.total), total: data.total });
        if (data.done) break;
      }
      toast.success("Scan des réponses terminé.");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec du scan"); } finally { setScanning(false); }
  }

  async function route(url: string, pipelineId: string, okMsg: string, extra?: Record<string, unknown>) {
    setRouting(pipelineId);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId, ...extra }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      toast.success(okMsg);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setRouting(null); }
  }

  async function moveAllNoReply() {
    if (detector.sansReponse === 0) return;
    if (!window.confirm(`Envoyer les ${detector.sansReponse} dossier(s) « sans réponse » en boucle de relances (Volet 4) ?`)) return;
    setRouting("all");
    try {
      const res = await fetch("/api/rs4/move-to-relance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const data = await res.json();
      toast.success(`${data.moved} dossier(s) passé(s) en boucle de relances.`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setRouting(null); }
  }

  async function rsRecu(pipelineId: string) {
    try {
      const res = await fetch("/api/rs4/rs-recu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      toast.success("RS reçu → passage à la demande de devis.");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); }
  }

  async function enCours(pipelineId: string) {
    try {
      const res = await fetch("/api/rs4/en-cours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      toast.success("Dossier placé en « RS en cours de récupération » (sorti de la relance).");
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); }
  }

  const v3Filtered = v3Search.trim()
    ? volet3.rows.filter((r) => `${r.adresse ?? ""} ${r.nom} ${r.courtier ?? ""} ${r.mail ?? ""}`.toLowerCase().includes(v3Search.trim().toLowerCase()))
    : volet3.rows;
  const detFiltered = detSearch.trim()
    ? detector.rows.filter((r) => `${r.adresse ?? ""} ${r.nom} ${r.courtier ?? ""} ${r.mail ?? ""} ${r.replySnippet ?? ""}`.toLowerCase().includes(detSearch.trim().toLowerCase()))
    : detector.rows;
  // Ordre d'affichage du détecteur : réponses détectées d'abord, « pas de réponse » / non scanné en bas.
  const KIND_ORDER = ["rs_recu", "pj", "bounce", "redirect", "info", "attente", "autre", "sans_reponse", "non_scanne"];
  const detSorted = [...detFiltered].sort((a, b) => (KIND_ORDER.indexOf(a.replyKind ?? "non_scanne") - KIND_ORDER.indexOf(b.replyKind ?? "non_scanne")));
  const v2Filtered = v2Search.trim()
    ? volet2.rows.filter((r) => `${r.adresse ?? ""} ${r.nom} ${r.assureur ?? ""} ${r.courtier ?? ""} ${r.numeroContrat ?? ""} ${r.mail ?? ""}`.toLowerCase().includes(v2Search.trim().toLowerCase()))
    : volet2.rows;
  // Rang dans l'ordre d'envoi (= ordre de volet2.rows) pour surligner les 50 prochains.
  const orderIndex = new Map(volet2.rows.map((r, i) => [r.pipelineId, i]));

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC", display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── Volet 1 ── */}
      <div>
        <VoletTitle n={1}>Vérification de l&apos;échantillon</VoletTitle>
        <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
          Échantillon à date : <strong>{volet1Count}</strong> dossier{volet1Count > 1 ? "s" : ""} chargé{volet1Count > 1 ? "s" : ""} depuis l&apos;auto 3, à vérifier.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button onClick={verify} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />} Vérifier l&apos;échantillon
          </Button>
          <Button onClick={checkPerso} disabled={checkingPerso} variant="outline" size="sm">
            {checkingPerso ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />} Vérifier adresses perso
          </Button>
        </div>
        {perso && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${perso.rows.length === 0 ? "#B7E4C4" : "#F5C6C0"}`, background: perso.rows.length === 0 ? "#EAF7EE" : "#FDECEA" }}>
            {perso.rows.length === 0 ? (
              <span style={{ fontSize: 13, fontWeight: 600, color: "#13762C" }}>✓ Aucune adresse perso ni mail de CS sur les {perso.total} dossiers de l&apos;échantillon.</span>
            ) : (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#CA1E12", marginBottom: 6 }}>⚠️ {perso.rows.length} dossier(s) à risque ({perso.perso} perso, {perso.csMatch} = mail du CS) — à corriger avant d&apos;envoyer</div>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {perso.rows.map((r) => (
                    <div key={r.pipelineId} style={{ fontSize: 12, color: "#656576", padding: "3px 0" }}>
                      <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none", fontWeight: 600 }}>{r.nom}</a> · {r.courtier ?? "?"} · <span style={{ color: "#CA1E12" }}>{r.mail}</span> <em style={{ color: "#B4690E" }}>({r.motif})</em>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {sample && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              <div style={{ border: "1px solid #B7E4C4", background: "#EAF7EE", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#13762C" }}><CheckCircle2 size={16} /><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{sample.complete}</span></div>
                <div style={{ fontSize: 12, color: "#656576", marginTop: 6 }}>Infos complètes (assureur + n° contrat + mail)</div>
              </div>
              <div style={{ border: "1px solid #F3D9A6", background: "#FDF0D5", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#B4690E" }}><AlertTriangle size={16} /><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{sample.incomplete}</span></div>
                <div style={{ fontSize: 12, color: "#656576", marginTop: 6 }}>Infos incomplètes (au moins un champ manquant)</div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {sample.complete > 0 && (
                <div>
                  <button onClick={() => setShowComplete((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#13762C", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{showComplete ? "▾" : "▸"} Détail des {sample.complete} dossiers complets</button>
                  {showComplete && <V1Table rows={sample.completeRows} />}
                </div>
              )}
              {sample.incomplete > 0 && (
                <div>
                  <button onClick={() => setShowIncomplete((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#B4690E", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{showIncomplete ? "▾" : "▸"} Détail des {sample.incomplete} dossiers incomplets</button>
                  {showIncomplete && <V1Table rows={sample.incompleteRows} showManque />}
                </div>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <Button onClick={moveToVolet2} disabled={moving || sample.complete === 0} size="sm">
                {moving ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Passer les {sample.complete} dossiers complets au volet 2
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Volet 2 ── */}
      <div>
        <VoletTitle n={2}>Envoi des mails aux courtiers</VoletTitle>
        {volet2.total === 0 ? (
          <p style={{ fontSize: 12, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier en attente d&apos;envoi. Passe des dossiers depuis le volet 1.</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#656576", margin: "0 0 8px" }}>
              <strong style={{ color: "#4E49FC" }}>{volet2.nouveaux}</strong> demande{volet2.nouveaux > 1 ? "s" : ""} de RS à envoyer{volet2.dejaEnvoyes > 0 && <> · <strong>{volet2.dejaEnvoyes}</strong> déjà envoyée{volet2.dejaEnvoyes > 1 ? "s" : ""} (basculées au suivi sans nouveau mail)</>}.
            </p>
            {(() => {
              const tot = volet2.sent + volet2.nouveaux;
              const pct = tot > 0 ? Math.round((volet2.sent / tot) * 100) : 0;
              return (
                <div style={{ margin: "0 0 12px", maxWidth: 460 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#656576", marginBottom: 4 }}>
                    <span><strong style={{ color: "#13762C" }}>{volet2.sent}</strong> / {tot} demandes de RS envoyées</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "#E8E8EC", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#13762C", transition: "width 300ms" }} />
                  </div>
                </div>
              );
            })()}
            <button onClick={() => setShowTpl((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showTpl ? "▾" : "▸"} Template du mail (éditable · placeholders {"{adresse} {assureur} {numeroContrat}"})
            </button>
            {showTpl && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "7px 10px", border: "1px solid #E8E8EC", borderRadius: 8, fontFamily: "ui-monospace, Menlo, monospace" }} />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ width: "100%", minHeight: 180, fontSize: 12, padding: "8px 10px", border: "1px solid #E8E8EC", borderRadius: 8, fontFamily: "ui-monospace, Menlo, monospace", lineHeight: 1.5 }} />
                <p style={{ fontSize: 11, color: "#A2A1AF", margin: 0 }}>Ta signature Front est ajoutée automatiquement en pied de chaque mail. Pas de pièce jointe (n° de contrat connu).</p>
              </div>
            )}
            {volet2.rows.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button onClick={() => setShowV2((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {showV2 ? "▾" : "▸"} Détail des {volet2.rows.length} dossiers à envoyer (vérif avant envoi)
                </button>
                {showV2 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ position: "relative", marginBottom: 8, maxWidth: 380 }}>
                      <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
                      <input value={v2Search} onChange={(e) => setV2Search(e.target.value)} placeholder="Rechercher une copro / assureur / courtier…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
                    </div>
                    <p style={{ fontSize: 11, color: "#A2A1AF", margin: "0 0 6px" }}>
                      Ordre d&apos;envoi. <span style={{ background: "#EAF3FE", padding: "0 4px", borderRadius: 3, color: "#1F6FE0", fontWeight: 600 }}>Surlignés = les 50 prochains</span> (dont les <strong>5</strong> premiers en gras = prochain « lot de 5 »).
                    </p>
                    <div style={{ maxHeight: 360, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                            {["#", "Copropriété", "Assureur", "N° contrat", "Courtier", "Mail courtier"].map((h) => (
                              <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {v2Filtered.map((r) => {
                            const rank = orderIndex.get(r.pipelineId) ?? 999999;
                            const top50 = rank < 50, top5 = rank < 5;
                            return (
                              <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: top50 ? "#EFF5FE" : undefined }}>
                                <td style={{ padding: "6px 10px", color: "#A2A1AF", fontVariantNumeric: "tabular-nums" }}>{rank + 1}</td>
                                <td style={{ padding: "6px 10px", color: "#26262C", fontWeight: top5 ? 700 : 400 }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                                <td style={{ padding: "6px 10px", color: "#656576" }}>{r.assureur || "—"}</td>
                                <td style={{ padding: "6px 10px", color: "#656576" }}>{r.numeroContrat || "—"}</td>
                                <td style={{ padding: "6px 10px", color: "#656576" }}>{r.courtier || "—"}</td>
                                <td style={{ padding: "6px 10px" }}>
                                  {r.hold ? (
                                    <span style={{ color: "#B4690E" }}>⏸ en attente — {r.holdReason}</span>
                                  ) : r.sendMail && r.sendMail !== (r.mail || "") ? (
                                    <span><span style={{ color: "#13762C" }}>{r.sendMail}</span>{r.mail && r.mail.split(/[;,]/).length > r.sendMail.split(/[;,]/).length && <span style={{ color: "#A2A1AF", fontSize: 11 }}> (nettoyé)</span>}</span>
                                  ) : (
                                    <span style={{ color: "#13762C" }}>{r.sendMail || r.mail || "—"}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {v2Filtered.length === 0 && <tr><td colSpan={6} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={() => sendVolet2()} disabled={sending || volet2.nouveaux === 0} size="sm">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Envoyer {volet2.nouveaux} demande{volet2.nouveaux > 1 ? "s" : ""} de RS
              </Button>
              <Button onClick={() => sendVolet2(50)} disabled={sending || volet2.nouveaux === 0} variant="outline" size="sm">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Envoyer un lot de {Math.min(50, volet2.nouveaux)}
              </Button>
              <Button onClick={() => sendVolet2(5)} disabled={sending || volet2.nouveaux === 0} variant="outline" size="sm">
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Envoyer un lot de {Math.min(5, volet2.nouveaux)}
              </Button>
              {volet2.dejaEnvoyes > 0 && (
                <Button onClick={moveSentToV3} disabled={sending} variant="outline" size="sm">
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Basculer les {volet2.dejaEnvoyes} déjà-envoyés au suivi (sans mail)
                </Button>
              )}
              <Button onClick={archiveOpen} disabled={archiving} variant="outline" size="sm" title="Ré-archive les RS restées ouvertes sans réponse (à lancer après un lot)">
                {archiving ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />} Archiver les RS restées ouvertes
              </Button>
            </div>
          </>
        )}

        {sendHistory.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setShowHist((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#656576", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showHist ? "▾" : "▸"} Historique des envois ({sendHistory.length})
            </button>
            {showHist && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {sendHistory.map((h, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#656576", display: "flex", gap: 8 }}>
                    <span style={{ color: "#26262C", fontVariantNumeric: "tabular-nums" }}>{new Date(h.sentAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <span>→ {h.kind === "relance" ? `Relance ${h.relanceNum} : ` : ""}<strong>{h.count}</strong> mail{h.count > 1 ? "s" : ""} envoyé{h.count > 1 ? "s" : ""}{h.failed > 0 ? ` · ${h.failed} échec(s)` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Volet 3 — Détecteur de réponses ── */}
      <div>
        <VoletTitle n={3}>Détecteur de réponses</VoletTitle>
        {detector.total === 0 ? (
          <p style={{ fontSize: 12, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier à trier. Les envois du volet 2 arrivent ici pour être analysés, puis routés vers la boucle de relances (V4), « RS en cours » (V5), le devis ou l&apos;auto 3.</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#656576", margin: "0 0 8px" }}>
              <strong>{detector.total}</strong> dossier{detector.total > 1 ? "s" : ""} à trier · {detector.scanned} scanné{detector.scanned > 1 ? "s" : ""}
              {detector.lastScanAt && <span style={{ color: "#A2A1AF" }}> · dernier scan {new Date(detector.lastScanAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Button onClick={scanReplies} disabled={scanning} size="sm">
                {scanning ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Vérifier les réponses (Front)
              </Button>
              {detector.sansReponse > 0 && (
                <Button onClick={moveAllNoReply} disabled={routing !== null} variant="outline" size="sm">
                  {routing === "all" ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Passer les {detector.sansReponse} sans réponse en relances
                </Button>
              )}
            </div>
            {scanning && scanProg && (
              <div style={{ margin: "10px 0 0", maxWidth: 460 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#656576", marginBottom: 4 }}>
                  <span>Scan Front en cours…</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{scanProg.done} / {scanProg.total}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#E8E8EC", overflow: "hidden" }}>
                  <div style={{ width: `${scanProg.total ? Math.round((scanProg.done / scanProg.total) * 100) : 0}%`, height: "100%", background: "#4E49FC", transition: "width 200ms" }} />
                </div>
              </div>
            )}
            {/* Compteurs par catégorie */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
              {KIND_ORDER.filter((k) => (detector.replyCounts[k] ?? 0) > 0).map((k) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 999, color: KIND_META[k].color, background: KIND_META[k].bg, border: `1px solid ${KIND_META[k].border}` }}>
                  {KIND_META[k].emoji} {KIND_META[k].label} · {detector.replyCounts[k]}
                </span>
              ))}
            </div>
            <button onClick={() => setShowDet((v) => !v)} style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: "#656576", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showDet ? "▾" : "▸"} Détail & aiguillage des {detector.total} dossiers
            </button>
            {showDet && (
              <div style={{ marginTop: 8 }}>
                <div style={{ position: "relative", marginBottom: 8, maxWidth: 380 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
                  <input value={detSearch} onChange={(e) => setDetSearch(e.target.value)} placeholder="Rechercher une copro / courtier / extrait…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
                </div>
                <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                        {["Copropriété", "Verdict", "Extrait de réponse", "Aiguillage"].map((h) => (
                          <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detSorted.map((r) => {
                        const busy = routing === r.pipelineId;
                        return (
                          <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
                            <td style={{ padding: "6px 10px", color: "#26262C", maxWidth: 200 }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                            <td style={{ padding: "6px 10px" }}><Badge kind={r.replyKind} /></td>
                            <td style={{ padding: "6px 10px", maxWidth: 280 }}>
                              {r.replyConvUrl ? (
                                <a href={r.replyConvUrl} target="_blank" rel="noreferrer" title="Ouvrir la conversation dans Front" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.replySnippet || "Voir la conversation"} ↗</a>
                              ) : (
                                <span style={{ color: "#656576", fontStyle: r.replySnippet ? "normal" : "italic" }}>{r.replySnippet || "—"}</span>
                              )}
                            </td>
                            <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                              {busy ? <Loader2 size={14} className="animate-spin" style={{ color: "#A2A1AF" }} /> : (() => {
                                const rec = r.replyKind === "rs_recu" ? "recu" : r.replyKind === "sans_reponse" ? "relance" : "manuel";
                                const em = (k: string): React.CSSProperties => rec === k ? { boxShadow: "0 0 0 2px rgba(78,73,252,0.18)", fontWeight: 700 } : { opacity: 0.6 };
                                return (
                                  <div style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
                                    <button onClick={() => route("/api/rs4/rs-recu", r.pipelineId, "RS reçu → passage à l'automatisation 5 (demande de devis).")} disabled={routing !== null} title="RS reçu → auto 5, étape « demande de devis »" style={{ ...btn("#13762C", "#EAF7EE", "#B7E4C4"), ...em("recu") }}><Check size={11} /> RS reçu</button>
                                    <button onClick={() => route("/api/rs4/en-cours", r.pipelineId, "→ Traitement manuel (Volet 5), pas de changement d'étape.")} disabled={routing !== null} title="Redirection / erreur / info → Volet 5 (traitement manuel), pas de changement d'étape" style={{ ...btn("#B4690E", "#FDF0D5", "#F3D9A6"), ...em("manuel") }}><PauseCircle size={11} /> Traitement manuel</button>
                                    <button onClick={() => route("/api/rs4/move-to-relance", r.pipelineId, "→ boucle de relances (Volet 4), pas de changement d'étape.")} disabled={routing !== null} title="Pas de réponse → boucle de relances (Volet 4)" style={{ ...btn("#656576", "#F1F1F4", "#E8E8EC"), ...em("relance") }}><Mail size={11} /> Pas de réponse</button>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                      {detSorted.length === 0 && <tr><td colSpan={4} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Volet 4 — Boucle de relances ── */}
      <div>
        <VoletTitle n={4}>Dossiers en cours · boucle de relances</VoletTitle>
        {volet3.total === 0 ? (
          <p style={{ fontSize: 12, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier en relance. Ils arrivent ici depuis le détecteur (V3), bouton « Relances ».</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
              <strong>{volet3.total}</strong> dossier{volet3.total > 1 ? "s" : ""} en relance (arrivés du détecteur ; restent ici jusqu&apos;à réception ou re-tri).
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {volet3.stages.map((s) => (
                <Button key={s.num} onClick={() => sendRelance(s.num, s.eligibles)} disabled={relancing !== null || s.eligibles === 0} variant="outline" size="sm">
                  {relancing === s.num ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} J+{s.day} : relance {s.num} ({s.eligibles})
                </Button>
              ))}
            </div>
            <button onClick={() => setShowV3((v) => !v)} style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#656576", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showV3 ? "▾" : "▸"} Détail des {volet3.total} dossiers en cours
            </button>
            {showV3 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ position: "relative", marginBottom: 8, maxWidth: 380 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
                  <input value={v3Search} onChange={(e) => setV3Search(e.target.value)} placeholder="Rechercher une copro (où j'ai reçu le RS)…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                        {["Copropriété", "J+", "Relances", "Réponse", "Mail courtier", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {v3Filtered.map((r) => (
                        <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
                          <td style={{ padding: "6px 10px", color: "#26262C" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                          <td style={{ padding: "6px 10px", color: r.joursDepuisEnvoi >= 8 ? "#CA1E12" : r.joursDepuisEnvoi >= 4 ? "#B4690E" : "#656576", fontWeight: 600 }}>J+{r.joursDepuisEnvoi}</td>
                          <td style={{ padding: "6px 10px", color: "#656576" }}>{r.relances}</td>
                          <td style={{ padding: "6px 10px" }}>{r.replyKind && r.replyKind !== "sans_reponse" && r.replyKind !== "non_scanne" ? <Badge kind={r.replyKind} /> : <span style={{ color: "#C7C7D1" }}>—</span>}</td>
                          <td style={{ padding: "6px 10px", color: "#656576" }}>{r.mail || "—"}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button onClick={() => enCours(r.pipelineId)} title="Le courtier a répondu mais pas de RS → sortir de la relance" style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: "1px solid #F3D9A6", background: "#FDF0D5", color: "#B4690E", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
                              <PauseCircle size={12} /> RS en cours de réception
                            </button>
                            <button onClick={() => rsRecu(r.pipelineId)} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: "1px solid #B7E4C4", background: "#EAF7EE", color: "#13762C", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Check size={12} /> RS reçu
                            </button>
                          </td>
                        </tr>
                      ))}
                      {v3Filtered.length === 0 && (
                        <tr><td colSpan={6} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Volet 5 — RS en cours de récupération ── */}
      <div>
        <VoletTitle n={5}>RS en cours · traitement manuel</VoletTitle>
        {volet4.total === 0 ? (
          <p style={{ fontSize: 12, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier ici. Le bouton « Traitement manuel » (détecteur V3) place ici les dossiers à traiter à la main : réponse en cours, redirection, erreur, demande d&apos;info… (pas de changement d&apos;étape).</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
              <strong>{volet4.total}</strong> dossier{volet4.total > 1 ? "s" : ""} à traiter à la main (réponse en cours, redirection, erreur, info…) — hors relances, sans changement d&apos;étape. Clique « RS reçu » dès réception du relevé.
            </p>
            <div style={{ maxHeight: 340, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                    {["Copropriété", "J+", "Verdict", "Extrait", "Mail courtier", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {volet4.rows.map((r) => (
                    <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4" }}>
                      <td style={{ padding: "6px 10px", color: "#26262C" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#26262C", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                      <td style={{ padding: "6px 10px", color: "#656576", fontWeight: 600 }}>J+{r.joursDepuisEnvoi}</td>
                      <td style={{ padding: "6px 10px" }}>{r.replyKind && r.replyKind !== "non_scanne" ? <Badge kind={r.replyKind} /> : <span style={{ color: "#C7C7D1" }}>—</span>}</td>
                      <td style={{ padding: "6px 10px", maxWidth: 240 }}>
                        {r.replyConvUrl ? (
                          <a href={r.replyConvUrl} target="_blank" rel="noreferrer" title="Ouvrir la conversation dans Front" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.replySnippet || "Voir la conversation"} ↗</a>
                        ) : (
                          <span style={{ color: "#656576", fontStyle: r.replySnippet ? "normal" : "italic" }}>{r.replySnippet || "—"}</span>
                        )}
                      </td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.mail || "—"}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>
                        <button onClick={() => rsRecu(r.pipelineId)} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: "1px solid #B7E4C4", background: "#EAF7EE", color: "#13762C", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Check size={12} /> RS reçu
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
