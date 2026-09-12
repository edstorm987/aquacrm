// POST /api/auth/signup — TWO callers, two completely different outcomes.
//
// ─── 1. A native form post from a published website (the visitor path) ────
//
// `SignupFormBlock` renders a plain `<form method="POST">` with no JS, so a
// visitor's browser full-page-navigates here with an
// `application/x-www-form-urlencoded` body. Two bugs met at that point:
//
//   (a) ENCODING. This route parsed with `req.json()` only, the parse threw,
//       and the visitor landed on a raw `{"ok":false,"error":"Invalid
//       request."}` blob with no way back. Same failure `api/auth/login` had
//       (issues.md #14) and the fix is the same shape: branch on content-type,
//       answer a browser with a 303 back to the page it came from, and put
//       nothing about the submission in the URL.
//
//   (b) WHAT IT DID. Far worse than the blob. A visitor to a CLIENT's website
//       who filled in "create account" was run through `bootstrapAgency()` —
//       a whole new AGENCY, with core plugins installed and an owner login,
//       created by a stranger from a contact form. Ed's decision (2026-08-20):
//       "it creates a website lead not a client, key distinction... then we
//       manually talk with the customer, book them a meeting, and then we have
//       the create-customer button to turn them."
//
//       So the form path creates a LEAD and nothing else. It never calls
//       `bootstrapAgency`, never calls `createUser`, never issues a session,
//       and never reads a password. The lead lands in `leads-pipeline` — the
//       same service `api/public/contact` and `api/public/brand-enquiry`
//       already deposit website enquiries into — and an operator promotes it
//       with the existing convert-to-client button when the conversation is
//       real. No second capture mechanism was built for this.
//
// ─── 2. A JSON post (the product path) ───────────────────────────────────
//
// AquaCRM's own product signup remains available, but admission is now
// mailbox-first. The initial request stores only a password-free durable
// intent and sends a verification link. Mailbox proof grants a short-lived
// setup capability; only the completion request provisions the provider,
// tenant and owner and then issues the first session.
//
// The two are told apart by content-type, exactly as `api/auth/login` tells a
// browser post from a fetch caller. A published-site block can only ever
// produce the form-encoded kind, so a website visitor can no longer reach the
// agency-creating path at all.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { getUser } from "@/server/users";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { sendResendEmail } from "@/lib/server/email/resendEmail";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import {
  activateAgencySignup,
  AGENCY_SIGNUP_TERMS_VERSION,
  AGENCY_SIGNUP_SETUP_COOKIE,
  prepareAgencySignup,
  recordAgencySignupDelivery,
} from "@/server/agencySignup";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { listAgencies } from "@/server/tenants";
import { listWebsiteSources, normalizeHost, resolveWebsiteSourceRouting } from "@/server/websiteSources";
import {
  configuredPublicAuthOrigin,
  isExactConfiguredRequestOrigin,
} from "@/lib/server/auth/publicAuthOrigin";

interface Body {
  companyName?: unknown;
  email?: unknown;
  password?: unknown;
  phase?: unknown;
  captchaToken?: unknown;
  consent?: unknown;
}

// ─── Website-lead capture (the form branch) ──────────────────────────────

/** Status + human message for the block to render. Never a query string. */
const SIGNUP_STATUS_COOKIE = "aqua_signup_status";
const SIGNUP_MESSAGE_COOKIE = "aqua_signup_message";

const LEAD_THANKS = "Thanks — we have your details and will be in touch shortly.";
const LEAD_GENERIC_ERROR = "We could not send your details. Please try again.";
const LEAD_FIELDS_ERROR = "Please add your name and a valid email address.";
const LEAD_CONSENT_ERROR = "Please confirm the terms before sending your details.";
const LEAD_UNAVAILABLE = "This form is temporarily unavailable. Please email us instead.";
const LEAD_TOO_MANY = "Too many submissions. Please try again shortly.";
const LEAD_CONSENT_POLICY = "website-lead-terms";
const LEAD_CONSENT_VERSION = "2026-09-12";

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isFormPost(req: NextRequest): boolean {
  const contentType = req.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

function isJsonPost(req: NextRequest): boolean {
  return (req.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase() === "application/json";
}

// Where a form post goes back to — the SAME-ORIGIN referring page (the site
// the visitor was actually on), never an attacker-supplied URL and never a
// portal page they have no business seeing. Copied from the same guard in
// `api/auth/login`. Success and failure share it: the visitor stays put and
// the block renders the outcome from the cookie.
function formDestination(req: NextRequest): URL {
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const candidate = new URL(referer);
      if (
        candidate.origin === req.nextUrl.origin &&
        !candidate.pathname.startsWith("/api/")
      ) {
        candidate.hash = "";
        return candidate;
      }
    } catch {
      // Unparseable referer → fall through to the safe default.
    }
  }
  return new URL("/", req.nextUrl.origin);
}

