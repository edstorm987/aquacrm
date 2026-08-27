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
// Unchanged, deliberately. AquaCRM's own product signup — somebody choosing to
// create an AquaCRM workspace — is a real thing and still bootstraps an agency
// + owner + verification email + auto-login. Every byte of that handler below
// is as it was; the form branch is in front of it, not around it.
//
// The two are told apart by content-type, exactly as `api/auth/login` tells a
// browser post from a fetch caller. A published-site block can only ever
// produce the form-encoded kind, so a website visitor can no longer reach the
// agency-creating path at all.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { createUser, getUser } from "@/server/users";
import { signVerifyEmailToken } from "@/lib/server/auth/emailVerification";
import { logActivity } from "@/server/activity";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { getAgencyBySlug, listAgencies } from "@/server/tenants";
import { FOUNDER_AGENCY_SLUG, seedFounder } from "@/lib/server/seeds/founderSeed";
import { listWebsiteSources, normalizeHost, resolveWebsiteSourceRouting } from "@/server/websiteSources";

interface Body {
  companyName?: unknown;
  email?: unknown;
  password?: unknown;
}

// ─── Website-lead capture (the form branch) ──────────────────────────────

/** Status + human message for the block to render. Never a query string. */
const SIGNUP_STATUS_COOKIE = "aqua_signup_status";
const SIGNUP_MESSAGE_COOKIE = "aqua_signup_message";

const LEAD_THANKS = "Thanks — we have your details and will be in touch shortly.";
const LEAD_GENERIC_ERROR = "We could not send your details. Please try again.";
const LEAD_FIELDS_ERROR = "Please add your name and a valid email address.";
const LEAD_UNAVAILABLE = "This form is temporarily unavailable. Please email us instead.";
const LEAD_TOO_MANY = "Too many submissions. Please try again shortly.";

