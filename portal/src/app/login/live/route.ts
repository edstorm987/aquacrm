import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie, getSessionFromRequest } from "@/lib/server/auth/auth";
import { getAuthBrand } from "@/lib/brands/authBrand";

export const dynamic = "force-dynamic";

// Cross from the public product tour into real account access. The showcase
// uses a fictional signed session so visitors can explore the actual product;
// this boundary clears that one cookie before the database login is rendered.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const brand = getAuthBrand(requestUrl.searchParams.get("brand") ?? "aquacrm");

  // Build a RELATIVE redirect (Location: /login?…) rather than an absolute one.
  // Behind a proxy (Railway), `request.url` / `requestUrl.origin` is the app's
  // internal bind origin (`http://localhost:$PORT`), so an absolute redirect
  // built from it sends the browser to a dead `localhost` host. A relative
  // Location is resolved by the browser against the current public host, so it
  // works regardless of proxy, region, or which domain served the request.
  const params = new URLSearchParams();
  params.set("brand", brand.id);
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