/** Punctuation-safe slice of one of the fixed messages above. Never user input. */
function safeMessage(raw: string): string {
  const cleaned = raw.replace(/[^\w .,'’!?()/-]/g, " ").trim();
  return cleaned ? cleaned.slice(0, 160) : LEAD_GENERIC_ERROR;
}

function leadOutcome(req: NextRequest, ok: boolean, message: string): NextResponse {
  const response = NextResponse.redirect(formDestination(req), { status: 303 });
  const shared = {
    httpOnly: false, // the signup block reads both to render the outcome
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60,
  };
  response.cookies.set(SIGNUP_STATUS_COOKIE, ok ? "ok" : "error", shared);
  response.cookies.set(SIGNUP_MESSAGE_COOKIE, safeMessage(message), shared);
  return response;
}

function field(form: FormData, name: string, max: number): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Whose lead is this?
 *
 * Resolution is entirely server-side. Nothing a visitor can post or set as a
 * cookie is tenant authority, and nothing here can create an agency.
 *
 * The request URL's host must match exactly one operator-registered WebsiteSource.
 * Origin and Referer, when present, only corroborate that host; they never name
 * the tenant themselves. There is intentionally no posted-brand, public-cookie,
 * founder, or single-agency fallback. A central cross-origin form will need a
 * future server-signed source capability before it can be admitted safely.
 */
function resolveLeadOwner(req: NextRequest): {
  agencyId: string;
  host: string;
  clientId?: string;
  companyId?: string;
} | null {
  const host = req.nextUrl.host;
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;

  for (const header of ["origin", "referer"] as const) {
    const raw = req.headers.get(header);
    if (!raw) continue;
    try {
      if (normalizeHost(new URL(raw).host) !== normalizedHost) return null;
    } catch {
      return null;
    }
  }

  const matches = listAgencies().flatMap(agency => (
    listWebsiteSources(agency.id).some(source => source.host === normalizedHost)
      ? [agency]
      : []
  ));
  if (matches.length !== 1 || !matches[0]) return null;

  const agencyId = matches[0].id;
  const destination = resolveWebsiteSourceRouting(agencyId, normalizedHost);
  return {
    agencyId,
    host: normalizedHost,
    clientId: destination.kind === "client" ? destination.clientId : undefined,
    companyId: destination.kind === "company" ? destination.companyId : undefined,
  };
}

async function handleWebsiteLead(req: NextRequest): Promise<NextResponse> {
  // The limiter is IN FRONT of everything, on the same key and the same budget
  // the JSON path uses, so a form post is counted exactly as an account signup
  // was. The branch is after it, not around it.
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `signup:${ip}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) return leadOutcome(req, false, LEAD_TOO_MANY);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    form = new FormData();
  }

  // Honeypot — bots fill it, humans never see it. Answered as a success so the
  // trap is not discoverable, but nothing is written.
  if (field(form, "website", 200)) return leadOutcome(req, true, LEAD_THANKS);

  const name = field(form, "name", 120);
  const email = field(form, "email", 254).toLowerCase();
  const phone = field(form, "phone", 40);
  const company = field(form, "company", 160);
  const message = field(form, "message", 4_000);
  // NOTE: `password` is deliberately never read. A lead form has no business
  // holding one, and the current block does not render the input at all.

  if (!name || !PLAUSIBLE_EMAIL.test(email)) {
    return leadOutcome(req, false, LEAD_FIELDS_ERROR);
  }
  if (field(form, "terms", 12) !== "on") {
    return leadOutcome(req, false, LEAD_CONSENT_ERROR);
  }

  const challenge = await verifyBotChallenge({
    action: "website-lead-signup",
    token: field(form, "captchaToken", 4_096),
    remoteIp: ip,
    hostname: req.nextUrl.hostname,
  });
  if (!challenge.ok) return leadOutcome(req, false, challenge.message);

  // Only a human-verified submission may spend another person's address
  // budget. This is intentionally before tenant lookup and lead mutation.
  const emailLimit = rateLimit({
    key: `website-lead-signup-email:${email}`,
    max: 3,
    windowMs: 60 * 60 * 1_000,
  });
  if (!emailLimit.allowed) return leadOutcome(req, false, LEAD_TOO_MANY);

  // No `getUser(email)` check on this path — on purpose. Telling an anonymous
  // visitor "an account already exists for that email" is an account-existence
  // oracle, and a lead capture has no reason to ask. Every response below is
  // the same regardless of whether the address has an account.

  const referer = req.headers.get("referer") ?? "";
  try {
    await ensureHydrated();
  } catch (cause) {
    console.error("[signup] website lead state unavailable", cause);
    return leadOutcome(req, false, LEAD_UNAVAILABLE);
  }
  let pagePath = "/";
  try {
    if (referer) pagePath = new URL(referer).pathname.slice(0, 300);
  } catch {
    pagePath = "/";
  }
  try {
    ensureLeadsPipelineFoundationRegistered();

    const owner = resolveLeadOwner(req);
    if (!owner) return leadOutcome(req, false, LEAD_UNAVAILABLE);

    const install = getInstall({ agencyId: owner.agencyId }, "leads-pipeline");
    if (!install?.enabled) return leadOutcome(req, false, LEAD_UNAVAILABLE);

    const { leads } = containerFor({
      agencyId: owner.agencyId,
      storage: makePluginStorage(install.id) as never,
    });

    // `upsert`, not `create`: a double-submit or a refresh must enrich the
    // existing lead rather than deal a second card onto the board. The source
    // prefix is what makes `leads-pipeline` treat this as an ENQUIRY capture
    // (`isEnquiryCapture`) rather than a cold import.
    const { lead, created } = await leads.upsert(
      {
        email,
        name,
        phone: phone || undefined,
        company: company || undefined,
        source: `website:${owner.host}`,
        tags: ["website-enquiry", "website-signup"],
        notes: message || undefined,
        customFields: {
          capturedBy: "signup-form-block",
          pagePath,
          consentAcceptedAt: new Date().toISOString(),
          consentPolicy: LEAD_CONSENT_POLICY,
          consentPolicyVersion: LEAD_CONSENT_VERSION,
          // Host was resolved to exactly one registered WebsiteSource above.
          // Persist a server-derived policy URL; request Host is never evidence.
          consentTermsUrl: new URL(
            "/terms",
            `${process.env.NODE_ENV === "production" ? "https" : "http"}://${owner.host}`,
          ).toString(),
          ...(owner.clientId ? { routedClientId: owner.clientId } : {}),
          ...(owner.companyId ? { routedCompanyId: owner.companyId } : {}),
        },
      },
      // Anonymous capture. Same actor the plugin dispatcher passes for its own
      // `public: true` routes — there is no signed-in user to attribute this to.
      "anonymous",
    );

    // The message names the lead by ID, never by email or name: this install is
    // agency-scoped, so `clientErasure` (which sweeps activity by clientId)
    // would leave PII in an activity row forever. Same rule `leads.ts` follows.
    logActivity({
      agencyId: owner.agencyId,
      clientId: owner.clientId,
      category: "public-funnel",
      action: "form.website-signup.submitted",
      message: `Website signup block captured lead ${lead.id}.`,
      metadata: {
        leadId: lead.id,
        created,
        form: "signup-form-block",
        pagePath,
        source: lead.source,
      },
    });

    await flushPendingWrites();
    return leadOutcome(req, true, LEAD_THANKS);
  } catch (cause) {
    console.error("[signup] website lead capture failed", cause);
    return leadOutcome(req, false, LEAD_GENERIC_ERROR);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (isFormPost(req)) return handleWebsiteLead(req);
  return handleAccountSignup(req);
}

