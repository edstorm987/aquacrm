// GET /api/internal/sweep — founder-gated diagnostic that prunes expired
// rate-limit + login-failure records and reports counts. R021 Goal D.
//
// Sessions are stateless HMAC tokens — they auto-expire on verify. There
// is no session-list to prune (chapter #68 honesty). The sweep covers the
// in-memory stores that DO accumulate: the rateLimit bucket map and the
// login-failure lockout map.

import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireRole, authErrorResponse } from "@/lib/server/auth";
import { sweepExpired } from "@/lib/server/rateLimit";

export async function GET() {
  await ensureHydrated();
  try {
    await requireRole("agency-owner");
  } catch (err) {
    return authErrorResponse(err);
  }
  const stats = await sweepExpired();
  return NextResponse.json({ ok: true, stats });
}
