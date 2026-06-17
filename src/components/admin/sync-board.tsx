import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

// Forme minimale d'un run (sérialisé depuis Prisma SyncRun).
export interface SyncRunView {
  id: string;
  source: string;
  status: string; // "processing" | "success" | "error"
  rowsReceived: number;
  result: unknown;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

const SOURCE_LABELS: Record<string, string> = {
  omni: "Principale",
  "omni-contrats": "Contrats",
  "omni-infos-copro": "Infos copro",
};

// Compteurs affichés par source (clés du JSON result → libellé court).
const RESULT_KEYS: Record<string, { key: string; label: string }[]> = {
  omni: [
    { key: "created", label: "créées" },
    { key: "updated", label: "maj" },
    { key: "statutsKeptCrm", label: "statuts gardés" },
    { key: "statutsUpdatedFromOmni", label: "statuts Omni" },
  ],
  "omni-contrats": [
    { key: "buildings", label: "immeubles" },
    { key: "updated", label: "maj" },
    { key: "conflictsResolved", label: "conflits résolus" },
    { key: "conflicts", label: "conflits" },
    { key: "lockedManual", label: "verrouillés" },
    { key: "notFound", label: "inconnus" },
  ],
  "omni-infos-copro": [
    { key: "updated", label: "maj" },
    { key: "lockedManual", label: "verrouillés" },
    { key: "notFound", label: "inconnus" },
  ],
};

function fmtTime(d: Date) {
  return new Date(d).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function nightKey(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Europe/Paris",
  });
}

function duration(start: Date, end: Date | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#13762C" }}>
        <CheckCircle2 className="h-4 w-4" /> Succès
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#CA1E12" }}>
        <XCircle className="h-4 w-4" /> Échec
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#A2701E" }}>
      <Loader2 className="h-4 w-4 animate-spin" /> En cours
    </span>
  );
}

function Counters({ run }: { run: SyncRunView }) {
  if (run.status === "error") {
    return <span className="text-xs" style={{ color: "#CA1E12" }}>{run.error || "Erreur"}</span>;
  }
  if (run.status === "processing" || !run.result || typeof run.result !== "object") {
    return <span className="text-xs" style={{ color: "#A2A1AF" }}>—</span>;
  }
  const r = run.result as Record<string, unknown>;
  const keys = RESULT_KEYS[run.source] || [];
  const parts = keys
    .filter(({ key }) => typeof r[key] === "number")
    .map(({ key, label }) => `${r[key]} ${label}`);
  return (
    <span className="text-xs" style={{ color: "#656576" }}>
      {parts.length ? parts.join(" · ") : "—"}
    </span>
  );
}

export function SyncBoard({ runs }: { runs: SyncRunView[] }) {
  if (!runs.length) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm" style={{ borderColor: "#E8E8EC", color: "#A2A1AF" }}>
        Aucune synchronisation enregistrée sur les 30 derniers jours.
      </div>
    );
  }

  // Regroupe par nuit (date de démarrage, Europe/Paris).
  const groups: { night: string; runs: SyncRunView[] }[] = [];
  for (const run of runs) {
    const night = nightKey(run.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.night === night) last.runs.push(run);
    else groups.push({ night, runs: [run] });
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const hasError = group.runs.some((r) => r.status === "error");
        return (
          <div key={group.night} className="rounded-xl border overflow-hidden" style={{ borderColor: "#E8E8EC" }}>
            <div
              className="px-4 py-2.5 flex items-center justify-between"
              style={{ backgroundColor: hasError ? "#FEF2F2" : "#F7F7F8" }}
            >
              <span className="text-sm font-semibold capitalize" style={{ color: "#26262C" }}>
                {group.night}
              </span>
              {hasError && (
                <span className="text-xs font-medium" style={{ color: "#CA1E12" }}>
                  Au moins un échec
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "#A2A1AF" }}>
                  <th className="px-4 py-2 font-medium text-xs">Query</th>
                  <th className="px-4 py-2 font-medium text-xs">Heure</th>
                  <th className="px-4 py-2 font-medium text-xs">Lignes</th>
                  <th className="px-4 py-2 font-medium text-xs">Durée</th>
                  <th className="px-4 py-2 font-medium text-xs">Statut</th>
                  <th className="px-4 py-2 font-medium text-xs">Détail</th>
                </tr>
              </thead>
              <tbody>
                {group.runs.map((run) => (
                  <tr key={run.id} className="border-t" style={{ borderColor: "#F0F0F2" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: "#26262C" }}>
                      {SOURCE_LABELS[run.source] || run.source}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "#656576" }}>{fmtTime(run.startedAt)}</td>
                    <td className="px-4 py-2.5" style={{ color: "#656576" }}>{run.rowsReceived}</td>
                    <td className="px-4 py-2.5" style={{ color: "#656576" }}>{duration(run.startedAt, run.finishedAt)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-2.5"><Counters run={run} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
