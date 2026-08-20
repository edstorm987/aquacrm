// P2 smoke — published-site Login block: native form POST into the
// JSON-only sign-in route (issues.md #14).
//
// Behavioural: drives the REAL exported POST handler of
// `/api/auth/login` in-process with `NextRequest` (no dev server), per the
// runtime-verify convention. A stub Supabase HTTP server stands in for
// `signInWithPassword` so the success path can be exercised end-to-end
// without touching the live project.
//
// What is proven here:
//   1. a form-encoded POST 303-redirects (it used to be a 400 JSON blob);
//   2. the JSON contract every portal fetch caller depends on is byte-for-byte
//      unchanged — same status, same keys, same values;
//   3. a failed form login comes back to the SAME-ORIGIN referring page,
//      never to an attacker-supplied origin and never to the portal /login
//      when the visitor came from a client site;
//   4. nothing about the attempt (email, password, error text) is ever put in
//      the redirect URL;
//   5. the rate limiter still counts form posts — the content-type branch is
//      after the limiter, not around it.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";

import { POST } from "../src/app/api/auth/login/route";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ORIGIN = "http://localhost:3030";
const LOGIN_URL = `${ORIGIN}/api/auth/login`;
const ERROR_COOKIE = "aqua_login_error";

// ─── request builders ─────────────────────────────────────────────────────

interface Opts {
  ip: string;
  referer?: string;
}

function formRequest(fields: Record<string, string>, opts: Opts): NextRequest {
  const body = new URLSearchParams(fields).toString();
  const headers: Record<string, string> = {
    // exactly what a browser sends for <form method="POST">
    "content-type": "application/x-www-form-urlencoded",
    "x-forwarded-for": opts.ip,
  };
  if (opts.referer) headers.referer = opts.referer;
  return new NextRequest(LOGIN_URL, { method: "POST", headers, body });
}

function jsonRequest(body: unknown, opts: Opts): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": opts.ip,
  };
  if (opts.referer) headers.referer = opts.referer;
  return new NextRequest(LOGIN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

function cookieValue(res: Response, name: string): string | undefined {
  const hit = setCookies(res).find((c) => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  const raw = hit.slice(name.length + 1).split(";")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// ─── stub Supabase ────────────────────────────────────────────────────────
// Only the two endpoints the login route touches: the password grant and the
// `profiles` row lookup.

const SB_USER_ID = "sb_user_form_encoding";
let sbServer: Server | undefined;
let sbCalls: string[] = [];

async function startStubSupabase(): Promise<string> {
  sbServer = createServer((req, res) => {
    sbCalls.push(`${req.method} ${req.url?.split("?")[0]}`);
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = req.url ?? "";
      if (url.startsWith("/auth/v1/token")) {
        const body = Buffer.concat(chunks).toString("utf8");
        let password = "";
        try {
          password = (JSON.parse(body) as { password?: string }).password ?? "";
        } catch {
          password = "";
        }
        if (password !== GOOD_PASSWORD) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
          );
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "stub-access-token",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: "stub-refresh-token",
            user: {
              id: SB_USER_ID,
              aud: "authenticated",
              role: "authenticated",
              email: MEMBER_EMAIL,
              app_metadata: {},
              user_metadata: {},
              created_at: new Date(0).toISOString(),
            },
          }),
        );
        return;
      }
      if (url.startsWith("/rest/v1/profiles")) {
        // maybeSingle() over an empty result — the route treats a missing
        // profile as "no Supabase-side role", which is the ordinary case for
        // a portal-provisioned user.
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => sbServer!.listen(0, "127.0.0.1", resolve));
  const address = sbServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

// ─── fixture ──────────────────────────────────────────────────────────────

const MEMBER_EMAIL = "form.login@p2-smoke.test";
const GOOD_PASSWORD = "Sup3rSecret!pw";
let savedEnv: Record<string, string | undefined> = {};
let supabaseReachable = false;

before(async () => {
  savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    node: process.env.NODE_ENV,
  };
  const base = await startStubSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = base;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

  await ensureHydrated();
  const agency = createAgency({ name: "P2 Form Encoding Co", ownerEmail: "owner@p2-smoke.test" });
  createUser({
    email: MEMBER_EMAIL,
    password: GOOD_PASSWORD,
    name: "Form Login",
    role: "agency-owner",
    agencyId: agency.id,
  });

  // Confirm the stub is actually being reached before relying on it.
  const probe = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: MEMBER_EMAIL, password: GOOD_PASSWORD }),
  });
  supabaseReachable = probe.ok;
});

