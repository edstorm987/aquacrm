import "server-only";

import { createClient } from "@supabase/supabase-js";

function readAdminEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for admin data access.");
  }
  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = readAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
