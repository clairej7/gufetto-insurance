"use client";

import { useState } from "react";

type LoginEvent = {
  id: string;
  email: string;
  createdAt: Date;
};

type PipelineEvent = {
  id: string;
  type: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  ancienStatut: string | null;
  nouveauStatut: string | null;
  pipeline: { copro: { nom: string } } | null;
};

interface ActivityBoardProps {
  loginEvents: LoginEvent[];
  pipelineEvents: PipelineEvent[];
}

const FONT_SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const FONT_MONO = "ui-monospace, Menlo, Consolas, monospace";

function formatName(email: string): string {
  const prenom = email.split(".")[0];
  const nom = email.split(".")[1]?.split("@")[0];
  if (!prenom || !nom) return email.split("@")[0];
  return `${prenom.charAt(0).toUpperCase() + prenom.slice(1)} ${nom.charAt(0).toUpperCase() + nom.slice(1)}`;
}

function formatRelative(date: Date): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatAbsolute(date: Date): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const STATUT_LABEL: Record<string, string> = {
  identifie: "Identifié",
  odr_en_cours: "ODR en cours",
  odr_envoye: "ODR envoyée",
  odr_accepte: "ODR accepté",
  odr_en_vigueur: "ODR en vigueur",
  rs_en_cours: "RS en cours",
  devis_demandes: "Devis demandés",
  devis_recus: "Devis reçus",
  envoye_cs: "Validé CS",
  contrat_signe: "Contrat signé",
  termine: "Clôturé",
};

type EventItem =
  | { kind: "login"; id: string; email: string; createdAt: Date }
  | { kind: "pipeline"; id: string; type: string; description: string; createdBy: string; createdAt: Date; ancienStatut: string | null; nouveauStatut: string | null; coproNom: string | null };

function getEventLabel(ev: EventItem): { icon: string; text: string; color: string } {
  if (ev.kind === "login") {
    return { icon: "●", text: `s'est connecté${ev.email.includes("e.") ? "e" : ""}`, color: "#4E49FC" };
  }
  switch (ev.type) {
    case "statut_change":
      return {
        icon: "→",
        text: `a passé ${ev.coproNom ? `"${ev.coproNom}"` : "un dossier"} en ${STATUT_LABEL[ev.nouveauStatut ?? ""] ?? ev.nouveauStatut}`,
        color: "#13762C",
      };
    case "action_manuelle":
      return { icon: "✉", text: ev.description, color: "#206E92" };
    case "note_ajoutee":
      return { icon: "✎", text: `a ajouté une note sur ${ev.coproNom ? `"${ev.coproNom}"` : "un dossier"}`, color: "#956576" };
    default:
      return { icon: "·", text: ev.description, color: "#656576" };
  }
}

// Résumé par utilisateur
function buildUserSummary(items: EventItem[]) {
  const map = new Map<string, { logins: number; actions: number; lastSeen: Date }>();
  for (const ev of items) {
    const email = ev.kind === "login" ? ev.email : ev.createdBy;
    const existing = map.get(email) ?? { logins: 0, actions: 0, lastSeen: new Date(0) };
    if (ev.kind === "login") existing.logins++;
    else existing.actions++;
    if (new Date(ev.createdAt) > existing.lastSeen) existing.lastSeen = new Date(ev.createdAt);
    map.set(email, existing);
  }
  return [...map.entries()]
    .map(([email, s]) => ({ email, ...s }))
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
}

