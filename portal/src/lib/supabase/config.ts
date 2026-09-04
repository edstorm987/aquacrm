import { resolveSupabasePublicKey, resolveSupabaseUrl } from "./keys";

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  // Prefer the new publishable key (integration-managed), fall back to the
  // legacy anon key. See lib/supabase/keys.ts for why.
  const url = resolveSupabaseUrl();
  const anonKey = resolveSupabasePublicKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return config;
}
