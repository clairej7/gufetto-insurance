"use client";

// Auto 5 — Volet 3 : lots Excel de demandes de devis.
// Chaque « Générer l'excel » (Volet 2) crée un lot ici. On peut re-télécharger le
// fichier, et marquer l'envoi (fait à la main) → le lot devient un historique daté.
import { useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { Loader2, Download, Mail, Check, FolderArchive } from "lucide-react";
import { toast } from "sonner";

type LotSend = { assureur: string; at: string; by: string };
type Lot = { id: string; createdAt: string; createdBy: string; sentAt: string | null; count: number; sends: LotSend[] };

export function Devis5Volet3({ lots }: { lots: Lot[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // "dl:<id>" | "sent:<id>" | "docs:<id>"
  const [zipProg, setZipProg] = useState<{ lotId: string; done: number; total: number } | null>(null);

  async function download(id: string, createdAt: string) {
    setBusy(`dl:${id}`);
    try {
      const res = await fetch("/api/devis5/lot/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id }) });
      if (!res.ok) throw new Error("Erreur téléchargement");
      const blob = await res.blob();
      const d = new Date(createdAt);
      const fname = `Demandes_devis_Matera_${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  }

  async function markSent(id: string) {
    const assureur = window.prompt("À quel assureur ce lot a-t-il été envoyé ? (ex : AXA, Sada)");
    if (assureur === null) return; // annulé
    const a = assureur.trim();
    if (!a) { toast.error("Indique un assureur."); return; }
    setBusy(`sent:${id}`);
    try {
      const res = await fetch("/api/devis5/lot/mark-sent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id, assureur: a }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      toast.success(d.marked ? `Envoi à ${a} enregistré — ${d.marked} dossier(s) comptés comme demande envoyée.` : `Envoi à ${a} enregistré.`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  }

  async function downloadDocs(id: string) {
    setBusy(`docs:${id}`);
    try {
      // 1) manifest = liste des docs + URLs signées Supabase
      const res = await fetch("/api/devis5/lot/docs-manifest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      const files: { name: string; url: string }[] = d.files ?? [];
      if (!files.length) throw new Error("Aucun document");
      // 2) le navigateur télécharge chaque PDF et alimente le zip (barre de progression)
      const zip = new JSZip();
      setZipProg({ lotId: id, done: 0, total: files.length });
      let done = 0, failed = 0;
      for (const f of files) {
        try {
          const r = await fetch(f.url);
          if (r.ok) zip.file(f.name, await r.blob()); else failed++;
        } catch { failed++; }
        done++;
        setZipProg({ lotId: id, done, total: files.length });
      }
      // 3) génère le .zip et le télécharge
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = d.zipName ?? "Docs_RS_Contrats_Matera.zip";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success(`ZIP généré : ${done - failed}/${files.length} fichiers${failed ? ` (${failed} indisponibles)` : ""}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); setZipProg(null); }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  if (!lots.length) {
    return <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun lot pour l&apos;instant. Depuis le Volet 2, clique « Générer l&apos;excel » : le fichier apparaîtra ici.</p>;
  }

  // Historique plat de TOUS les envois (un lot peut être envoyé à plusieurs assureurs).
  const history = lots
    .flatMap((l) => {
      const s = l.sends ?? [];
      if (s.length) return s.map((x) => ({ at: x.at, count: l.count, assureur: x.assureur }));
      if (l.sentAt) return [{ at: l.sentAt, count: l.count, assureur: "—" }];
      return [];
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lots.map((l) => {
        const sends = l.sends ?? [];
        const sent = sends.length > 0 || !!l.sentAt;
        const sentTxt = sends.length
          ? sends.map((s) => `le ${fmtD(s.at)} à ${s.assureur}`).join(" · ")
          : l.sentAt ? `le ${fmtD(l.sentAt)}` : "";
        return (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", overflowX: "auto", padding: "10px 12px", border: "1px solid #E8E8EC", borderRadius: 10, background: sent ? "#FAFCFB" : "#fff" }}>
            {/* Fichier (toujours téléchargeable) */}
            <button onClick={() => download(l.id, l.createdAt)} disabled={busy === `dl:${l.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D7DAFB", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>
              {busy === `dl:${l.id}` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel du {fmt(l.createdAt)}
            </button>
            <span style={{ fontSize: 12, color: "#656576" }}>{l.count} dossier{l.count > 1 ? "s" : ""}</span>

            {/* Tous les docs (RS + contrats MRI) en ZIP (construit côté navigateur) */}
            <button onClick={() => downloadDocs(l.id)} disabled={busy === `docs:${l.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#26262C", background: "#fff", border: "1px solid #E8E8EC", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
              title="Télécharge tous les RS + contrats MRI du lot (ZIP, un sous-dossier par copro)">
              {busy === `docs:${l.id}` ? <Loader2 size={14} className="animate-spin" /> : <FolderArchive size={14} />} Docs (ZIP)
            </button>
            {zipProg && zipProg.lotId === l.id && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 160 }}>
                <span style={{ flex: 1, height: 6, background: "#EEF0FF", borderRadius: 99, overflow: "hidden", minWidth: 90 }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.round((zipProg.done / zipProg.total) * 100)}%`, background: "#4E49FC" }} />
                </span>
                <span style={{ fontSize: 11, color: "#656576", fontVariantNumeric: "tabular-nums" }}>{zipProg.done}/{zipProg.total}</span>
              </span>
            )}

            <div style={{ flex: 1 }} />

            {/* Prévisualiser & envoyer (à venir) */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#A2A1AF", background: "#F4F4F6", border: "1px solid #E8E8EC", borderRadius: 8, padding: "7px 12px", cursor: "not-allowed" }}>
              <Mail size={14} /> Prévisualiser &amp; envoyer le mail
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>à venir</span>
            </span>

            {/* Envoyé ? / Envoyé ! (par assureur) */}
            {sent ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#13762C", background: "#EFFBF2", border: "1px solid #B7E0C3", borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap", flexShrink: 0 }}>
                <Check size={14} /> Envoyé ! <span style={{ fontWeight: 500, color: "#4A7D58" }}>{sentTxt}</span>
                <button onClick={() => markSent(l.id)} disabled={busy === `sent:${l.id}`}
                  title="Ajouter un envoi à un autre assureur"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 4, fontSize: 11.5, fontWeight: 700, color: "#13762C", background: "transparent", border: "1px solid #B7E0C3", borderRadius: 6, padding: "2px 7px", cursor: "pointer" }}>
                  {busy === `sent:${l.id}` ? <Loader2 size={12} className="animate-spin" /> : "+"} ajouter
                </button>
              </span>
            ) : (
              <button onClick={() => markSent(l.id)} disabled={busy === `sent:${l.id}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#fff", background: "#4E49FC", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}
                title="Marque l'envoi comme fait à la main → compte chaque dossier comme « demande envoyée »">
                {busy === `sent:${l.id}` ? <Loader2 size={14} className="animate-spin" /> : null} Envoyé ?
              </button>
            )}
          </div>
        );
      })}
    </div>

    {/* Historique des envois (menu déroulant) */}
    <details style={{ marginTop: 12, border: "1px solid #E8E8EC", borderRadius: 10, background: "#fff" }}>
      <summary style={{ cursor: "pointer", listStyle: "none", padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: "#26262C" }}>
        Historique des envois <span style={{ fontWeight: 500, color: "#A2A1AF" }}>({history.length})</span>
      </summary>
      <div style={{ borderTop: "1px solid #F0F0F3", padding: "4px 12px 10px" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#A2A1AF", textAlign: "left" }}>
              <th style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>Date</th>
              <th style={{ padding: "6px 8px", fontWeight: 600 }}>Dossiers</th>
              <th style={{ padding: "6px 8px", fontWeight: 600 }}>Assureur</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} style={{ borderTop: "1px solid #F4F4F6" }}>
                <td style={{ padding: "6px 8px 6px 0", color: "#26262C", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtD(h.at)}</td>
                <td style={{ padding: "6px 8px", color: "#656576", fontVariantNumeric: "tabular-nums" }}>{h.count}</td>
                <td style={{ padding: "6px 8px", color: "#26262C", fontWeight: 600 }}>{h.assureur}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
    </>
  );
}
