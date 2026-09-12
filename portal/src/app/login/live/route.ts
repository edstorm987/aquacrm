import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie, getSessionFromRequest } from "@/lib/server/auth/auth";
import { resolvePublicAuthContext } from "@/lib/server/auth/authContext";
import { ensureHydrated } from "@/server/storage";

export const dynamic = "force-dynamic";

// Cross from the public product tour into real account access. The showcase
// uses a fictional signed session so visitors can explore the actual product;
// this boundary clears that one cookie before the database login is rendered.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  await ensureHydrated();
  const requestedBrand = requestUrl.searchParams.get("brand")?.trim().slice(0, 120);
  const context = resolvePublicAuthContext({
    brand: requestedBrand,
    clientId: requestUrl.searchParams.get("clientId") ?? undefined,
  });

  // Build a RELATIVE redirect (Location: /login?…) rather than an absolute one.
  // Behind a proxy (Railway), `request.url` / `requestUrl.origin` is the app's
  // internal bind origin (`http://localhost:$PORT`), so an absolute redirect
  // built from it sends the browser to a dead `localhost` host. A relative
  // Location is resolved by the browser against the current public host, so it
  // works regardless of proxy, region, or which domain served the request.
  const params = new URLSearchParams();
  // Preserve the signed-in subject's requested context through the showcase
  // cookie-clearing boundary. The next page resolves presentation again and
  // the login handler treats these values only as a narrowing request.
  params.set("brand", requestedBrand || context.brand.id);
  if (context.requestedClientId) params.set("clientId", context.requestedClientId);
  if (!context.valid || requestUrl.searchParams.get("context_error") === "invalid") {
    params.set("context_error", "invalid");
  }
  const next = requestUrl.searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    params.set("next", next);
  }
  const location = `/login?${params.toString()}`;

  const response = new NextResponse(null, { status: 303, headers: { location } });
  const session = await getSessionFromRequest(request);
  if (session?.publicShowcase) {
    const cookie = clearSessionCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  response.headers.set("cache-control", "no-store");
  return response;
}