after(() => {
  if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.key;
  sbServer?.close();
});

// ─── the bug itself ───────────────────────────────────────────────────────

describe("Login block form POST — encoding (issues.md #14)", () => {
  it("a form-encoded POST to /api/auth/login returns 303 with a Location header, not 400 JSON", async () => {
    const res = await POST(
      formRequest(
        { email: MEMBER_EMAIL, password: "definitely-wrong" },
        { ip: "10.0.0.1", referer: `${ORIGIN}/sites/acme/login` },
      ),
    );
    assert.equal(res.status, 303, "browser form post must redirect, never render JSON");
    assert.ok(res.headers.get("location"), "a 303 without Location strands the visitor");
    assert.notEqual(
      res.headers.get("content-type"),
      "application/json",
      "the visitor must not be navigated onto a JSON blob",
    );
    const body = await res.text();
    assert.ok(!body.includes('"ok":false'), `expected no JSON error body, got: ${body.slice(0, 120)}`);
  });

  it("multipart/form-data is treated as a browser post too", async () => {
    const form = new FormData();
    form.set("email", MEMBER_EMAIL);
    form.set("password", "definitely-wrong");
    const res = await POST(
      new NextRequest(LOGIN_URL, {
        method: "POST",
        headers: { "x-forwarded-for": "10.0.0.2", referer: `${ORIGIN}/sites/acme/login` },
        body: form,
      }),
    );
    assert.equal(res.status, 303);
  });

  it("a form post carrying no credentials at all redirects instead of 400-ing", async () => {
    const res = await POST(formRequest({}, { ip: "10.0.0.3", referer: `${ORIGIN}/sites/acme/login` }));
    assert.equal(res.status, 303);
    assert.equal(
      cookieValue(res, ERROR_COOKIE),
      "Username/email and password are required.",
      "the visitor should be told what went wrong",
    );
  });
});

// ─── the JSON contract that must not move ─────────────────────────────────

describe("Login JSON contract — unchanged for every fetch caller", () => {
  it("a JSON POST with bad credentials still returns the exact 401 body", async () => {
    const res = await POST(
      jsonRequest({ email: MEMBER_EMAIL, password: "definitely-wrong" }, { ip: "10.0.1.1" }),
    );
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("content-type")?.includes("application/json"), true);
    assert.deepEqual(await res.json(), {
      ok: false,
      error: "Email or password is incorrect.",
    });
  });

  it("a JSON POST with missing fields still returns the exact 400 body", async () => {
    const res = await POST(jsonRequest({ email: "" }, { ip: "10.0.1.2" }));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      ok: false,
      error: "Username/email and password are required.",
    });
  });

  it("an unparseable JSON body still returns the exact 400 'Invalid request.' body", async () => {
    const res = await POST(
      new NextRequest(LOGIN_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.1.3" },
        body: "{not json",
      }),
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: "Invalid request." });
  });

  it("a JSON POST that succeeds still returns { ok, user, redirect, mustChangePassword } + session cookie", async () => {
    assert.equal(supabaseReachable, true, "stub Supabase must be reachable for this test to mean anything");
    const res = await POST(
      jsonRequest({ email: MEMBER_EMAIL, password: GOOD_PASSWORD }, { ip: "10.0.1.4" }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.deepEqual(
      Object.keys(body).sort(),
      ["mustChangePassword", "ok", "redirect", "user"],
      "the response body keys are the portal-wide contract",
    );
    const user = body.user as Record<string, unknown>;
    // `clientId` is serialised only when set — an agency user has none, so
    // JSON.stringify drops the key. That is today's shape and it must hold.
    assert.deepEqual(Object.keys(user).sort(), ["agencyId", "email", "id", "name", "role"]);
    assert.equal(user.email, MEMBER_EMAIL);
    assert.equal(body.redirect, "/portal/agency");
    assert.ok(
      setCookies(res).some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)),
      "JSON callers still get the session cookie",
    );
  });
});

