"use client";

// Auto 5 — Volet 3 : lots Excel de demandes de devis.
// Chaque « Générer l'excel » (Volet 2) crée un lot ici. On peut re-télécharger le
// fichier, et marquer l'envoi (fait à la main) → le lot devient un historique daté.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, Mail, Check } from "lucide-react";
import { toast } from "sonner";

type Lot = { id: string; createdAt: string; createdBy: string; sentAt: string | null; count: number };

export function Devis5Volet3({ lots }: { lots: Lot[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // "dl:<id>" | "sent:<id>"

  async function download(id: string) {
    setBusy(`dl:${id}`);
    try {
      const res = await fetch("/api/devis5/lot/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id }) });
      if (!res.ok) throw new Error("Erreur téléchargement");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "demandes-devis-axa.xlsx";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  }

  async function markSent(id: string) {
    setBusy(`sent:${id}`);
    try {
      const res = await fetch("/api/devis5/lot/mark-sent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erreur");
      toast.success(`Lot marqué envoyé — ${d.marked} dossier(s) comptés comme demande envoyée.`);
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (!lots.length) {
    return <p style={{ fontSize: 12.5, color: "#A2A1AF", margin: 0, fontStyle: "italic" }}>Aucun lot pour l&apos;instant. Depuis le Volet 2, clique « Générer l&apos;excel » : le fichier apparaîtra ici.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lots.map((l) => {
        const sent = !!l.sentAt;
        return (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", border: "1px solid #E8E8EC", borderRadius: 10, background: sent ? "#FAFCFB" : "#fff" }}>
            {/* Fichier (toujours téléchargeable) */}
            <button onClick={() => download(l.id)} disabled={busy === `dl:${l.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#4E49FC", background: "#EEF0FF", border: "1px solid #D7DAFB", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>
              {busy === `dl:${l.id}` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel du {fmt(l.createdAt)}
            </button>
            <span style={{ fontSize: 12, color: "#656576" }}>{l.count} dossier{l.count > 1 ? "s" : ""}</span>

            <div style={{ flex: 1 }} />

            {/* Prévisualiser & envoyer (à venir) */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#A2A1AF", background: "#F4F4F6", border: "1px solid #E8E8EC", borderRadius: 8, padding: "7px 12px", cursor: "not-allowed" }}>
              <Mail size={14} /> Prévisualiser &amp; envoyer le mail
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FFF7EB", color: "#955804" }}>à venir</span>
            </span>

            {/* Envoyé ? / Envoyé ! */}
            {sent ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#13762C", background: "#EFFBF2", border: "1px solid #B7E0C3", borderRadius: 8, padding: "7px 12px" }}>
                <Check size={14} /> Envoyé ! <span style={{ fontWeight: 500, color: "#4A7D58" }}>le {fmt(l.sentAt!)}</span>
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
  );
}