const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isFormPost(req: NextRequest): boolean {
  const contentType = req.headers.get("content-type") ?? "";
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
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
 * Resolution is entirely server-side. Nothing a visitor can type can pick an
 * agency that does not already exist, and nothing here can create one.
 *
 *   1. The submitting site's HOST, matched against the website sources an
 *      operator registered in the app (`listWebsiteSources`). This is the real
 *      answer — "cedar-dental.com goes to Cedar" — and it also tells us which
 *      client or company the site belongs to.
 *   2. The `brand` field / `aqua_public_brand` cookie, looked up as an agency
 *      SLUG. A preference, never a grant: an unknown slug simply falls through.
 *   3. The founder agency, the same fallback `api/public/contact` uses.
 *   4. A single-agency portal — if there is exactly one, the lead is obviously
 *      its. With two or more and no other signal we refuse rather than guess,
 *      because filing one agency's lead under another is worse than a retry.
 */
function resolveLeadOwner(
  req: NextRequest,
  brandHint: string,
  host: string,
): { agencyId: string; clientId?: string; companyId?: string } | null {
  const normalizedHost = normalizeHost(host);
  const agencies = listAgencies();

  if (normalizedHost) {
    for (const agency of agencies) {
      const match = listWebsiteSources(agency.id).find(source => source.host === normalizedHost);
      if (!match) continue;
      const destination = resolveWebsiteSourceRouting(agency.id, normalizedHost);
      return {
        agencyId: agency.id,
        clientId: destination.kind === "client" ? destination.clientId : undefined,
        companyId: destination.kind === "company" ? destination.companyId : undefined,
      };
    }
  }

  const slug = brandHint || req.cookies.get("aqua_public_brand")?.value || "";
  const byBrand = slug ? getAgencyBySlug(slug) : null;
  if (byBrand) return { agencyId: byBrand.id };

  const founder = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
  if (founder) return { agencyId: founder.id };

  return agencies.length === 1 && agencies[0] ? { agencyId: agencies[0].id } : null;
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
  const brandHint = field(form, "brand", 60);
  // NOTE: `password` is deliberately never read. A lead form has no business
  // holding one, and the current block does not render the input at all.

  if (!name || !PLAUSIBLE_EMAIL.test(email)) {
    return leadOutcome(req, false, LEAD_FIELDS_ERROR);
  }

  // No `getUser(email)` check on this path — on purpose. Telling an anonymous
  // visitor "an account already exists for that email" is an account-existence
  // oracle, and a lead capture has no reason to ask. Every response below is
  // the same regardless of whether the address has an account.

  const referer = req.headers.get("referer") ?? "";
  const origin = req.headers.get("origin") ?? "";
  let pagePath = "/";
  try {
    if (referer) pagePath = new URL(referer).pathname.slice(0, 300);
  } catch {
    pagePath = "/";
  }
  const host = (() => {
    try { return referer ? new URL(referer).host : new URL(origin || req.nextUrl.origin).host; }
    catch { return req.nextUrl.host; }
  })();

  try {
    // Best-effort: the founder fallback below needs the founder agency to
    // exist. This is a no-op when it already does (or when FOUNDER_PASSWORD is
    // unset), and must never take the visitor's submission down with it.
    await seedFounder().catch(() => {});
    ensureLeadsPipelineFoundationRegistered();

    const owner = resolveLeadOwner(req, brandHint, host);
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
        source: `website:${normalizeHost(host) || "signup"}`,
        tags: ["website-enquiry", "website-signup"],
        notes: message || undefined,
        customFields: {
          capturedBy: "signup-form-block",
          pagePath,
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
  await ensureHydrated();
  if (isFormPost(req)) return handleWebsiteLead(req);
  return handleAccountSignup(req);
}

// ─── Product signup (JSON) — unchanged ───────────────────────────────────
//
// Flow:
//   1. IP rate-limit (5/min) — slows scripted signup floods.
//   2. Validate email + password (≥8) + companyName.
//   3. `getUser(email)` collision → 409 (existing account → redirect to /login).
//   4. `bootstrapAgency` (creates Agency + auto-installs core plugins —
//      kanban / sops / agency-hr / fulfillment seed defaults via their
//      onInstall hooks).
//   5. `createUser(role:"agency-owner")`.
//   6. Sign verification token (HMAC, 24h TTL); dev-mode includes the
//      verify URL in the response body and console-logs it. Production
//      response just hands back the auto-login session cookie.
//   7. `issueSession` → `lk_session_v1` cookie set on response → user is
//      auto-logged-in. Client-side form redirects to /portal/agency.

async function handleAccountSignup(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `signup:${ip}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many signup attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!companyName) {
    return NextResponse.json({ ok: false, error: "Company name is required." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Email collision check — we hit the plain-email key (agency/client tier).
  // End-customer emails are scoped per-client so we don't need to scan
  // every client tier here; an agency-owner with a colliding plain-email
  // entry blocks signup.
  if (getUser(email)) {
    return NextResponse.json(
      { ok: false, error: "An account already exists for that email. Try signing in." },
      { status: 409 },
    );
  }

  const provisional = `usr_pending_${Date.now()}`;
  const { agency } = await bootstrapAgency(
    { name: companyName, ownerEmail: email },
    provisional,
  );

  const user = createUser({
    email,
    password,
    role: "agency-owner",
    agencyId: agency.id,
    name: email.split("@")[0] ?? companyName,
  });

  // HMAC-signed verification token (24h TTL).
  const { token } = signVerifyEmailToken({ userId: user.id, email: user.email });
  const origin = req.nextUrl.origin;
  const verifyUrl = `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const verification = await sendTransactionalEmail({
    to: user.email,
    agencyId: agency.id,
    externalRef: `verify-email:${user.id}`,
    signal: req.signal,
    subject: "Verify your AquaCRM account",
    bodyText: `Confirm your Milesymedia email address using this secure link. It expires in 24 hours.\n\n${verifyUrl}`,
    bodyHtml: `<p>Confirm your Milesymedia email address using the secure link below. It expires in 24 hours.</p><p><a href="${verifyUrl}">Verify email address</a></p>`,
  });
  if (!verification.delivered && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[signup] verify-email URL for ${user.email}: ${verifyUrl}`);
  }

  logActivity({
    agencyId: agency.id,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: "agency.signup",
    message: `Signup: created agency "${agency.name}" and owner ${user.email}.`,
  });

  // Auto-login (Goal B).
  const sessionToken = issueSession({
    userId: user.id, email: user.email, role: user.role, agencyId: user.agencyId,
    sessionRev: user.sessionRev ?? 0,
  });
  const cookie = sessionCookie(sessionToken);
  const isDev = process.env.NODE_ENV !== "production";
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, agencyId: user.agencyId },
    redirect: resolvePostLoginPath(null, user),
    ...(isDev ? { devVerifyUrl: verifyUrl } : {}),
  });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
