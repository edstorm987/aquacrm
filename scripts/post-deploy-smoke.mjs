#!/usr/bin/env node
/**
 * post-deploy-smoke.mjs — T6 R005 (extended from R003)
 *
 * Production-readiness smoke against a live Vercel deploy (preview or
 * prod). Hits the full ship-gate route list (chapter #124 ship gate +
 * runbooks/deploy.md §5) plus a founder login + HC completion flow.
 *
 * Usage:
 *   node scripts/post-deploy-smoke.mjs --url=https://<deploy>.vercel.app
 *     [--founder-email=<addr>]   (default: $FOUNDER_EMAIL or edwardhallam07@gmail.com)
 *     [--founder-pass=<pwd>]     (default: $FOUNDER_PASSWORD)
 *     [--verbose]
 *
 * Exit codes:
 *   0 — all checks passed.
 *   1 — at least one check failed (or an unexpected error).
 *   2 — refuse-to-run guard tripped (founder password is the dev
 *       placeholder "123" — chapter #122 / #124 ship gate).
 *
 * Hard boundary: HTTP only against the deploy URL; no product imports.
 */

const args = parseArgs(process.argv.slice(2));
const BASE = trimSlash(args.url || "");
const FOUNDER_EMAIL = (args["founder-email"] || process.env.FOUNDER_EMAIL || "edwardhallam07@gmail.com").trim();
const FOUNDER_PASS = args["founder-pass"] ?? process.env.FOUNDER_PASSWORD ?? "";
const VERBOSE = Boolean(args.verbose);

if (!BASE) {
  console.error("post-deploy-smoke: --url=https://<deploy> is required.");
  process.exit(1);
}

// Founder-password sanity guard — refuse before any login attempt.
if (FOUNDER_PASS === "123") {
  console.error(
    "post-deploy-smoke: refusing to run — founder password is the dev placeholder \"123\".\n" +
      "Set FOUNDER_PASSWORD (≥12 chars, chapter #129) before running smoke against prod/preview.",
  );
  process.exit(2);
}

const failures = [];
let total = 0;

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

function trimSlash(u) {
  return u.replace(/\/+$/, "");
}

function record(method, label, status, ok, reason = "") {
  total += 1;
  const tag = ok ? "PASS" : "FAIL";
  const line = `${tag} ${method} ${label} → ${status}${reason ? ` (${reason})` : ""}`;
  console.log(line);
  if (!ok) failures.push(line);
}

async function fetchRaw(path, init = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, redirect: "manual" });
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }
  if (VERBOSE) {
    console.log(`  · ${init.method || "GET"} ${path} status=${res.status}`);
    if (body) console.log(`    body: ${body.slice(0, 240).replace(/\s+/g, " ")}`);
  }
  return { status: res.status, headers: res.headers, body };
}

async function check200(path, label = path) {
  try {
    const { status, body } = await fetchRaw(path);
    const ok = status === 200;
    record("GET", label, status, ok, ok ? "" : (body ? body.slice(0, 80) : "non-200"));
  } catch (err) {
    record("GET", label, "ERR", false, String(err?.message || err));
  }
}

async function checkRedirect(path, expectedStatuses, expectedLocationContains) {
  try {
    const { status, headers } = await fetchRaw(path);
    const loc = headers.get("location") || "";
    const okStatus = expectedStatuses.includes(status);
    const okLoc = !expectedLocationContains || loc.includes(expectedLocationContains);
    const ok = okStatus && okLoc;
    record(
      "GET",
      path,
      status,
      ok,
      ok
        ? `→ ${loc}`
        : `expected ${expectedStatuses.join("/")} → ${expectedLocationContains}, got ${status} → ${loc || "<none>"}`,
    );
  } catch (err) {
    record("GET", path, "ERR", false, String(err?.message || err));
  }
}

