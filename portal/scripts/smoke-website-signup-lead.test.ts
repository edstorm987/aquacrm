// Published-site signup block — the only surface on the board a real visitor
// can hit today.
//
// Behavioural: drives the REAL exported POST handler of `/api/auth/signup`
// in-process with `NextRequest` (no dev server), per the runtime-verify
// convention, against a real in-memory portal store and the real
// `leads-pipeline` services.
//
// The two bugs this pins:
//   1. ENCODING — a native `<form method="POST">` sends form-encoded and
//      full-page-navigates. The route parsed `req.json()` only, threw, and
//      stranded the visitor on `{"ok":false,"error":"Invalid request."}`.
//   2. WHAT IT DID — it called `bootstrapAgency()`, so a stranger filling in a
//      contact form on a client's website created a whole new AGENCY. Ed's
//      decision: the block creates a WEBSITE LEAD. Both halves are asserted,
//      and the "not a new agency" half explicitly.
//
// Also pinned: the JSON product-signup contract is untouched, the rate limiter
// still counts form posts, no password is ever stored, and nothing about the
// submission reaches the redirect URL.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";

import { POST } from "../src/app/api/auth/signup/route";
import { ensureHydrated } from "../src/server/storage";
import { listAgencies } from "../src/server/tenants";
import { bootstrapAgency } from "../src/server/agencyBootstrap";
import { getUser, listUsersForAgency } from "../src/server/users";
import { getInstall } from "../src/server/pluginInstalls";
import { makePluginStorage } from "../src/lib/server/pluginStorage";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";
import type { Lead } from "../src/built-ins/modules/leads-pipeline/src/lib/domain";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ORIGIN = "http://localhost:3030";
const SIGNUP_URL = `${ORIGIN}/api/auth/signup`;
const SITE_PAGE = `${ORIGIN}/sites/acme/get-started`;
const STATUS_COOKIE = "aqua_signup_status";
const MESSAGE_COOKIE = "aqua_signup_message";

// ─── request builders ─────────────────────────────────────────────────────

interface Opts {
  ip: string;
  referer?: string;
}

function formRequest(fields: Record<string, string>, opts: Opts): NextRequest {
  const headers: Record<string, string> = {
    // exactly what a browser sends for <form method="POST">
    "content-type": "application/x-www-form-urlencoded",
    "x-forwarded-for": opts.ip,
  };
  if (opts.referer) headers.referer = opts.referer;
  return new NextRequest(SIGNUP_URL, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields).toString(),
  });
}

function jsonRequest(body: unknown, opts: Opts): NextRequest {
  return new NextRequest(SIGNUP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip },
    body: JSON.stringify(body),
  });
}

