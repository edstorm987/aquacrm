#!/usr/bin/env node
/**
 * post-deploy-smoke.mjs
 *
 * Production-readiness smoke for the AquaCRM Vercel app. The root route is
 * the public AquaCRM website; this app also owns the shared login and portal.
 *
 * Usage:
 *   node scripts/post-deploy-smoke.mjs --url=https://<deploy>.vercel.app
 *     [--founder-email=<addr>]   (default: $FOUNDER_EMAIL or edwardhallam07@gmail.com)
 *     [--founder-pass=<pwd>]     (default: $FOUNDER_PASSWORD)
 *     [--verbose]
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

if (FOUNDER_PASS === "123") {
  console.error(
    "post-deploy-smoke: refusing to run because founder password is the dev placeholder.",
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
  const line = `${tag} ${method} ${label} -> ${status}${reason ? ` (${reason})` : ""}`;
  console.log(line);
  if (!ok) failures.push(line);
}

async function fetchRaw(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, redirect: "manual" });
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }
  if (VERBOSE) {
    console.log(`  ${init.method || "GET"} ${path} status=${res.status}`);
    if (body) console.log(`  body: ${body.slice(0, 240).replace(/\s+/g, " ")}`);
  }
  return { status: res.status, headers: res.headers, body };
}

async function check200(path, label = path, cookie = "") {
  try {
    const headers = cookie ? { cookie } : undefined;
    const { status, body } = await fetchRaw(path, { headers });
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
    record(
      "GET",
      path,
      status,
      okStatus && okLoc,
      okStatus && okLoc ? `-> ${loc}` : `expected ${expectedStatuses.join("/")} -> ${expectedLocationContains}, got ${loc || "<none>"}`,
    );
  } catch (err) {
    record("GET", path, "ERR", false, String(err?.message || err));
  }
}

async function main() {
  console.log(`[post-deploy-smoke] base=${BASE} founder=${FOUNDER_EMAIL}`);

  for (const route of [
    "/",
    "/login",
    "/login/forgot",
    "/login/reset?token=test",
    "/healthz",
    "/healthz/full",
  ]) {
    await check200(route);
  }

  await checkRedirect("/portal", [302, 307, 308], "/login");
  await checkRedirect("/portal/agency", [302, 307, 308], "/login");
  await checkRedirect("/portal/clients", [302, 307, 308], "/login");

  try {
    const { status, body } = await fetchRaw("/api/auth/me");
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* ignore */ }
    const shapeOk = status === 401 && parsed?.ok === false && typeof parsed?.error === "string";
    record("GET", "/api/auth/me (unauthed)", status, shapeOk, shapeOk ? "" : "expected a generic 401 response");
  } catch (err) {
    record("GET", "/api/auth/me (unauthed)", "ERR", false, String(err?.message || err));
  }

  let sessionCookie = "";
  if (!FOUNDER_PASS) {
    record("POST", "/api/auth/login (founder)", "SKIP", false, "FOUNDER_PASSWORD not set");
  } else {
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASS }),
      });
      const setCookies = typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") || ""];
      sessionCookie = setCookies
        .map(value => value.split(";", 1)[0])
        .filter(Boolean)
        .join("; ");
      const hasPortalSession = sessionCookie.includes("lk_session_v1=");
      record(
        "POST",
        "/api/auth/login (founder)",
        res.status,
        res.status === 200 && hasPortalSession,
        hasPortalSession ? "portal and identity sessions set" : "no portal session cookie",
      );
    } catch (err) {
      record("POST", "/api/auth/login (founder)", "ERR", false, String(err?.message || err));
    }
  }

  if (sessionCookie) {
    await check200("/api/auth/me", "/api/auth/me (founder cookie)", sessionCookie);
    for (const route of [
      "/portal/agency",
      "/portal/clients",
      "/portal/agency/actions",
      "/portal/agency/inbox",
      "/portal/agency/company",
      "/portal/agency/development",
      "/portal/agency/marketing",
      "/portal/agency/performance",
      "/portal/agency/pipelines/leads",
      "/portal/agency/pipelines/fulfilment",
      "/portal/agency/products",
      "/portal/agency/sop-library",
      "/portal/agency/settings",
      "/portal/account",
      "/portal/account/permissions",
    ]) {
      await check200(route, `${route} (founder cookie)`, sessionCookie);
    }
  }

  console.log("");
  console.log(`[post-deploy-smoke] ${total - failures.length}/${total} passed.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("post-deploy-smoke: fatal", err);
  process.exit(1);
});
