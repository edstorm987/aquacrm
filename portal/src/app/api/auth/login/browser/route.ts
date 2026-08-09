import { NextRequest, NextResponse } from "next/server";
import { POST as loginWithJson } from "../route";

const localLoginOrigins = new Set([
  "http://localhost:3030",
  "http://localhost:3033",
  "http://localhost:3034",
]);

function configuredLoginOrigins() {
  return [
    process.env.NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL,
    process.env.NEXT_PUBLIC_ZIMANTE_URL,
    process.env.NEXT_PUBLIC_AQUAOASIS_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function safeErrorReturn(raw: FormDataEntryValue | null, fallback: URL) {
  if (typeof raw !== "string") return fallback;

  try {
    const candidate = new URL(raw);
    const allowed = new Set([
      ...localLoginOrigins,
      ...configuredLoginOrigins(),
    ]);
    if (allowed.has(candidate.origin)) return candidate;
  } catch {
    // Invalid return URLs fall back to the portal's branded login.
  }

  return fallback;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = typeof form.get("email") === "string"
    ? String(form.get("email"))
    : "";
  const password = typeof form.get("password") === "string"
    ? String(form.get("password"))
    : "";
  const brand = typeof form.get("brand") === "string"
    ? String(form.get("brand"))
    : "milesymedia";

  const fallback = new URL("/login", req.nextUrl.origin);
  fallback.searchParams.set("brand", brand);
  const errorReturn = safeErrorReturn(form.get("errorReturn"), fallback);

  const internalRequest = new NextRequest(
    new URL("/api/auth/login", req.nextUrl.origin),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for":
          req.headers.get("x-forwarded-for") ??
          req.headers.get("x-real-ip") ??
          "browser-form",
      },
      body: JSON.stringify({ email, password, brand }),
    },
  );
  const loginResponse = await loginWithJson(internalRequest);
  const payload = (await loginResponse.json()) as {
    ok?: boolean;
    error?: string;
    redirect?: string;
  };

  if (!loginResponse.ok || !payload.ok) {
    errorReturn.searchParams.set(
      "error",
      payload.error ?? "We could not sign you in. Please try again.",
    );
    return NextResponse.redirect(errorReturn, 303);
  }

  const destination =
    payload.redirect?.startsWith("/") ? payload.redirect : "/portal";
  const response = NextResponse.redirect(
    new URL(destination, req.nextUrl.origin),
    303,
  );
  const sessionCookie = loginResponse.headers.get("set-cookie");
  if (sessionCookie) response.headers.append("set-cookie", sessionCookie);
  return response;
}
