"use client";

// Automatisation 6 « Comparer les devis & mail au CS » — contrôles 3 volets.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type V1Row = { pipelineId: string; nom: string; adresse: string | null; gestionnaire: string | null; hasContrat: boolean; hasDevis: boolean; nbDevis: number; primeVerifiee: boolean; comparaisonFaite: boolean; pret: boolean };
type V1 = { total: number; prets: number; rows: V1Row[] };
type CsMember = { name: string; email: string };
type V2Row = { pipelineId: string; nom: string; adresse: string | null; passedAt: string; buildingId: string | null; csMembers: CsMember[]; csMembersSyncedAt: string | null; contactCsEmail: string | null; recoAssureur: string | null; recoPrime: number | null; primeActuelle: number | null; economie: number | null };
type V2 = { count: number; avecMembres: number; materaConfigure: boolean; rows: V2Row[] };
const fmtE = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")} €`);
type SuiviRow = { pipelineId: string; nom: string; adresse: string | null; sentAt: string; jours: number; to: string | null; convUrl: string | null };
type Suivi = { envoyees: number; recus: number; sansReponse10j: number; rows: SuiviRow[] };

const PILL = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D9D9F5", borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" as const };
const chip = (ok: boolean) => <span style={{ fontSize: 11, fontWeight: 700, color: ok ? "#13762C" : "#CA1E12" }}>{ok ? "✓" : "✗"}</span>;

