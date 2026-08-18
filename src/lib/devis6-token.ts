// Jeton signé (HMAC) pour la page de validation gestionnaire, accessible sans
// compte Gufetto. Le jeton EST la sécurité de la page publique (signé + expirant).
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
const b64url = (b: Buffer) => b.toString("base64url");

export function signValidationToken(pipelineId: string, ttlDays = 45): string {
  const payload = JSON.stringify({ p: pipelineId, e: Date.now() + ttlDays * 86400000 });
  const body = b64url(Buffer.from(payload));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyValidationToken(token: string): string | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { p, e } = JSON.parse(Buffer.from(body, "base64url").toString()) as { p?: string; e?: number };
    if (typeof e === "number" && Date.now() > e) return null;
    return typeof p === "string" ? p : null;
  } catch {
    return null;
  }
}
