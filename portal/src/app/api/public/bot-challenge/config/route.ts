import { NextResponse } from "next/server";

import { botChallengeClientConfig } from "@/lib/server/security/botChallenge";

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
} as const;

/**
 * Runtime client configuration for published and static forms.
 *
 * The Turnstile site key is intentionally public. The secret is never part of
 * this response. `required` lets a production page fail visibly when the
 * public key was not provisioned instead of presenting a form that can only be
 * refused by the server.
 */
export function GET() {
  const config = botChallengeClientConfig();
  return NextResponse.json(
    {
      provider: config.provider,
      siteKey: config.siteKey,
      enabled: config.enabled,
      required: config.required,
    },
    { headers: HEADERS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...HEADERS, "access-control-allow-methods": "GET, OPTIONS" },
  });
}
