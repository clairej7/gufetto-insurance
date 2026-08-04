export async function GET() {
  // Expose la version déployée pour vérifier d'un coup d'œil quel commit est live
  // (Railway injecte RAILWAY_GIT_COMMIT_SHA / RAILWAY_GIT_BRANCH au build).
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null;
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
  });
}
