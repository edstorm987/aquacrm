import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { requireSupabasePublicConfig } from "./config";

interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export function createRouteSupabaseClient(req: NextRequest) {
  const config = requireSupabasePublicConfig();
  const pendingCookies: PendingCookie[] = [];
  const client = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        pendingCookies.push(...cookies);
      },
    },
  });

  return {
    client,
    applyCookies(response: NextResponse) {
      for (const cookie of pendingCookies) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      return response;
    },
  };
}
