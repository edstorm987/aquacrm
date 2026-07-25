// GET /api/auth/csrf — issue a CSRF token (cookie + body) for double-submit.
// R021. Forms fetch this on mount, then echo `token` in `x-csrf-token` header
// on subsequent state-changing requests.

import { NextResponse } from "next/server";
import { signCsrfToken, csrfCookie } from "@/lib/server/csrf";

export async function GET() {
  const { token } = signCsrfToken();
  const cookie = csrfCookie(token);
  const res = NextResponse.json({ ok: true, token });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
