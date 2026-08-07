import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./config";

export async function createServerSupabaseClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          for (const value of values) {
            cookieStore.set(value.name, value.value, value.options);
          }
        } catch {
          // Server Components cannot always write cookies. The proxy and
          // route handlers perform the refresh where response headers exist.
        }
      },
    },
  });
}

export async function getAuthenticatedSupabaseUser() {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
