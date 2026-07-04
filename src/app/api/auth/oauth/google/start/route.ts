// GET /api/auth/oauth/google/start?return=<url>
// Redirects to Google's authorize URL. State + redirect-uri match the
// callback's expectations. 404 when env not configured.

import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, readGoogleOAuthConfig } from "@/lib/server/oauthGoogle";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const config = readGoogleOAuthConfig(`${origin}/api/auth/oauth/google/callback`);
  if (!config) return NextResponse.json({ ok: false, error: "google_oauth_not_configured" }, { status: 404 });

  const returnUrl = req.nextUrl.searchParams.get("return") ?? "/portal";
  const secret = process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod";
  const { url } = buildAuthorizeUrl(config, { returnUrl, secret });
  return NextResponse.redirect(url, 302);
}
