import { NextResponse, type NextRequest } from "next/server";

import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import {
  WEBSITE_DEMO_TERMS_VERSION,
  recordWebsiteDemoSignup,
  websiteDemoEnabled,
} from "@/server/websiteDemo";

export const runtime = "nodejs";

/**
 * The public AquaCRM demo gate — Stage 1.
 *
 * Same-origin only, honeypotted, rate limited per caller and per contact, and
 * DISABLED unless `WEBSITE_DEMO_ENABLED` says otherwise. While the flag is off
 * this route answers 404: the demo does not exist yet, and saying "forbidden"
 * would advertise a surface that is not open.
 *
 * It writes into the `website-demo` data realm (see `server/websiteDemo.ts`),
 * never the live one, and it creates no lead, no client and no user. A person
 * asking to see a demo has not become anybody's customer.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()\d\s.-]{7,40}$/;

interface DemoInterestBody {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
  consent?: unknown;
  termsVersion?: unknown;
  sourcePath?: unknown;
  /** Honeypot — a real person never fills this in. */
  website?: unknown;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fail(error: string, status: number, retryAfter?: number) {
  return NextResponse.json({ ok: false, error }, {
    status,
    headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined,
  });
}

export async function POST(req: NextRequest) {
  if (!websiteDemoEnabled()) {
    return fail("The AquaCRM demo is not open yet.", 404);
  }

  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return fail("This request could not be verified.", 403);
  }

  const ip = clientIpFromHeaders(req.headers);
  const ipLimit = rateLimit({ key: `demo-interest:${ip}`, max: 5, windowMs: 60 * 60 * 1_000 });
  if (!ipLimit.allowed) {
    return fail("Too many demo requests have been sent. Please try again later.", 429, ipLimit.retryAfterSec);
  }

  let body: DemoInterestBody;
  try {
    body = await req.json() as DemoInterestBody;
  } catch {
    return fail("Please check the form and try again.", 400);
  }

  // Honeypot: accept and discard, so a bot learns nothing from the answer.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const hasEmail = EMAIL.test(email);
  const hasPhone = PHONE.test(phone);

  if (!name || (!hasEmail && !hasPhone)) {
    return fail("Add your name and either an email address or a phone number.", 400);
  }
  if (body.consent !== true) {
    return fail("Please tick the box to agree to the demo terms.", 400);
  }
  // The record must name the text the person actually saw. A stale page posting
  // an older version is refused rather than silently stamped with the new one.
  const termsVersion = clean(body.termsVersion, 80);
  if (termsVersion && termsVersion !== WEBSITE_DEMO_TERMS_VERSION) {
    return fail("The demo terms have changed. Please reload the page and try again.", 409);
  }

  const contactLimit = rateLimit({
    key: `demo-interest-contact:${hasEmail ? email : phone.replace(/\D/g, "")}`,
    max: 3,
    windowMs: 24 * 60 * 60 * 1_000,
  });
  if (!contactLimit.allowed) {
    return fail("We already have your recent demo request.", 429, contactLimit.retryAfterSec);
  }

  const result = await recordWebsiteDemoSignup({
    name,
    email: hasEmail ? email : undefined,
    phone: hasPhone ? phone : undefined,
    note: clean(body.note, 2_000) || undefined,
    sourcePath: clean(body.sourcePath, 200) || undefined,
    consent: true,
  });

  if (!result.ok) {
    if (result.reason === "disabled") return fail("The AquaCRM demo is not open yet.", 404);
    return fail("Add your name and either an email address or a phone number.", 400);
  }

  // What happens next is stated plainly, because nothing else happens yet:
  // there is no sandbox to hand over and no email is sent. Claiming otherwise
  // would be a delivery claim this route cannot keep.
  return NextResponse.json({
    ok: true,
    recorded: true,
    consentVersion: result.signup.consent.termsVersion,
    nextStep: "Your request is on the list. We will contact you when the demo opens.",
  });
}
