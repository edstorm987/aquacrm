import { NextResponse } from "next/server";

import { SESSION_COOKIE, verifyPortalSession } from "@/lib/auth";
import { noStoreHeaders, safeInternalPath } from "@/lib/route-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const next = safeInternalPath(url.searchParams.get("next") || "/portal", "/portal");
  const session = verifyPortalSession(token);

  if (!session) {
    return NextResponse.redirect(new URL("/login?error=Please+sign+in+again.", request.url), {
      status: 303,
      headers: noStoreHeaders(),
    });
  }

  const response = NextResponse.redirect(new URL(next, request.url), {
    status: 303,
    headers: noStoreHeaders(),
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, session.exp - Math.floor(Date.now() / 1000)),
  });
  return response;
}