function cookieValue(res: Response, name: string): string | undefined {
  const hit = res.headers.getSetCookie().find(c => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  const raw = hit.slice(name.length + 1).split(";")[0] ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// ─── fixture ──────────────────────────────────────────────────────────────
//
// ONE agency exists, standing in for the operator whose published site the
// visitor is on. Every assertion below about "no new agency" is measured
// against this baseline.

let siteAgencyId = "";
let baselineAgencies = 0;
let baselineUsers = 0;

async function listLeads(): Promise<Lead[]> {
  const install = getInstall({ agencyId: siteAgencyId }, "leads-pipeline");
  assert.ok(install?.enabled, "the fixture agency must have leads-pipeline installed");
  const { leads } = containerFor({
    agencyId: siteAgencyId,
    storage: makePluginStorage(install.id) as never,
  });
  return leads.list();
}

async function findLead(email: string): Promise<Lead | undefined> {
  return (await listLeads()).find(lead => lead.email === email.toLowerCase());
}

before(async () => {
  await ensureHydrated();
  ensureLeadsPipelineFoundationRegistered();
  const { agency } = await bootstrapAgency(
    { name: "Acme Signage Co", ownerEmail: "owner@acme-signup.test" },
    "usr_fixture_owner",
  );
  siteAgencyId = agency.id;
  baselineAgencies = listAgencies().length;
  baselineUsers = listUsersForAgency(siteAgencyId).length;
  assert.equal(baselineAgencies, 1, "fixture should be a single-agency portal");
});

// ─── (1) the encoding bug ─────────────────────────────────────────────────

describe("Signup block form POST — encoding", () => {
  it("a form-encoded POST 303-redirects instead of rendering a JSON error blob", async () => {
    const res = await POST(
      formRequest(
        { name: "Dana Visitor", email: "dana@visitor.test" },
        { ip: "20.0.0.1", referer: SITE_PAGE },
      ),
    );
    assert.equal(res.status, 303, "a browser form post must redirect, never render JSON");
    assert.ok(res.headers.get("location"), "a 303 without Location strands the visitor");
    const body = await res.text();
    assert.ok(
      !body.includes('"ok":false'),
      `the visitor must not land on a JSON blob, got: ${body.slice(0, 120)}`,
    );
    assert.ok(!body.includes("Invalid request"), "the old 400 body must be gone");
  });

  it("multipart/form-data is treated as a browser post too", async () => {
    const form = new FormData();
    form.set("name", "Milo Multipart");
    form.set("email", "milo@visitor.test");
    const res = await POST(
      new NextRequest(SIGNUP_URL, {
        method: "POST",
        headers: { "x-forwarded-for": "20.0.0.2", referer: SITE_PAGE },
        body: form,
      }),
    );
    assert.equal(res.status, 303);
    assert.ok(await findLead("milo@visitor.test"), "a multipart post must land as a lead too");
  });

  it("the visitor comes back to the SAME-ORIGIN page they submitted from", async () => {
    const res = await POST(
      formRequest(
        { name: "Rita Referer", email: "rita@visitor.test" },
        { ip: "20.0.0.3", referer: `${SITE_PAGE}?utm=x` },
      ),
    );
    const location = new URL(res.headers.get("location")!);
    assert.equal(location.origin, ORIGIN);
    assert.equal(location.pathname, "/sites/acme/get-started");
    assert.equal(location.searchParams.get("utm"), "x");
  });

  it("an off-origin or API referer is ignored (open-redirect + loop guard)", async () => {
    for (const referer of [
      "https://evil.example.com/harvest",
      "not-a-url",
      `${ORIGIN}/api/auth/signup`,
    ]) {
      const res = await POST(
        formRequest(
          { name: "Guard", email: `guard-${encodeURIComponent(referer).slice(0, 8)}@visitor.test` },
          { ip: "20.0.0.4", referer },
        ),
      );
      const location = new URL(res.headers.get("location")!);
      assert.equal(location.origin, ORIGIN, `referer ${referer} leaked into the redirect`);
      assert.equal(location.pathname, "/");
    }
  });

  it("nothing about the submission is ever put in the redirect URL", async () => {
    const res = await POST(
      formRequest(
        { name: "Percy Private", email: "percy@visitor.test", message: "secret-brief-text" },
        { ip: "20.0.0.5", referer: SITE_PAGE },
      ),
    );
    const location = res.headers.get("location")!;
    assert.ok(!location.includes("percy"), "email leaked into the redirect URL");
    assert.ok(!location.includes("Percy"), "name leaked into the redirect URL");
    assert.ok(!location.includes("secret-brief-text"), "message leaked into the redirect URL");
    // The outcome rides short-lived cookies instead.
    const raw = res.headers.getSetCookie().find(c => c.startsWith(`${STATUS_COOKIE}=`))!;
    assert.ok(raw.includes("Max-Age=60"), `expected a short-lived cookie, got ${raw}`);
    assert.equal(cookieValue(res, STATUS_COOKIE), "ok");
    assert.match(cookieValue(res, MESSAGE_COOKIE) ?? "", /in touch/i);
  });
});

// ─── (2) the product decision: a LEAD, never an agency ────────────────────

describe("Signup block form POST — creates a website LEAD", () => {
  it("a real form-encoded post from a published site creates a lead in leads-pipeline", async () => {
    const before = (await listLeads()).length;
    const res = await POST(
      formRequest(
        {
          name: "Sam Prospect",
          email: "Sam@Prospect.test",
          phone: "+447700900123",
          message: "We need a new site for our clinic.",
        },
        { ip: "20.1.0.1", referer: SITE_PAGE },
      ),
    );
    assert.equal(res.status, 303);
    assert.equal(cookieValue(res, STATUS_COOKIE), "ok");

    const after = await listLeads();
    assert.equal(after.length, before + 1, "exactly one lead should have been created");
    const lead = after.find(l => l.email === "sam@prospect.test");
    assert.ok(lead, "the visitor's lead must exist");
    assert.equal(lead.name, "Sam Prospect");
    assert.equal(lead.phone, "+447700900123");
    assert.equal(lead.notes, "We need a new site for our clinic.");
    assert.ok(lead.source.startsWith("website:"), `expected a website source, got ${lead.source}`);
    assert.ok(lead.tags.includes("website-enquiry"), "must be tagged as a website enquiry");
    assert.ok(lead.tags.includes("website-signup"), "must record which block captured it");
  });

  it("the lead is NOT converted to a client — the operator still does that by hand", async () => {
    const lead = await findLead("sam@prospect.test");
    assert.ok(lead);
    assert.equal(lead.convertedClientId, undefined, "capture must not convert to a client");
    assert.equal(lead.clientId, undefined);
  });

  it("NO NEW AGENCY is created — the whole point of the change", async () => {
    const before = listAgencies().length;
    const res = await POST(
      formRequest(
        {
          // The exact shape the old block posted: the old route read
          // `companyName` + `password` and ran `bootstrapAgency()` on them.
          name: "Trudy Trespass",
          companyName: "Trudy Holdings Ltd",
          email: "trudy@visitor.test",
          password: "hunter2-please-do-not-store",
        },
        { ip: "20.1.0.2", referer: SITE_PAGE },
      ),
    );
    assert.equal(res.status, 303);
    assert.equal(
      listAgencies().length,
      before,
      "a website visitor must never be able to create an agency",
    );
    assert.equal(listAgencies().length, baselineAgencies);
    assert.ok(
      !listAgencies().some(a => a.name === "Trudy Holdings Ltd"),
      "the submitted company name must not become an agency",
    );
    // …and it did land as a lead, so the submission was not merely dropped.
    assert.ok(await findLead("trudy@visitor.test"), "the visitor should still be captured");
  });

  it("no account, no user and no session are created by a form post", async () => {
    assert.equal(
      listUsersForAgency(siteAgencyId).length,
      baselineUsers,
      "a form post must not create a user",
    );
    assert.equal(getUser("trudy@visitor.test"), null, "no account for the earlier visitor either");
    const res = await POST(
      formRequest(
        { name: "Nora NoSession", email: "nora@visitor.test", password: "another-secret-pw" },
        { ip: "20.1.0.3", referer: SITE_PAGE },
      ),
    );
    assert.equal(listUsersForAgency(siteAgencyId).length, baselineUsers);
    assert.equal(getUser("nora@visitor.test"), null, "a lead is not an account");
    assert.ok(
      !res.headers.getSetCookie().some(c => c.startsWith(`${SESSION_COOKIE_NAME}=`)),
      "a lead capture must never hand out a portal session",
    );
  });

  it("a posted password is never stored anywhere on the lead", async () => {
    const lead = await findLead("trudy@visitor.test");
    assert.ok(lead);
    const serialised = JSON.stringify(lead);
    assert.ok(!serialised.includes("hunter2"), `password reached the lead record: ${serialised}`);
  });

  it("a double submit enriches the same lead instead of dealing a second card", async () => {
    const before = (await listLeads()).length;
    await POST(
      formRequest(
        { name: "Sam Prospect", email: "sam@prospect.test" },
        { ip: "20.1.0.4", referer: SITE_PAGE },
      ),
    );
    assert.equal((await listLeads()).length, before, "a resubmit must not duplicate the lead");
  });

  it("the honeypot is answered as success but writes nothing", async () => {
    const before = (await listLeads()).length;
    const res = await POST(
      formRequest(
        { name: "Bot", email: "bot@spam.test", website: "http://spam.example" },
        { ip: "20.1.0.5", referer: SITE_PAGE },
      ),
    );
    assert.equal(res.status, 303);
    assert.equal(cookieValue(res, STATUS_COOKIE), "ok", "the trap must not be discoverable");
    assert.equal((await listLeads()).length, before, "a honeypot hit must create nothing");
  });

  it("a submission missing an email is refused with a message, not a JSON 400", async () => {
    const before = (await listLeads()).length;
    const res = await POST(
      formRequest({ name: "No Email" }, { ip: "20.1.0.6", referer: SITE_PAGE }),
    );
    assert.equal(res.status, 303);
    assert.equal(cookieValue(res, STATUS_COOKIE), "error");
    assert.match(cookieValue(res, MESSAGE_COOKIE) ?? "", /valid email/i);
    assert.equal((await listLeads()).length, before);
  });

  it("the refusal reveals nothing about whether an account exists for that email", async () => {
    // The fixture owner definitely has an account. A visitor typing that
    // address must get exactly the ordinary capture outcome — the JSON path's
    // 409 "An account already exists for that email" is an existence oracle
    // and must not be reachable from a public form.
    const res = await POST(
      formRequest(
        { name: "Someone", email: "owner@acme-signup.test" },
        { ip: "20.1.0.7", referer: SITE_PAGE },
      ),
    );
    assert.equal(res.status, 303);
    assert.equal(cookieValue(res, STATUS_COOKIE), "ok");
    const message = cookieValue(res, MESSAGE_COOKIE) ?? "";
    assert.ok(!/already exists/i.test(message), `account existence leaked: ${message}`);
    assert.ok(!/sign(ing)? in/i.test(message), `account existence leaked: ${message}`);
  });
});

// ─── the JSON product-signup contract must not move ───────────────────────

describe("Signup JSON contract — unchanged for the product signup path", () => {
  it("a JSON POST with missing fields still returns the exact 400 body", async () => {
    const res = await POST(jsonRequest({ email: "x@y.z" }, { ip: "20.2.0.1" }));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: "Company name is required." });
  });

  it("an unparseable JSON body still returns the exact 400 'Invalid JSON.' body", async () => {
    const res = await POST(
      new NextRequest(SIGNUP_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "20.2.0.2" },
        body: "{not json",
      }),
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: "Invalid JSON." });
  });

  it("a JSON POST still bootstraps an agency + owner + session", async () => {
    const before = listAgencies().length;
    const res = await POST(
      jsonRequest(
        { companyName: "Deliberate Product Signup Ltd", email: "founder@deliberate.test", password: "a-long-enough-pw" },
        { ip: "20.2.0.3" },
      ),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal(body.redirect, "/portal/agency");
    assert.equal(listAgencies().length, before + 1, "the product path still creates an agency");
    assert.ok(res.headers.getSetCookie().some(c => c.startsWith(`${SESSION_COOKIE_NAME}=`)));
    // Keep the "no new agency" baseline honest for anything that runs after.
    baselineAgencies = listAgencies().length;
  });
});

