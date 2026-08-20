import "server-only";

import { AuthError } from "@/lib/server/auth/auth";
import { createServerSupabaseClient } from "./server";

export type ScopedSupabaseClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;

/**
 * The signed-in user's OWN Supabase client for internal portal routes — anon
 * key plus the caller's session cookies, so every query runs under row-level
 * security as that user instead of bypassing it with the service-role key.
 *
 * Why this is safe to use in routes behind `requireRole`: `getSession()`
 * already refuses any portal session whose Supabase session is missing or
 * stale whenever Supabase is configured (see lib/server/auth/auth.ts), so a
 * request that passed the role gate carries live Supabase cookies. The
 * `getUser()` check here makes the remaining cases LOUD instead of silently
 * empty: demo/showcase sessions (which skip that verification) and routes
 * that gate with the cookie-only `getSessionFromRequest` get a 401 asking to
 * sign in, never a misleading "not found" from RLS filtering to zero rows.
 *
 * Throws:
 * - `Error` when Supabase env is not configured (same failure mode and route
 *   status as the service-role admin client had in that environment);
 * - `AuthError(401)` when no live Supabase user backs the request —
 *   `authErrorResponse` turns it into the JSON 401 the portal expects.
 */
export async function createScopedSupabaseClient(): Promise<ScopedSupabaseClient> {
  const client = await createServerSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new AuthError(401, "Your sign-in has expired. Please sign in again.");
  }
  return client;
}
