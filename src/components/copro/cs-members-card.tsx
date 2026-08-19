"use client";

// Carte fiche « Mails des membres du CS » (colonne du milieu). Affiche les membres
// du conseil syndical récupérés depuis Matera (visible_role="council"), stockés
// dans copro.csMembersData. Lecture seule + bouton « Copier les emails » pour
// coller dans le champ Destinataires (CS). Le remplissage se fait côté agent /
// script (l'app n'a pas de token Matera) — voir csMembersSyncedAt pour la fraîcheur.

import { useState } from "react";
import { Users, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";

type CsMember = { name: string; email: string };

function parse(raw: string | null): CsMember[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((m) => m?.email) : []; } catch { return []; }
}

export function CsMembersCard({ csMembersData, csMembersSyncedAt }: { csMembersData: string | null; csMembersSyncedAt: Date | string | null }) {
  const members = parse(csMembersData);
  const [copied, setCopied] = useState(false);
  const synced = csMembersSyncedAt ? new Date(csMembersSyncedAt) : null;
  const emails = members.map((m) => m.email).join("; ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard indispo */ }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#26262C" }}>
          <Users className="h-4 w-4" />
          Mails des membres du CS
        </h3>
        {members.length > 0 && (
          <button
            onClick={copy}
            className="text-[11px] font-semibold px-2 py-1 rounded-md border inline-flex items-center gap-1"
            style={{ color: copied ? "#13762C" : "#4E49FC", background: copied ? "#EFFBF2" : "#F5F5FF", borderColor: copied ? "#B7E4C4" : "#D9D9F5" }}
            title="Copier tous les emails (séparés par ;)"
          >
            {copied ? <><Check className="h-3 w-3" />Copié</> : <><Copy className="h-3 w-3" />Copier les emails</>}
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-xs" style={{ color: "#A2A1AF" }}>
          {synced
            ? "Aucun membre du conseil syndical n'est renseigné pour cette copropriété dans Matera."
            : "Membres du CS pas encore récupérés."}
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((m, i) => (
            <li key={i} className="flex flex-col">
              <span className="text-xs font-medium" style={{ color: "#26262C" }}>{m.name}</span>
              <a href={`mailto:${m.email}`} className="text-xs hover:underline" style={{ color: "#4E49FC" }}>{m.email}</a>
            </li>
          ))}
        </ul>
      )}

      {synced && (
        <p className="text-[10.5px] mt-3 pt-2" style={{ color: "#C0C0C9", borderTop: "1px solid #F1F1F4" }}>
          Récupéré depuis Matera le {synced.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      )}
    </Card>
  );
}
