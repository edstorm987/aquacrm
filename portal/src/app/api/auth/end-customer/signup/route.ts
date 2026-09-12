// POST /api/auth/end-customer/signup
//
// Direct public registration is intentionally closed. A clientId is an
// identifier, not authority to join that client's tenant. Client portal
// membership is created only when `/api/auth/magic/verify` redeems the
// purpose-bound, single-use invitation issued by the authenticated
// customer-portal-control route.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `signup:${ip}`, max: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-up attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Client portal accounts require an access invitation from the agency.",
    },
    { status: 403 },
  );
}
