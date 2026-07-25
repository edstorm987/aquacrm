#!/usr/bin/env node
/**
 * post-deploy-smoke.mjs
 *
 * Production-readiness smoke for the standalone Milesymedia Portal Vercel app.
 * It intentionally avoids the old public website/demo routes. The public
 * Milesymedia website is hosted separately; this app owns login + portal.
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
    "/dev/pov",
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
    const shapeOk = parsed !== null && Object.prototype.hasOwnProperty.call(parsed, "user");
    record("GET", "/api/auth/me (unauthed)", status, shapeOk, shapeOk ? "" : "missing user key");
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
      const setCookie = res.headers.get("set-cookie") || "";
      const m = setCookie.match(/lk_session_v1=[^;]+/);
      sessionCookie = m ? m[0] : "";
      record(
        "POST",
        "/api/auth/login (founder)",
        res.status,
        res.status === 200 && Boolean(sessionCookie),
        sessionCookie ? "session set" : "no session cookie",
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
      "/portal/agency/leads-pipeline/contacts",
      "/portal/agency/pipelines/fulfilment",
      "/portal/agency/activity-inbox",
      "/portal/agency/agency-finance",
      "/portal/agency/sops",
      "/portal/agency/settings",
      "/portal/account",
      "/portal/account/preferences",
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