// ─── the limiter is in front of the branch, not behind it ─────────────────

describe("Signup block form POST — rate limiter untouched", () => {
  it("form posts are counted by the same per-IP limiter the JSON path uses", async () => {
    const ip = "20.3.0.1";
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(
        formRequest({ name: `Burst ${i}`, email: `burst${i}@visitor.test` }, { ip, referer: SITE_PAGE }),
      );
      assert.equal(res.status, 303, `attempt ${i + 1} should still be a redirect`);
    }
    // 6th within the window: still a redirect for the browser, with the
    // limiter's own message…
    const limited = await POST(
      formRequest({ name: "Burst 5", email: "burst5@visitor.test" }, { ip, referer: SITE_PAGE }),
    );
    assert.equal(limited.status, 303);
    assert.equal(cookieValue(limited, STATUS_COOKIE), "error");
    assert.match(cookieValue(limited, MESSAGE_COOKIE) ?? "", /too many/i);
    assert.equal(await findLead("burst5@visitor.test"), undefined, "a limited post must write nothing");

    // …and the same IP arriving as a JSON caller is genuinely rate-limited,
    // which proves the form posts were counted rather than bypassing it.
    const asJson = await POST(jsonRequest({ companyName: "X", email: "x@y.z", password: "12345678" }, { ip }));
    assert.equal(asJson.status, 429);
    assert.ok(asJson.headers.get("retry-after"));
  });
});

