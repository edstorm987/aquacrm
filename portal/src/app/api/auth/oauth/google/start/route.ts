// GET /api/auth/oauth/google/start?return=<url>&brand=<brand>&clientId=<client>
// Redirects to Google's authorize URL. State + redirect-uri match the
// callback's expectations. 404 when env not configured.

import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, readGoogleOAuthConfig } from "@/lib/server/integrations/oauthGoogle";
import { resolveSigningSecret } from "@/lib/server/auth/sessionToken";
import { resolvePublicAuthContext } from "@/lib/server/auth/authContext";
import { ensureHydrated } from "@/server/storage";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const config = readGoogleOAuthConfig(`${origin}/api/auth/oauth/google/callback`);
  if (!config) return NextResponse.json({ ok: false, error: "google_oauth_not_configured" }, { status: 404 });

  const returnUrl = req.nextUrl.searchParams.get("return") ?? "/portal";
  const brand = req.nextUrl.searchParams.get("brand") ?? undefined;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const secret = resolveSigningSecret();
  try {
    await ensureHydrated();
    const context = resolvePublicAuthContext({ brand, clientId });
    if (!context.valid) throw new Error("invalid_oauth_context");
    const { url } = buildAuthorizeUrl(config, { returnUrl, brand, clientId, secret });
    return NextResponse.redirect(url, 302);
  } catch {
    const fallback = new URL("/login", origin);
    fallback.searchParams.set("oauth_error", "invalid_context");
    return NextResponse.redirect(fallback, 302);
  }
}