// ─── success path through the form branch ─────────────────────────────────

describe("Login block form POST — success", () => {
  it("a successful form-encoded POST 303s to the role-resolved path and carries the session cookie", async () => {
    assert.equal(supabaseReachable, true);
    const res = await POST(
      formRequest(
        { email: MEMBER_EMAIL, password: GOOD_PASSWORD },
        { ip: "10.0.2.1", referer: `${ORIGIN}/sites/acme/login` },
      ),
    );
    assert.equal(res.status, 303);
    const location = res.headers.get("location");
    assert.equal(location, `${ORIGIN}/portal/agency`, "same destination the JSON caller is told to use");
    assert.ok(
      setCookies(res).some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)),
      "a 303 without the session cookie signs nobody in",
    );
    assert.ok(
      setCookies(res).some((c) => c.startsWith("aqua_public_brand=")),
      "the brand cookie the JSON path sets must survive the redirect",
    );
    // A successful sign-in clears any stale failure banner.
    const stale = setCookies(res).find((c) => c.startsWith(`${ERROR_COOKIE}=`));
    assert.ok(stale?.includes("Max-Age=0"), `expected the error cookie to be cleared, got ${stale}`);
  });

  it("the form branch reaches the real Supabase call — it is not a shortcut around the credential check", () => {
    assert.ok(
      sbCalls.some((c) => c === "POST /auth/v1/token"),
      `expected a password-grant call, saw ${JSON.stringify(sbCalls)}`,
    );
  });
});

// ─── open-redirect guard ──────────────────────────────────────────────────

describe("Login block form POST — failure destination", () => {
  it("a failed form login returns to the SAME-ORIGIN referring page, never the portal /login", async () => {
    const referer = `${ORIGIN}/sites/acme/account?tab=signin`;
    const res = await POST(
      formRequest({ email: MEMBER_EMAIL, password: "nope" }, { ip: "10.0.3.1", referer }),
    );
    assert.equal(res.status, 303);
    const location = new URL(res.headers.get("location")!);
    assert.equal(location.origin, ORIGIN);
    assert.equal(location.pathname, "/sites/acme/account");
    assert.equal(location.searchParams.get("tab"), "signin");
    assert.notEqual(location.pathname, "/login", "the visitor must not be bounced onto the portal login");
  });

  it("an off-origin referer is ignored and the safe fallback destination is used", async () => {
    for (const referer of [
      "https://evil.example.com/harvest",
      "http://localhost:9999/other-app",
      "not-a-url",
    ]) {
      const res = await POST(
        formRequest({ email: MEMBER_EMAIL, password: "nope" }, { ip: "10.0.3.2", referer }),
      );
      assert.equal(res.status, 303);
      const location = new URL(res.headers.get("location")!);
      assert.equal(location.origin, ORIGIN, `off-origin referer ${referer} leaked into the redirect`);
      assert.equal(location.pathname, "/login");
    }
  });

  it("no referer at all falls back to the portal login on the request's own origin", async () => {
    const res = await POST(formRequest({ email: MEMBER_EMAIL, password: "nope" }, { ip: "10.0.3.3" }));
    const location = new URL(res.headers.get("location")!);
    assert.equal(location.origin, ORIGIN);
    assert.equal(location.pathname, "/login");
  });

  it("a referer pointing back at an API route is ignored (no redirect loop onto JSON)", async () => {
    const res = await POST(
      formRequest(
        { email: MEMBER_EMAIL, password: "nope" },
        { ip: "10.0.3.4", referer: `${ORIGIN}/api/auth/login` },
      ),
    );
    const location = new URL(res.headers.get("location")!);
    assert.equal(location.pathname, "/login");
  });

  it("neither credentials nor the failure reason are ever put in the redirect URL", async () => {
    const res = await POST(
      formRequest(
        { email: MEMBER_EMAIL, password: "hunter2-secret" },
        { ip: "10.0.3.5", referer: `${ORIGIN}/sites/acme/login` },
      ),
    );
    const location = res.headers.get("location")!;
    assert.ok(!location.includes("hunter2"), "password leaked into the redirect URL");
    assert.ok(!location.toLowerCase().includes("p2-smoke.test"), "email leaked into the redirect URL");
    assert.ok(!location.includes("error"), `error text leaked into the redirect URL: ${location}`);
    // The message rides a short-lived cookie instead.
    const raw = setCookies(res).find((c) => c.startsWith(`${ERROR_COOKIE}=`))!;
    assert.ok(raw.includes("Max-Age=60"), `expected a short-lived cookie, got ${raw}`);
    assert.equal(cookieValue(res, ERROR_COOKIE), "Email or password is incorrect.");
    assert.ok(!raw.includes("hunter2"));
  });
});