// ─── Product signup (JSON) — mailbox proof before privileged state ───────
//
// Flow:
//   1. Parse + validate non-secret intent, then apply the coarse IP limit.
//   2. Verify the exact `agency-signup` managed challenge.
//   3. Spend the victim-address budget only after challenge proof.
//   4. Persist/reuse a stable password-free operation and deliver its email.
//   5. Verification grants only an HttpOnly setup capability, never a session.
//   6. Completion uses that capability to create/adopt the provider identity,
//      atomically bootstrap one agency + owner, then issue the first session.

async function handleAccountSignup(req: NextRequest) {
  if (!isJsonPost(req)) {
    return NextResponse.json({ ok: false, error: "JSON content type required." }, { status: 415 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const ip = clientIpFromHeaders(req.headers);
  if (body.phase === "complete") {
    const publicOrigin = configuredPublicAuthOrigin();
    if (!publicOrigin || !isExactConfiguredRequestOrigin(req, publicOrigin)) {
      return NextResponse.json({ ok: false, error: "Account setup request was not accepted." }, { status: 403 });
    }
    const completeLimit = rateLimit({ key: `agency-signup-complete:${ip}`, max: 5, windowMs: 10 * 60_000 });
    if (!completeLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many setup attempts. Try again shortly." },
        { status: 429, headers: { "retry-after": String(completeLimit.retryAfterSec) } },
      );
    }
    const setupToken = req.cookies.get(AGENCY_SIGNUP_SETUP_COOKIE)?.value ?? "";
    const password = typeof body.password === "string" ? body.password : "";
    try {
      const { user, completedNow } = await activateAgencySignup({ setupToken, password });
      const response = NextResponse.json({
        ok: true,
        redirect: completedNow ? resolvePostLoginPath(null, user) : "/login?signup=complete",
      });
      if (completedNow) {
        const sessionToken = issueSession({
          userId: user.id,
          email: user.email,
          role: user.role,
          agencyId: user.agencyId,
          sessionRev: user.sessionRev ?? 0,
          aal: "aal1",
        });
        const cookie = sessionCookie(sessionToken);
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      response.cookies.set(AGENCY_SIGNUP_SETUP_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Account setup failed.";
      const isInput = /password|setup_|mailbox_verification_required/.test(message);
      return NextResponse.json(
        { ok: false, error: isInput ? message : "Account setup could not be completed. Please try again." },
        { status: isInput ? 400 : 503 },
      );
    }
  }

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!companyName) {
    return NextResponse.json({ ok: false, error: "Company name is required." }, { status: 400 });
  }
  if (companyName.length > 160) {
    return NextResponse.json({ ok: false, error: "Company name is too long (max 160 characters)." }, { status: 400 });
  }
  if (email.length > 254 || !PLAUSIBLE_EMAIL.test(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ ok: false, error: "Please accept the terms to continue." }, { status: 400 });
  }
  const ipLimit = rateLimit({ key: `agency-signup:${ip}`, max: 5, windowMs: 60_000 });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many signup attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(ipLimit.retryAfterSec) } },
    );
  }

  const challenge = await verifyBotChallenge({
    action: "agency-signup",
    token: body.captchaToken,
    remoteIp: ip,
    hostname: req.nextUrl.hostname,
  });
  if (!challenge.ok) {
    return NextResponse.json(
      { ok: false, error: challenge.message },
      {
        status: challenge.reason === "rate-limited" ? 429 : 403,
        headers: challenge.retryAfterSec ? { "retry-after": String(challenge.retryAfterSec) } : undefined,
      },
    );
  }

  const emailLimit = rateLimit({
    key: `agency-signup-email:${email}`,
    max: 3,
    windowMs: 60 * 60 * 1_000,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many signup requests. Try again later." },
      { status: 429, headers: { "retry-after": String(emailLimit.retryAfterSec) } },
    );
  }

  const publicOrigin = configuredPublicAuthOrigin();
  if (!publicOrigin) {
    return NextResponse.json({
      ok: true,
      accepted: true,
      message: "If this address can be used, a verification link is on its way.",
    }, { status: 202 });
  }

  const prepared = await prepareAgencySignup({
    email,
    companyName,
    consent: {
      acceptedAt: Date.now(),
      policy: "agency-self-service-terms",
      version: AGENCY_SIGNUP_TERMS_VERSION,
      termsUrl: new URL("/terms", publicOrigin).toString(),
    },
  });
  const verifyUrl = prepared.verificationToken
    ? `${publicOrigin}/api/auth/verify-email?token=${encodeURIComponent(prepared.verificationToken)}`
    : undefined;
  if (prepared.shouldDeliver && prepared.operation && verifyUrl) {
    const fromEmail = (process.env.AQUACRM_AUTH_FROM_EMAIL ?? process.env.MILESYMEDIA_FROM_EMAIL ?? "").trim();
    const senderName = (process.env.AQUACRM_AUTH_FROM_NAME ?? "AquaCRM").trim();
    const sent = fromEmail
      ? await sendResendEmail({
          to: prepared.operation.email,
          from: `${senderName} <${fromEmail}>`,
          replyTo: process.env.MILESYMEDIA_REPLY_TO?.trim() || fromEmail,
          idempotencyKey: `agency-signup-verify:${prepared.operation.id}:${prepared.operation.deliveryGeneration}`,
          signal: req.signal,
          subject: "Verify your AquaCRM account",
          text: `Confirm your email address to continue setting up AquaCRM. This link expires in 24 hours.\n\n${verifyUrl}`,
          html: `<p>Confirm your email address to continue setting up AquaCRM. This link expires in 24 hours.</p><p><a href="${verifyUrl}">Verify email address</a></p>`,
        })
      : { ok: false as const, reason: "AquaCRM auth email sender is not configured.", unconfigured: true };
    await recordAgencySignupDelivery(
      prepared.operation.id,
      prepared.operation.deliveryGeneration,
      sent.ok
        ? { delivered: true, externalMessageId: sent.id }
        : { delivered: false, error: sent.reason, outcomeUnknown: sent.outcomeUnknown },
    );
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (isDev && verifyUrl) {
    // eslint-disable-next-line no-console
    console.log(`[signup] verify-email URL prepared for local development: ${verifyUrl}`);
  }
  return NextResponse.json({
    ok: true,
    accepted: true,
    message: "If this address can be used, a verification link is on its way.",
    ...(isDev && verifyUrl ? { devVerifyUrl: verifyUrl } : {}),
  }, { status: 202 });
}