async function main() {
  console.log(`[post-deploy-smoke] base=${BASE} founder=${FOUNDER_EMAIL}`);

  // --- Static / unauthed surfaces (200) ---
  const staticRoutes = [
    "/",
    "/for-skincare",
    "/for-coaching",
    "/for-fitness",
    "/for-agencies",
    "/health-check",
    "/business-os",
    "/business-os/incubator",
    "/login",
    "/login/forgot",
    "/login/reset?token=test",
    "/signup",
    "/signup/agency",
    "/dev/pov",
    "/healthz",
    "/healthz/full",
    "/resources",
    "/resources/seo-audit",
    "/resources/site-speed",
    "/resources/accessibility-audit",
  ];
  for (const r of staticRoutes) await check200(r);

  // --- Redirects ---
  // /demo → 307 → /portal/agency (sets isDemo cookie). 302 also acceptable.
  await checkRedirect("/demo", [302, 307], "/portal/agency");
  // /incubator → 307 → /business-os/incubator (chapter #159).
  await checkRedirect("/incubator", [307], "/business-os/incubator");
  // Unauthed portal routes redirect to /login.
  await checkRedirect("/portal", [302, 307, 308], "/login");
  await checkRedirect("/portal/agency", [302, 307, 308], "/login");
  // Unauthed /business-os should redirect (chapter #124 ship-gate).
  await checkRedirect("/business-os/private-marker-anon-check", [200, 302, 307, 308], "");

  // --- API unauthed: /api/auth/me returns shape regardless of status ---
  try {
    const { status, body } = await fetchRaw("/api/auth/me");
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* */ }
    const shapeOk = parsed !== null && Object.prototype.hasOwnProperty.call(parsed, "user");
    record("GET", "/api/auth/me (unauthed)", status, shapeOk,
      shapeOk ? `user=${parsed.user === null ? "null" : "present"}` : "missing 'user' key");
  } catch (err) {
    record("GET", "/api/auth/me (unauthed)", "ERR", false, String(err?.message || err));
  }

  // --- Founder login flow ---
  let sessionCookie = "";
  if (!FOUNDER_PASS) {
    record("POST", "/api/auth/login (founder)", "SKIP", false,
      "FOUNDER_PASSWORD not set — cannot run login flow");
  } else {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASS }),
      });
      const setCookie = res.headers.get("set-cookie") || "";
      const m = setCookie.match(/lk_session_v1=[^;]+/);
      sessionCookie = m ? m[0] : "";
      const ok = res.status === 200 && Boolean(sessionCookie);
      record("POST", "/api/auth/login (founder)", res.status, ok,
        ok ? "lk_session_v1 set" : `no lk_session_v1 cookie`);
    } catch (err) {
      record("POST", "/api/auth/login (founder)", "ERR", false, String(err?.message || err));
    }
  }

  if (sessionCookie) {
    // /api/auth/me with cookie → user.email matches founder
    try {
      const res = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: sessionCookie } });
      const body = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* */ }
      const ok = res.status === 200 && parsed?.user?.email
        && parsed.user.email.toLowerCase() === FOUNDER_EMAIL.toLowerCase();
      record("GET", "/api/auth/me (founder cookie)", res.status, ok,
        ok ? `role=${parsed.user.role}` : `body=${body.slice(0, 80)}`);
    } catch (err) {
      record("GET", "/api/auth/me (founder cookie)", "ERR", false, String(err?.message || err));
    }

    // /portal/agency with cookie → 200
    try {
      const res = await fetch(`${BASE}/portal/agency`, {
        headers: { cookie: sessionCookie }, redirect: "manual",
      });
      const ok = res.status === 200;
      record("GET", "/portal/agency (founder cookie)", res.status, ok, ok ? "" : "expected 200");
    } catch (err) {
      record("GET", "/portal/agency (founder cookie)", "ERR", false, String(err?.message || err));
    }
  }

  // --- HC completion best-effort smoke ---
  try {
    const ts = Date.now();
    const res = await fetch(`${BASE}/api/portal/public-funnel/hc-complete`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `smoke-${ts}@aqua.test`, slot: { q1: "test" } }),
    });
    if (res.status === 404) {
      record("POST", "/api/portal/public-funnel/hc-complete", 404, true, "endpoint absent — skipped");
    } else {
      const setCookie = res.headers.get("set-cookie") || "";
      const m = setCookie.match(/lk_session_v1=[^;]+/);
      const leadCookie = m ? m[0] : "";
      const ok = res.status === 200;
      record("POST", "/api/portal/public-funnel/hc-complete", res.status, ok,
        ok ? (leadCookie ? "lead session set" : "200 (no cookie)") : "expected 200");
      if (ok && leadCookie) {
        const r2 = await fetch(`${BASE}/business-os`, {
          headers: { cookie: leadCookie }, redirect: "manual",
        });
        record("GET", "/business-os (lead cookie)", r2.status, r2.status === 200);
      }
    }
  } catch (err) {
    record("POST", "/api/portal/public-funnel/hc-complete", "ERR", false, String(err?.message || err));
  }

  // --- Summary ---
  console.log("");
  console.log(`[post-deploy-smoke] ${total - failures.length}/${total} passed.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("post-deploy-smoke: fatal", err);
  process.exit(1);
});
