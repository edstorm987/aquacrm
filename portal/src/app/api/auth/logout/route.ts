import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth";
import { getAuthBrand } from "@/lib/authBrand";

export async function POST(_req: NextRequest) {
  const cookie = clearSessionCookie();
  // Form post → redirect home. JSON callers get { ok: true }.
  const isFormPost = _req.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
  if (isFormPost) {
    const authBrand = getAuthBrand(_req.cookies.get("aqua_public_brand")?.value);
    const destination =
      authBrand.id === "aqua"
        ? new URL("/sign-in", authBrand.homeUrl)
        : authBrand.id === "aquacrm"
          ? new URL("/login?brand=aquacrm", _req.url)
          : new URL("/login", authBrand.homeUrl);
    const res = NextResponse.redirect(destination, { status: 303 });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
