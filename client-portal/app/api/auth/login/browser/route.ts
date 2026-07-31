import { NextResponse } from "next/server";
import {
  authenticatePortalUser,
  createPortalSession,
  SESSION_COOKIE,
} from "@/lib/auth";
import {
  cleanString,
  isEmail,
  noStoreHeaders,
  safeInternalPath,
  safeRedirectUrl,
} from "@/lib/route-security";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = cleanString(form.get("email"), 254).toLowerCase();
  const password = cleanString(form.get("password"), 256);
  const next = safeInternalPath(cleanString(form.get("next"), 500), "/portal");
  const errorReturn = safeRedirectUrl(cleanString(form.get("errorReturn"), 800), request, "/login");

  if (!isEmail(email) || !password) {
    const errorUrl = new URL(errorReturn);
    errorUrl.searchParams.set("error", "Those details did not match.");
    return NextResponse.redirect(errorUrl, { status: 303, headers: noStoreHeaders() });
  }

  const user = await authenticatePortalUser(email, password);

  if (!user) {
    const errorUrl = new URL(errorReturn);
    errorUrl.searchParams.set("error", "Those details did not match.");
    return NextResponse.redirect(errorUrl, { status: 303, headers: noStoreHeaders() });
  }

  const destination = new URL(next, request.url);
  const response = NextResponse.redirect(destination, { status: 303, headers: noStoreHeaders() });
  response.cookies.set(SESSION_COOKIE, createPortalSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
