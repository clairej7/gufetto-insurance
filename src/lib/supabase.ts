import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!;

// Client côté navigateur (upload depuis le front)
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Client côté serveur avec droits élevés (pour les actions serveur)
export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);

export const STORAGE_BUCKET = "gufetto_doc";

export function getPublicUrl(path: string): string {
  const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