// ─── the limiter is in front of the branch, not behind it ─────────────────

describe("Login block form POST — rate limiter untouched", () => {
  it("form posts are counted by the per-IP limiter, and a limited form post still redirects", async () => {
    const ip = "10.0.4.1";
    for (let i = 0; i < 10; i += 1) {
      const res = await POST(formRequest({ email: `burst${i}@p2-smoke.test`, password: "x" }, { ip }));
      assert.equal(res.status, 303, `attempt ${i + 1} should still be a redirect`);
    }
    // 11th within the window: still a redirect for the browser…
    const limited = await POST(
      formRequest({ email: "burst10@p2-smoke.test", password: "x" }, { ip, referer: `${ORIGIN}/sites/acme/login` }),
    );
    assert.equal(limited.status, 303);
    assert.equal(
      cookieValue(limited, ERROR_COOKIE),
      "Too many sign-in attempts. Try again shortly.",
      "the limiter's own message must reach the visitor",
    );
    // …and the same IP arriving as a JSON caller is genuinely rate-limited,
    // which proves the form posts were counted rather than bypassing it.
    const asJson = await POST(jsonRequest({ email: "x@y.z", password: "x" }, { ip }));
    assert.equal(asJson.status, 429);
    assert.ok(asJson.headers.get("retry-after"));
  });

  it("form posts do not double-charge the limiter (one attempt = one count)", async () => {
    const ip = "10.0.4.2";
    for (let i = 0; i < 5; i += 1) {
      await POST(formRequest({ email: `pace${i}@p2-smoke.test`, password: "x" }, { ip }));
    }
    // 5 form posts consumed 5 of 10; a JSON caller must still get through.
    const res = await POST(jsonRequest({ email: "", password: "" }, { ip }));
    assert.equal(res.status, 400, "6th attempt should still be allowed, not 429");
  });
});

// ─── the block that produces these posts ──────────────────────────────────

describe("LoginFormBlock — the surface that sends the form post", () => {
  const BLOCK = join(
    ROOT,
    "src/built-ins/modules/website-editor/src/components/blocks/LoginFormBlock.tsx",
  );

  it("still submits natively (no JS) to /api/auth/login", () => {
    const src = readFileSync(BLOCK, "utf8");
    assert.ok(src.includes('<form action={action} method="POST"'));
    assert.ok(src.includes('?? "/api/auth/login"'));
    assert.ok(!src.includes("onSubmit"), "the block must keep working without JS");
  });

  it("renders the failure message from the cookie, and reads it once", () => {
    const src = readFileSync(BLOCK, "utf8");
    assert.ok(src.includes("aqua_login_error"));
    assert.ok(src.includes('role="alert"'));
    // Strict Mode double-invoke guard: bail before overwriting state when the
    // cookie has already been consumed.
    assert.match(src, /const message = readLoginErrorCookie\(\);\s*\n\s*if \(!message\) return;/);
  });

  it("the fields it renders are exactly the fields the login route reads", () => {
    const src = readFileSync(BLOCK, "utf8");
    for (const field of ['name="email"', 'name="password"']) {
      assert.ok(src.includes(field), `login block should post ${field}`);
    }
  });
});