// ─── the block that produces these posts ──────────────────────────────────

describe("SignupFormBlock — the surface that sends the form post", () => {
  const BLOCK = join(
    ROOT,
    "src/built-ins/modules/website-editor/src/components/blocks/SignupFormBlock.tsx",
  );
  const src = readFileSync(BLOCK, "utf8");

  it("still submits natively (no JS) to /api/auth/signup", () => {
    assert.ok(src.includes('<form action={action} method="POST"'));
    assert.ok(src.includes('?? "/api/auth/signup"'));
    assert.ok(!src.includes("onSubmit"), "the block must keep working without JS");
  });

  it("collects no password — there is no account at the end of this form", () => {
    assert.ok(!src.includes('type="password"'), "a lead form must not ask for a password");
    assert.ok(!src.includes('name="password"'));
  });

  it("the fields it renders are the fields the lead branch reads", () => {
    for (const field of ['name="name"', 'name="email"', 'name="phone"', 'name="message"', 'name="website"']) {
      assert.ok(src.includes(field), `signup block should post ${field}`);
    }
  });

  it("renders the outcome from the cookies, and reads them once", () => {
    assert.ok(src.includes("aqua_signup_status"));
    assert.ok(src.includes("aqua_signup_message"));
    assert.ok(src.includes('role="alert"'));
    // Strict Mode double-invoke guard: bail before overwriting state when the
    // cookies have already been consumed.
    assert.match(src, /if \(nextStatus !== "ok" && nextStatus !== "error"\) return;/);
  });
});

