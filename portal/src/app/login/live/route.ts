import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie, getSessionFromRequest } from "@/lib/server/auth";
import { getAuthBrand } from "@/lib/authBrand";

export const dynamic = "force-dynamic";

// Cross from the public product tour into real account access. The showcase
// uses a fictional signed session so visitors can explore the actual product;
// this boundary clears that one cookie before the database login is rendered.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const brand = getAuthBrand(requestUrl.searchParams.get("brand") ?? "aquacrm");
  const destination = new URL("/login", requestUrl.origin);
  destination.searchParams.set("brand", brand.id);

  const next = requestUrl.searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    destination.searchParams.set("next", next);
  }

  const response = NextResponse.redirect(destination, 303);
  const session = await getSessionFromRequest(request);
  if (session?.publicShowcase) {
    const cookie = clearSessionCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  response.headers.set("cache-control", "no-store");
  return response;
}
