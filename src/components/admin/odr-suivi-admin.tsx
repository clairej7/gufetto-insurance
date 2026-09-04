"use client";

// Volet admin « Suivi des ODR acceptés » (semi-auto). Affiche la MÊME liste que la
// page gestio (copro / gestio / assureur), les dossiers flaggés « à prévenir le CS »
// par les gestionnaires regroupés en tête, + une PRÉVISUALISATION complète (message
// Slack exact + gestios taggés + lien réel vers la page gestio) avant l'envoi.
// Se rafraîchit tout seul pour voir les retours en temps réel.

import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, ShieldAlert, ChevronDown, Eye, ExternalLink, AtSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Row = { pipelineId: string; copro: string; gestionnaire: string | null; assureur: string; prevenirCs: boolean };
type Data = { weekLabel: string; total: number; aPrevenirCount: number; rows: Row[] };
type PreviewGestio = { nom: string; email: string | null; tagged: boolean };
type Preview = { count: number; label: string; url: string; gestios: PreviewGestio[] };

export function OdrSuiviAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [posting, setPosting] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/odr-suivi/admin"); const j = await r.json(); if (j?.success) setData(j as Data); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const loadPreview = async () => {
    if (loadingPreview) return;
    setLoadingPreview(true);
    try {
      const r = await fetch("/api/odr-suivi/preview");
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string } & Partial<Preview>;
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      setPreview({ count: j.count ?? 0, label: j.label ?? "", url: j.url ?? "", gestios: j.gestios ?? [] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de la prévisualisation"); }
    finally { setLoadingPreview(false); }
  };

  const postRecap = async () => {
    if (posting) return;
    if (!confirm("Poster le recap « ODR acceptés de la semaine » sur #devis_assurance_pro (avec le lien pour les gestionnaires) ?")) return;
    setPosting(true);
    try {
      const r = await fetch("/api/odr-suivi/post-recap", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; count?: number; error?: string };
      if (!r.ok || !j.success) throw new Error(j.error ?? "Échec");
      toast.success(`Recap posté sur Slack (${j.count ?? 0} dossier(s)).`);
      setPreview(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec de l'envoi"); }
    finally { setPosting(false); }
  };

  const prevenirEtCloturer = () => {
    toast.info("« Prévenir les CS et clôturer la semaine » — action à définir ensemble (bientôt).");
  };

  const aPrevenir = data?.rows.filter((r) => r.prevenirCs) ?? [];
  const nonTagged = preview?.gestios.filter((g) => !g.tagged) ?? [];

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E4E4EA", borderRadius: 12, padding: "16px 18px" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: "#8A8A99", textTransform: "uppercase", padding: "0 8px 6px" };
  const td: React.CSSProperties = { padding: "8px", borderTop: "1px solid #F1F1F4", fontSize: 13, color: "#26262C" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#656576" }}>{data ? `Semaine ${data.weekLabel} · ${data.total} dossier(s)` : "…"}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={loadPreview} disabled={loadingPreview} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #D9D9F5", fontSize: 13, fontWeight: 700, background: "#F4F5FF", color: "#4E49FC", cursor: loadingPreview ? "wait" : "pointer" }}>
            {loadingPreview ? <Loader2 size={15} /> : <Eye size={15} />} Prévisualiser le recap
          </button>
          <button onClick={prevenirEtCloturer} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E8E8EC", fontSize: 13, fontWeight: 700, background: "#fff", color: "#26262C", cursor: "pointer" }}>
            <ShieldAlert size={15} style={{ color: "#7A3FF2" }} /> Prévenir les CS et clôturer la semaine
          </button>
        </div>
      </div>

      {/* Prévisualisation complète : message Slack exact + gestios + lien réel, AVANT l'envoi */}
      {preview && (
        <div style={{ marginTop: 14, border: "1px solid #D9D9F5", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ background: "#F4F5FF", padding: "8px 14px", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, color: "#4E49FC", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={13} /> Aperçu — rien n&apos;est encore envoyé
          </div>

          {/* Rendu fidèle du message #devis_assurance_pro */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #EEE" }}>
            <div style={{ fontSize: 11, color: "#8A8A99", marginBottom: 8 }}>Ce message partira sur <b style={{ color: "#4E49FC" }}>#devis_assurance_pro</b> :</div>
            <div style={{ background: "#fff", border: "1px solid #E9E9EF", borderLeft: "3px solid #4A154B", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 14, color: "#1D1C1D", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 800, marginBottom: 2 }}>📋 ODR acceptés de la semaine <span style={{ fontWeight: 400, fontStyle: "italic", color: "#616061" }}>({preview.label})</span></div>
                Voici les <b>{preview.count}</b> copropriété(s) dont l&apos;ODR a été accepté par nos partenaires cette semaine.
              </div>
              <div style={{ fontSize: 14, marginTop: 8 }}>
                👉 <a href={preview.url} target="_blank" rel="noreferrer" style={{ color: "#1264A3", textDecoration: "none", fontWeight: 600 }}>Voir la liste et signaler celles où il faut prévenir le conseil syndical</a>
              </div>
              <div style={{ fontSize: 12.5, color: "#616061", marginTop: 8 }}>Repère tes copropriétés : si l&apos;une est sensible, clique « Prévenir le CS ».</div>
              {preview.gestios.length > 0 && (
                <div style={{ fontSize: 14, marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <span>Liste des gestionnaires concernés :</span>
                  {preview.gestios.map((g) => (
                    g.tagged ? (
                      <span key={g.nom} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#E8F1FB", color: "#1264A3", fontWeight: 600, borderRadius: 6, padding: "2px 8px", fontSize: 13 }}>
                        <AtSign size={12} />{g.nom}
                      </span>
                    ) : (
                      <span key={g.nom} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#FDF1E3", color: "#A65B12", fontWeight: 600, borderRadius: 6, padding: "2px 8px", fontSize: 13, border: "1px solid #F3D9B8" }}>
                        <AlertTriangle size={12} />{g.nom}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
            {nonTagged.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: "#A65B12", display: "flex", alignItems: "flex-start", gap: 6 }}>
                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>{nonTagged.length} gestionnaire(s) non trouvé(s) sur Slack (email manquant ou non reconnu) — affiché(s) en clair, sans notification : <b>{nonTagged.map((g) => g.nom).join(", ")}</b>.</span>
              </div>
            )}
          </div>

          {/* Aperçu réel de l'interface gestio + envoi */}
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "#FAFAFC" }}>
            <a href={preview.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#4E49FC", textDecoration: "none" }}>
              <ExternalLink size={15} /> Ouvrir la page gestio (aperçu réel du lien)
            </a>
            <button onClick={postRecap} disabled={posting} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700, background: posting ? "#C9C8D3" : "#4E49FC", color: "#fff", cursor: posting ? "wait" : "pointer" }}>
              {posting ? <Loader2 size={15} /> : <Send size={15} />} Transmettre le recap hebdo aux gestionnaires
            </button>
          </div>
        </div>
      )}

      {/* Retours gestionnaires : dossiers « à prévenir le CS » regroupés */}
      <div style={{ marginTop: 14, background: aPrevenir.length ? "#FFF7F5" : "#FAFAFC", border: `1px solid ${aPrevenir.length ? "#F4C7BC" : "#EEE"}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: aPrevenir.length ? 10 : 0 }}>
          <ShieldAlert size={16} style={{ color: aPrevenir.length ? "#CA1E12" : "#8A8A99" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: aPrevenir.length ? "#CA1E12" : "#656576" }}>
            {aPrevenir.length} dossier(s) à prévenir le CS <span style={{ fontWeight: 500, color: "#8A8A99" }}>(signalés par les gestionnaires)</span>
          </span>
        </div>
        {aPrevenir.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {aPrevenir.map((r) => (
              <div key={r.pipelineId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", border: "1px solid #F1D9D2", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "#4E49FC", textDecoration: "none" }}>{r.copro}</a>
                <span style={{ color: "#656576" }}>{r.gestionnaire || "—"} · {r.assureur}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* La fenêtre exacte que voient les gestionnaires (liste complète) */}
      <button onClick={() => setListOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
        {listOpen ? "Masquer" : "Voir"} la liste vue par les gestionnaires ({data?.total ?? 0})
        <ChevronDown size={14} style={{ transform: listOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {listOpen && data && (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr><th style={th}>Copropriété</th><th style={th}>Gestionnaire</th><th style={th}>Assureur</th><th style={{ ...th, textAlign: "right" }}>Prévenir CS</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.pipelineId}>
                  <td style={{ ...td, fontWeight: 600 }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.copro}</a></td>
                  <td style={{ ...td, color: "#656576" }}>{r.gestionnaire || "—"}</td>
                  <td style={td}>{r.assureur}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.prevenirCs ? <span style={{ color: "#CA1E12", fontWeight: 700 }}>✓ à prévenir</span> : <span style={{ color: "#C7C7D2" }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
