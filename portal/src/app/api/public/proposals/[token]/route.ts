import { NextResponse } from "next/server";

import { findCommercialProposal } from "@/lib/server/commercialProposal";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";

// Accepting a commercial proposal, from a link, with no session.
//
// ── Rate limiting, added 2026-08-27 by the Phase D public-surface review ──
//
// This was the only unauthenticated WRITE on the public surface with no limit
// of any kind, while its neighbours — contact, careers, brand-enquiry — all
// have one.
//
// The token itself is not the worry: `makeId` draws 24 characters from a
// 36-character alphabet using `crypto.getRandomValues`, which is around 124
// bits, so guessing one is not a realistic attack and this limit is not
// pretending to make it harder. What it stops is the cheap stuff — hammering a
// known link, and the 404 branch being used as a free oracle to probe tokens at
// speed. A signed agreement is also the single most consequential thing an
// anonymous caller can do in this app, which is reason enough not to leave the
// door swinging.
//
// Limits are per-IP and deliberately generous: a real person accepts once, and
// might legitimately retry a few times on a flaky connection.
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1_000;

export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `proposal-accept:${ip}`, max: MAX_PER_WINDOW, windowMs: WINDOW_MS });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const { token } = await context.params;
  const proposal = await findCommercialProposal(token);
  if (!proposal) return NextResponse.json({ ok: false, error: "Proposal not found." }, { status: 404 });
  const body = await req.json().catch(() => null) as { acceptedBy?: string; confirmed?: boolean } | null;
  const acceptedBy = body?.acceptedBy?.trim();
  if (!acceptedBy || !body?.confirmed) {
    return NextResponse.json({ ok: false, error: "Enter your name and confirm the agreement." }, { status: 400 });
  }
  const pack = await proposal.accept(acceptedBy);
  return NextResponse.json({ ok: true, status: pack?.agreementStatus, acceptedAt: pack?.acceptedAt });
}
