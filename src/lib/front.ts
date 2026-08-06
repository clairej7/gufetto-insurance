// Helpers Front API : résolution des teammates (email → ID Front) et assignation
// de conversation. Utilisé par /api/front/draft pour assigner chaque ticket au
// gestionnaire de la copro (l'experte Front route ces tickets via leur tag dédié).

const FRONT_API_URL = "https://api2.frontapp.com";
const FRONT_TOKEN = process.env.FRONT_API_TOKEN;

// Cache mémoire des teammates (email minuscule → ID Front). ~480 membres chez
// Matera : on charge la liste complète et on la rafraîchit au-delà du TTL.
type TeammateCache = { map: Map<string, string>; fetchedAt: number };
let teammateCache: TeammateCache | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 h

async function loadTeammates(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let url: string | null = `${FRONT_API_URL}/teammates`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Front teammates ${res.status}: ${await res.text()}`);
    const data: { _results?: Array<{ email?: string; id?: string }>; _pagination?: { next?: string | null } } = await res.json();
    for (const t of data._results ?? []) {
      if (t.email && t.id) map.set(String(t.email).toLowerCase(), t.id);
    }
    url = data._pagination?.next ?? null;
  }
  return map;
}

// Retourne l'ID Front (tea_xxx) d'un email, ou null si introuvable / non configuré.
// Best-effort : ne lève jamais, ne bloque jamais l'envoi du mail.
export async function resolveTeammateId(email: string | null | undefined): Promise<string | null> {
  if (!FRONT_TOKEN || !email) return null;
  if (!teammateCache || Date.now() - teammateCache.fetchedAt >= TTL_MS) {
    try {
      teammateCache = { map: await loadTeammates(), fetchedAt: Date.now() };
    } catch (e) {
      console.error("[front] loadTeammates error:", e);
      if (!teammateCache) return null; // pas de cache utilisable
    }
  }
  return teammateCache.map.get(email.toLowerCase()) ?? null;
}

// Signature Front d'un teammate (HTML), best-effort. Renvoie la signature par
// défaut (ou la 1re) pour l'email donné, ou null. Ne lève jamais.
export async function getSignatureHtml(email: string | null | undefined): Promise<string | null> {
  if (!FRONT_TOKEN || !email) return null;
  try {
    const id = await resolveTeammateId(email);
    if (!id) return null;
    const res = await fetch(`${FRONT_API_URL}/teammates/${id}/signatures`, {
      headers: { Authorization: `Bearer ${FRONT_TOKEN}` },
    });
    if (!res.ok) return null;
    const data: { _results?: Array<{ body?: string; is_default?: boolean }> } = await res.json();
    const sigs = data._results ?? [];
    const chosen = sigs.find((s) => s.is_default) ?? sigs[0];
    return chosen?.body?.trim() || null;
  } catch (e) {
    console.error("[front] getSignatureHtml error:", e);
    return null;
  }
}

// Pose un ou plusieurs tags sur une conversation. Front renvoie 409 ("Tag not
// allowed in this conversation's inboxes") tant que la conversation fraîchement
// créée n'est pas encore rattachée à son inbox : on réessaie alors avec un petit
// backoff. Toute autre erreur stoppe immédiatement. Best-effort : ne lève jamais.
export async function tagConversation(
  conversationId: string,
  tagIds: string[],
  { maxAttempts = 6, delayMs = 1000 }: { maxAttempts?: number; delayMs?: number } = {},
): Promise<{ ok: boolean; status: number | null; attempts: number }> {
  if (!FRONT_TOKEN) return { ok: false, status: null, attempts: 0 };
  let status: number | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${FRONT_API_URL}/conversations/${conversationId}/tags`, {
        method: "POST",
        headers: { Authorization: `Bearer ${FRONT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tag_ids: tagIds }),
      });
      status = res.status;
      if (res.ok) return { ok: true, status, attempts: attempt };
      // 409 = conversation pas encore dans son inbox → on retente. Sinon on abandonne.
      if (res.status !== 409) {
        console.error("[front] tagConversation failed:", res.status, await res.text());
        return { ok: false, status, attempts: attempt };
      }
    } catch (e) {
      console.error("[front] tagConversation error:", e);
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { ok: false, status, attempts: maxAttempts };
}

// Assigne une conversation Front à un teammate. Retourne true si OK.
export async function assignConversation(conversationId: string, teammateId: string): Promise<boolean> {
  if (!FRONT_TOKEN) return false;
  const res = await fetch(`${FRONT_API_URL}/conversations/${conversationId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${FRONT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assignee_id: teammateId }),
  });
  if (!res.ok) {
    console.error("[front] assignConversation failed:", res.status, await res.text());
    return false;
  }
  return true;
}
