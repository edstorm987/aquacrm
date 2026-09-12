// GET /api/auth/oauth/google/start?return=<url>&brand=<brand>&clientId=<client>
// Redirects to Google's authorize URL. State + redirect-uri match the
// callback's expectations. 404 when env not configured.

import { NextResponse, type NextRequest } from "next/server";
import {
  buildAuthorizeUrl,
  clearGoogleOAuthFlowCookie,
  googleOAuthFlowCookie,
  readGoogleOAuthConfig,
} from "@/lib/server/integrations/oauthGoogle";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";
import { resolvePublicAuthContext } from "@/lib/server/auth/authContext";
import { ensureHydrated } from "@/server/storage";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const config = readGoogleOAuthConfig(`${origin}/api/auth/oauth/google/callback`);
  if (!config) {
    const response = NextResponse.json({ ok: false, error: "google_oauth_not_configured" }, { status: 404 });
    const cookie = clearGoogleOAuthFlowCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const returnUrl = req.nextUrl.searchParams.get("return") ?? "/portal";
  const brand = req.nextUrl.searchParams.get("brand") ?? undefined;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const secret = resolveSigningSecret();
  try {
    await ensureHydrated();
    const context = resolvePublicAuthContext({ brand, clientId });
    if (!context.valid) throw new Error("invalid_oauth_context");
    const { url, browserProof } = buildAuthorizeUrl(config, { returnUrl, brand, clientId, secret });
    const response = NextResponse.redirect(url, 302);
    const cookie = googleOAuthFlowCookie(browserProof);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    const fallback = new URL("/login", origin);
    fallback.searchParams.set("oauth_error", "invalid_context");
    const response = NextResponse.redirect(fallback, 302);
    const cookie = clearGoogleOAuthFlowCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}
