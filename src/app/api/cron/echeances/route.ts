import { NextRequest, NextResponse } from "next/server";
import { generateTasksForActivePipelines } from "@/lib/task-generation";

const CRON_SECRET = process.env.CRON_SECRET;

// Génère/backfill les tâches actionnables pour chaque deal actif selon son étape.
// Lancé une fois après l'import (backfill) et rejoué quotidiennement par le cron (auto-heal).
// Logique unifiée dans src/lib/task-generation.ts.
export async function POST(req: NextRequest) {
  // Vérification du secret pour éviter les appels non autorisés
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateTasksForActivePipelines({ createdBy: "cron" });

  return NextResponse.json({ success: true, ...result });
}
