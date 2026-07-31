import { NextResponse } from "next/server";
import {
  authenticatePortalUser,
  createPortalSession,
  SESSION_COOKIE,
} from "@/lib/auth";
import { cleanString, isEmail, jsonError, noStoreHeaders } from "@/lib/route-security";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json() as { email?: unknown; password?: unknown };
  } catch {
    return jsonError("Invalid request.", 400);
  }
  const email = cleanString(body.email, 254).toLowerCase();
  const password = cleanString(body.password, 256);
  if (!isEmail(email) || !password) return jsonError("Those details did not match.", 401);

  const user = await authenticatePortalUser(email, password);
  if (!user) {
    return jsonError("Those details did not match.", 401);
  }
  const response = NextResponse.json(
    { ok: true, role: user.role },
    { headers: noStoreHeaders() },
  );
  response.cookies.set(SESSION_COOKIE, createPortalSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
