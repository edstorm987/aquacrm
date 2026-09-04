// Central resolution of the Supabase keys.
//
// Supabase deprecated the legacy JWT API keys (the `eyJ…` anon / service_role
// keys) in favour of the new `sb_publishable_…` / `sb_secret_…` keys. When the
// project rotated, the app's hand-set `SUPABASE_SERVICE_ROLE_KEY` /
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy) stopped resolving to `service_role`,
// so every request arrived as `anon` and answered `42501 permission denied`,
// and session validation (`supabase.auth.getUser`) failed → 401 everywhere.
//
// The Supabase↔Vercel integration keeps the CURRENT keys in its own variables
// (`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_PUBLISHABLE_KEY`, …) and updates them on
// every future rotation. Reading those FIRST — with the older names as a
// fallback — fixes the outage and means a future rotation needs no code or env
// change. When the integration variables are confirmed in place, the legacy
// hand-set variables can simply be deleted.

/**
 * The privileged server-side key (`service_role`). Prefers the new secret key.
 * Returns `undefined` in the browser bundle (the value is never `NEXT_PUBLIC`,
 * so it is never inlined client-side) — call this only from server code.
 */
export function resolveSupabaseSecretKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

/**
 * The public key used by the browser client and by Supabase Auth. Prefers the
 * new publishable key. Every name here is written literally so Next inlines the
 * build-time value into the client bundle.
 */
export function resolveSupabasePublicKey(): string | undefined {
  return (
    // The Supabase↔Vercel integration names the browser key
    // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (confirmed accepted by Auth). Keep the
    // shorter spelling and the legacy anon name as fallbacks.
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
}

/** The project URL. Unchanged by key rotation; kept here for one import site. */
export function resolveSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  );
}