export function Devis6Controls({ volet1, volet2, suivi }: { volet1: V1; volet2?: V2; suivi?: Suivi }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [onlyReady, setOnlyReady] = useState(false);
  const [passing, setPassing] = useState(false);
  const [showV2, setShowV2] = useState(false);
  const [showSuivi, setShowSuivi] = useState(false);
  const [fetchingCs, setFetchingCs] = useState(false);

  async function fetchCsMembers() {
    if (!volet2 || volet2.count === 0) return;
    setFetchingCs(true);
    try {
      const res = await fetch("/api/devis6/fetch-cs-members", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erreur");
      if (d.materaConfigure === false) toast.error(d.error ?? "Accès Matera non configuré");
      else toast.success(`${d.withMembers}/${d.processed} dossiers avec membres CS (${d.totalMembers} mails).`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); } finally { setFetchingCs(false); }
  }

  const rows = volet1.rows
    .filter((r) => !onlyReady || r.pret)
    .filter((r) => !q.trim() || `${r.adresse ?? ""} ${r.nom} ${r.gestionnaire ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function passToVolet2() {
    if (volet1.prets === 0) return;
    setPassing(true);
    try {
      const res = await fetch("/api/devis6/pass-to-volet2", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Erreur");
      const d = await res.json();
      toast.success(`${d.passed} dossier(s) passé(s) au volet 2.`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Échec du passage"); } finally { setPassing(false); }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed #E8E8EC" }}>
      {/* ── VOLET 1 ── */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={PILL}>VOLET 1</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Comparaisons disponibles</span>
      </div>
      <p style={{ fontSize: 13, color: "#656576", margin: "0 0 10px" }}>
        <strong>{volet1.total}</strong> dossier{volet1.total > 1 ? "s" : ""} à l&apos;étape « Comparaison des devis ». Un dossier est <strong>prêt</strong> quand il a le contrat, au moins un devis reçu, la prime vérifiée <em>et</em> une comparaison faite (devis recommandé).
      </p>
      <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, color: "#13762C", background: "#EAF7EE", border: "1px solid #B7E4C4" }}>✓ {volet1.prets} prêts</span>
        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, color: "#B4690E", background: "#FDF0D5", border: "1px solid #F3D9A6" }}>⚠ {volet1.total - volet1.prets} incomplets</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setOpen((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {open ? "▾" : "▸"} Parcourir les {volet1.total} dossiers
        </button>
        <button onClick={() => router.refresh()} title="Rafraîchir (après vérif de prime / ajout de devis)" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#656576", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}><RefreshCw size={13} /> Rafraîchir</button>
      </div>

      {open && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 380 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#A2A1AF" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une copro / gestionnaire…" style={{ width: "100%", fontSize: 12, padding: "7px 10px 7px 30px", border: "1px solid #E8E8EC", borderRadius: 8 }} />
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#13762C", cursor: "pointer" }}>
              <input type="checkbox" checked={onlyReady} onChange={(e) => setOnlyReady(e.target.checked)} /> Prêts seulement ({volet1.prets})
            </label>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>
                  {["Copropriété", "Contrat", "Devis", "Prime vérif.", "Comparaison", "Prêt", "Gestionnaire"].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC", whiteSpace: "nowrap", textAlign: h === "Copropriété" || h === "Gestionnaire" ? "left" : "center" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: r.pret ? "#F4FBF6" : undefined }}>
                    <td style={{ padding: "6px 10px" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>{chip(r.hasContrat)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>{r.hasDevis ? <span style={{ fontSize: 11, fontWeight: 700, color: "#13762C" }}>✓ {r.nbDevis}</span> : chip(false)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>{chip(r.primeVerifiee)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>{chip(r.comparaisonFaite)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>{r.pret ? <span style={{ fontSize: 11, fontWeight: 700, color: "#13762C" }}>prêt</span> : <span style={{ color: "#A2A1AF" }}>—</span>}</td>
                    <td style={{ padding: "6px 10px", color: "#656576", whiteSpace: "nowrap" }}>{r.gestionnaire || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} style={{ padding: "10px", color: "#A2A1AF", textAlign: "center" }}>Aucun dossier ne correspond.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Passage au volet 2 */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F1F4", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={passToVolet2} disabled={passing || volet1.prets === 0}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: volet1.prets === 0 ? "#A9D9B8" : "#13762C", border: "none", borderRadius: 8, padding: "8px 14px", cursor: passing || volet1.prets === 0 ? "default" : "pointer" }}>
          {passing ? <Loader2 size={15} className="animate-spin" /> : <span style={{ fontSize: 15 }}>→</span>} Passer les {volet1.prets} comparaisons prêtes au volet 2
        </button>
        <span style={{ fontSize: 11.5, color: "#A2A1AF" }}>Elles quittent le volet 1 et entrent dans la file d&apos;envoi des mails au CS.</span>
      </div>

      {/* ── VOLET 2 — Prévisu & envoi mail CS ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={PILL}>VOLET 2</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Prévisualiser &amp; envoyer les mails au CS</span>
        </div>
        {!volet2 || volet2.count === 0 ? (
          <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun dossier dans le volet 2. Utilise « → Passer les comparaisons prêtes au volet 2 » ci-dessus.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#4E49FC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{volet2.count}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>en attente d&apos;envoi</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: volet2.avecMembres === volet2.count ? "#13762C" : "#B4690E", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{volet2.avecMembres}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>avec membres CS récupérés</div></div>
            </div>

            {!volet2.materaConfigure && (
              <div style={{ margin: "0 0 10px", padding: "8px 12px", borderRadius: 8, background: "#FDF0D5", border: "1px solid #F3D9A6", fontSize: 12, color: "#8A5A00" }}>
                ⚠️ Accès Matera non configuré (<code>MATERA_API_TOKEN</code> manquant côté serveur) → la récupération des membres du CS est indisponible tant que le token n&apos;est pas ajouté. Le reste de l&apos;écran fonctionne.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <button onClick={fetchCsMembers} disabled={fetchingCs || !volet2.materaConfigure}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fff", background: !volet2.materaConfigure ? "#B7B6E6" : "#4E49FC", border: "none", borderRadius: 8, padding: "8px 14px", cursor: fetchingCs || !volet2.materaConfigure ? "default" : "pointer" }}>
                {fetchingCs ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Récupérer les membres du CS (Matera)
              </button>
              <button onClick={() => setShowV2((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{showV2 ? "▾ masquer le détail" : "▸ voir le détail par dossier"}</button>
            </div>

            <div style={{ padding: "8px 12px", borderRadius: 8, background: "#EEF0FF", border: "1px solid #D9D9F5", fontSize: 12, color: "#3A37B8", marginBottom: 10 }}>
              ℹ️ L&apos;<strong>envoi</strong> du mail au CS (texte de recommandation personnalisé) sera activé avec le <strong>crédit Anthropic</strong>. Ici : destinataires (membres du CS) + résumé de la proposition, prêts à l&apos;emploi.
            </div>

            {showV2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {volet2.rows.map((r) => (
                  <div key={r.pipelineId} style={{ border: "1px solid #E8E8EC", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#4E49FC", textDecoration: "none" }}>{r.adresse || r.nom}</a>
                      <span style={{ fontSize: 12, color: "#656576" }}>
                        Proposition : <strong>{r.recoAssureur ?? "—"}</strong> · {fmtE(r.primeActuelle)} → <strong>{fmtE(r.recoPrime)}</strong>
                        {r.economie != null && <span style={{ color: r.economie > 0 ? "#13762C" : "#CA1E12", fontWeight: 700 }}> ({r.economie > 0 ? "-" : "+"}{fmtE(Math.abs(r.economie))}/an)</span>}
                      </span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#A2A1AF", marginBottom: 4 }}>Destinataires — membres du conseil syndical {r.csMembersSyncedAt ? "" : "(non récupérés)"}</div>
                      {r.csMembers.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {r.csMembers.map((m, i) => (
                            <span key={i} style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 999, background: "#EAF7EE", border: "1px solid #B7E4C4", color: "#13762C" }} title={m.email}>{m.name || m.email} · {m.email}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "#A2A1AF" }}>{r.contactCsEmail ? `Contact CS connu : ${r.contactCsEmail}` : "Aucun destinataire — lance « Récupérer les membres du CS »."}</span>
                      )}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button disabled title="Disponible avec le crédit Anthropic (génération de la reco)" style={{ fontSize: 12, fontWeight: 600, color: "#A2A1AF", background: "#F1F1F4", border: "1px solid #E8E8EC", borderRadius: 8, padding: "6px 12px", cursor: "not-allowed" }}>Prévisualiser &amp; envoyer (crédits requis)</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── VOLET 3 — Suivi des propositions ── */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #E8E8EC" }}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={PILL}>VOLET 3</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#26262C" }}>Suivi des propositions</span>
        </div>
        {!suivi || suivi.envoyees === 0 ? (
          <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucune proposition envoyée au CS pour l&apos;instant.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12 }}>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#4E49FC", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.envoyees}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>propositions envoyées</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: "#A2A1AF", lineHeight: 1 }}>—</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>réponses reçues <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>à venir</span></div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: suivi.sansReponse10j > 0 ? "#CA1E12" : "#13762C", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{suivi.sansReponse10j}</div><div style={{ fontSize: 11.5, color: "#656576", marginTop: 4 }}>sans réponse depuis ≥ 10 j</div></div>
            </div>
            <button onClick={() => setShowSuivi((v) => !v)} style={{ fontSize: 12, fontWeight: 600, color: "#4E49FC", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{showSuivi ? "▾" : "▸"} Détail des {suivi.rows.length} dossiers</button>
            {showSuivi && (
              <div style={{ marginTop: 8, maxHeight: 420, overflowY: "auto", overflowX: "auto", border: "1px solid #E8E8EC", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ color: "#A2A1AF", textAlign: "left", background: "#FAFAFC" }}>{["Copropriété", "Destinataire", "Envoyé le", "Depuis", "Conversation Front"].map((h) => <th key={h} style={{ padding: "7px 10px", fontWeight: 600, position: "sticky", top: 0, background: "#FAFAFC" }}>{h}</th>)}</tr></thead>
                  <tbody>{suivi.rows.map((r) => (
                    <tr key={r.pipelineId} style={{ borderTop: "1px solid #F1F1F4", background: r.jours >= 10 ? "#FDECEA" : undefined }}>
                      <td style={{ padding: "6px 10px" }}><a href={`/pipeline/${r.pipelineId}`} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>{r.adresse || r.nom}</a></td>
                      <td style={{ padding: "6px 10px", color: "#656576" }}>{r.to || "—"}</td>
                      <td style={{ padding: "6px 10px", color: "#656576", whiteSpace: "nowrap" }}>{new Date(r.sentAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 600, color: r.jours >= 10 ? "#CA1E12" : "#656576" }}>J+{r.jours}</td>
                      <td style={{ padding: "6px 10px" }}>{r.convUrl ? <a href={r.convUrl} target="_blank" rel="noreferrer" style={{ color: "#4E49FC", textDecoration: "none" }}>ouvrir ↗</a> : <span style={{ color: "#A2A1AF" }}>—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