export function ActivityBoard({ loginEvents, pipelineEvents }: ActivityBoardProps) {
  const [filter, setFilter] = useState<"all" | "logins" | "actions">("all");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  // Fusion et tri de tous les events
  const allItems: EventItem[] = [
    ...loginEvents.map(e => ({ kind: "login" as const, id: e.id, email: e.email, createdAt: new Date(e.createdAt) })),
    ...pipelineEvents.map(e => ({
      kind: "pipeline" as const,
      id: e.id, type: e.type, description: e.description,
      createdBy: e.createdBy, createdAt: new Date(e.createdAt),
      ancienStatut: e.ancienStatut, nouveauStatut: e.nouveauStatut,
      coproNom: e.pipeline?.copro?.nom ?? null,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const userSummary = buildUserSummary(allItems);

  const filtered = allItems.filter(ev => {
    if (selectedUser) {
      const email = ev.kind === "login" ? ev.email : ev.createdBy;
      if (email !== selectedUser) return false;
    }
    if (filter === "logins" && ev.kind !== "login") return false;
    if (filter === "actions" && ev.kind !== "pipeline") return false;
    return true;
  });

  const thStyle: React.CSSProperties = {
    background: "#FBFBFB",
    fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.04em",
    color: "#A2A1AF", textAlign: "left",
    padding: "0 16px", height: 40,
    borderBottom: "1px solid #E8E8EC",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT_SANS }}>

      {/* Résumé par utilisateur */}
      <div style={{ border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E8E8EC", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>Par utilisateur</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: "#656576", padding: "2px 8px", background: "#F7F7F8", borderRadius: 10 }}>
            {userSummary.length}
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Utilisateur</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Connexions</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Dernière activité</th>
            </tr>
          </thead>
          <tbody>
            {userSummary.map(u => (
              <tr
                key={u.email}
                style={{ borderBottom: "1px solid #F3F3F5", cursor: "pointer", background: selectedUser === u.email ? "#F5F5FF" : undefined }}
                onMouseEnter={e => { if (selectedUser !== u.email) e.currentTarget.style.background = "#FBFBFB"; }}
                onMouseLeave={e => { e.currentTarget.style.background = selectedUser === u.email ? "#F5F5FF" : ""; }}
                onClick={() => setSelectedUser(prev => prev === u.email ? null : u.email)}
              >
                <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      background: "#4E49FC", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 600,
                    }}>
                      {formatName(u.email).split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#26262C" }}>{formatName(u.email)}</div>
                      <div style={{ fontSize: 12, color: "#A2A1AF" }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center", verticalAlign: "middle" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: u.logins > 0 ? "#4E49FC" : "#C0C0C9", fontVariantNumeric: "tabular-nums" }}>
                    {u.logins}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "center", verticalAlign: "middle" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: u.actions > 0 ? "#26262C" : "#C0C0C9", fontVariantNumeric: "tabular-nums" }}>
                    {u.actions}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", verticalAlign: "middle" }}>
                  <span style={{ fontSize: 13, color: "#656576" }}>{formatRelative(u.lastSeen)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Feed d'activité */}
      <div style={{ border: "1px solid #E8E8EC", borderRadius: 8, background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(13,22,63,.05)" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #E8E8EC" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#26262C" }}>
            {selectedUser ? `Activité de ${formatName(selectedUser)}` : "Fil d'activité"}
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: "#656576", padding: "2px 8px", background: "#F7F7F8", borderRadius: 10 }}>
            {filtered.length}
          </span>
          <div style={{ flex: 1 }} />
          {/* Filtres */}
          <div style={{ display: "flex", gap: 2, background: "#F7F7F8", borderRadius: 6, padding: 2 }}>
            {(["all", "logins", "actions"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500,
                  cursor: "pointer", border: "none", transition: "all 120ms",
                  background: filter === f ? "#fff" : "transparent",
                  color: filter === f ? "#26262C" : "#656576",
                  boxShadow: filter === f ? "0 1px 2px rgba(13,22,63,.06)" : "none",
                }}
              >
                {f === "all" ? "Tout" : f === "logins" ? "Connexions" : "Actions"}
              </button>
            ))}
          </div>
          {selectedUser && (
            <button
              onClick={() => setSelectedUser(null)}
              style={{ fontSize: 12, color: "#A2A1AF", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Tous les utilisateurs
            </button>
          )}
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", fontSize: 13, color: "#A2A1AF" }}>
            Aucune activité sur cette période.
          </div>
        ) : (
          <div style={{ padding: "8px 0" }}>
            {filtered.slice(0, 500).map(ev => {
              const email = ev.kind === "login" ? ev.email : ev.createdBy;
              const { icon, text, color } = getEventLabel(ev);
              return (
                <div
                  key={ev.id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", transition: "background 120ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FBFBFB")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  {/* Icône */}
                  <span style={{ fontSize: 14, color, width: 16, textAlign: "center", flexShrink: 0, fontFamily: FONT_MONO }}>
                    {icon}
                  </span>
                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "#26262C", fontWeight: 500 }}>{formatName(email)} </span>
                    <span style={{ fontSize: 13, color: "#656576" }}>{text}</span>
                  </div>
                  {/* Date */}
                  <span style={{ fontSize: 12, color: "#A2A1AF", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {formatAbsolute(ev.createdAt)}
                  </span>
                </div>
              );
            })}
            {filtered.length > 500 && (
              <div style={{ padding: "12px 16px", fontSize: 12, fontStyle: "italic", color: "#A2A1AF", borderTop: "1px solid #F3F3F5" }}>
                … {filtered.length - 500} activités plus anciennes non affichées ici — les compteurs par utilisateur ci-dessus restent complets sur 30 jours.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
