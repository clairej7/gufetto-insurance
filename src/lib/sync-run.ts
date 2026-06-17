import { prisma } from "@/lib/prisma";

// Source possible d'un run de synchro Omni.
export type SyncSource = "omni" | "omni-contrats" | "omni-infos-copro";

// Ouvre une trace de run (status "processing") AVANT de répondre au webhook.
// Le webhook répond ensuite 202 immédiatement, puis traite en arrière-plan
// (via after()) et appelle finishRun() pour clôturer la trace.
// Best-effort : si l'écriture de la trace échoue, on ne bloque pas la sync
// (on renvoie null et le webhook traite quand même).
export async function startRun(
  source: SyncSource,
  rowsReceived: number
): Promise<string | null> {
  try {
    const run = await prisma.syncRun.create({
      data: { source, status: "processing", rowsReceived },
      select: { id: true },
    });
    return run.id;
  } catch (e) {
    console.error(`[sync-run] startRun(${source}) failed:`, e);
    return null;
  }
}

// Clôture une trace de run. ok=true → "success" + result ; sinon → "error" + message.
export async function finishRun(
  runId: string | null,
  outcome:
    | { ok: true; result: unknown }
    | { ok: false; error: string }
): Promise<void> {
  if (!runId) return;
  try {
    await prisma.syncRun.update({
      where: { id: runId },
      data: outcome.ok
        ? {
            status: "success",
            finishedAt: new Date(),
            result: outcome.result as object,
          }
        : {
            status: "error",
            finishedAt: new Date(),
            error: outcome.error.slice(0, 2000),
          },
    });
  } catch (e) {
    console.error(`[sync-run] finishRun(${runId}) failed:`, e);
  }
}