// ─── the Q-ASSUMED endpoint the CRM contact block silently relied on ──────

describe("CrmContactFormBlock — the never-built endpoint is gone", () => {
  const BLOCK = join(
    ROOT,
    "src/built-ins/modules/website-editor/src/components/blocks/CrmContactFormBlock.tsx",
  );
  const src = readFileSync(BLOCK, "utf8");

  it("no longer posts to the endpoint that was never built", () => {
    assert.ok(
      !src.includes('fetch("/api/portal/client-crm/public/contact"'),
      "the Q-ASSUMED endpoint must not be called",
    );
  });

  it("posts to a public ingest that actually exists", () => {
    assert.ok(src.includes('const ENDPOINT = "/api/public/contact"'));
    const route = join(ROOT, "src/app/api/public/contact/route.ts");
    const routeSrc = readFileSync(route, "utf8");
    assert.ok(routeSrc.includes("export async function POST"), "the target route must exist");
    assert.match(routeSrc, /leads\.upsert\(/, "and must deposit the enquiry as a lead");
  });

  it("no longer dresses a failed submission up as a success", () => {
    assert.ok(
      !src.includes("res.status === 404"),
      "a 404 must not be treated as a delivered message",
    );
    assert.ok(src.includes("data.ok !== true"), "success must be a confirmed write");
  });
});
