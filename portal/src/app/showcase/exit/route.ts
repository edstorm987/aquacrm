import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const websiteUrl = process.env.AQUACRM_WEBSITE_URL
    ?? (requestUrl.hostname === "localhost" ? "http://localhost:3040" : "https://aqua-crm.com");
  const response = NextResponse.redirect(new URL("/projects/?project=aquacrm", websiteUrl), 303);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
