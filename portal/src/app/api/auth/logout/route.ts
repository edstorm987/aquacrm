import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth";
import { getAuthBrand } from "@/lib/authBrand";

export async function POST(_req: NextRequest) {
  const cookie = clearSessionCookie();
  // Form post → redirect home. JSON callers get { ok: true }.
  const isFormPost = _req.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
  if (isFormPost) {
    const authBrand = getAuthBrand(_req.cookies.get("aqua_public_brand")?.value);
    const loginPath = authBrand.id === "aqua" ? "/sign-in" : "/login";
    const res = NextResponse.redirect(new URL(loginPath, authBrand.homeUrl), { status: 303 });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
