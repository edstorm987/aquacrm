#!/usr/bin/env node
// T4 R2 Phase D — performance smoke (lightweight, fetch-based).
//
// Real Lighthouse needs a headless browser + Chromium install which is
// out of scope for a polish round. This harness is the practical 80%:
// for each representative page, time a fetch() round-trip and assert
// (a) HTML response time < 2.5s, (b) raw HTML payload < 300KB, (c)
// status is 2xx/3xx. The 2.5s budget is our local-dev FCP-equivalent
// target — server-rendered HTML is the dominant blocking resource for
// First Contentful Paint, so a 2.5s response cap is a usable proxy.
//
// Usage:
//   node scripts/smoke-perf.mjs                        # default base http://localhost:3030
//   AQUA_BASE=https://my-deploy node scripts/smoke-perf.mjs
//   AQUA_BUDGET_MS=2500 AQUA_BUDGET_KB=300 node scripts/smoke-perf.mjs
//
// Requires the dev server (or a build) running at AQUA_BASE.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env.local");
} catch {
  // Deployed runs provide credentials through the environment.
}

const BASE = process.env.AQUA_BASE || "http://localhost:3030";
const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || "edwardhallam07@gmail.com";
const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD || "";
const BUDGET_MS = Number(process.env.AQUA_BUDGET_MS || 2500);
const BUDGET_KB = Number(process.env.AQUA_BUDGET_KB || 300);
const JAR = join(tmpdir(), `aqua-perf-smoke-${process.pid}.json`);

const failures = [];
let total = 0;

function record(label, ok, detail = "") {
  total += 1;
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(`${label}${detail ? ` (${detail})` : ""}`);
}

async function loadCookies() {
  try { return JSON.parse(await readFile(JAR, "utf8")); }
  catch { return {}; }
}
async function saveCookies(jar) {
  await mkdir(dirname(JAR), { recursive: true }).catch(() => {});
  await writeFile(JAR, JSON.stringify(jar));
}
function mergeSetCookie(jar, headers) {
  const setHeaders = headers.getSetCookie ? headers.getSetCookie() : (() => {
    const all = [];
    for (const [k, v] of headers.entries()) if (k.toLowerCase() === "set-cookie") all.push(v);
    return all;
  })();
  for (const raw of setHeaders) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (raw.toLowerCase().includes("max-age=0")) delete jar[name];
    else jar[name] = value;
  }
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function timed(path, jar, opts = {}) {
  const url = `${BASE}${path}`;
  const start = performance.now();
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      cookie: cookieHeader(jar),
      accept: opts.accept ?? "text/html",
      ...(opts.headers ?? {}),
    },
    body: opts.body,
    redirect: "follow",
  });
  const text = await res.text();
  const elapsed = performance.now() - start;
  mergeSetCookie(jar, res.headers);
  return {
    status: res.status,
    elapsed,
    bytes: text.length,
    contentType: res.headers.get("content-type") ?? "",
  };
}

const PAGES = [
  { path: "/", label: "Landing", needsAuth: false, budgetKb: 80 },
  { path: "/login", label: "Login", needsAuth: false, budgetKb: 110 },
  { path: "/portal/agency", label: "Agency home", needsAuth: true, budgetKb: 260 },
  { path: "/portal/clients", label: "Clients list", needsAuth: true, budgetKb: 180 },
  { path: "/portal/agency/leads-pipeline/contacts", label: "Sales contacts", needsAuth: true, budgetKb: 220 },
  { path: "/portal/agency/pipelines/fulfilment", label: "Project pipeline", needsAuth: true, budgetKb: 220 },
  { path: "/portal/agency/activity-inbox", label: "Inbox", needsAuth: true, budgetKb: 200 },
  { path: "/portal/agency/agency-finance", label: "Finance page", needsAuth: true, budgetKb: 200 },
  { path: "/portal/agency/sops", label: "Systems / SOPs", needsAuth: true, budgetKb: 200 },
  { path: "/portal/agency/settings", label: "Agency settings", needsAuth: true, budgetKb: 200 },
  { path: "/portal/account", label: "Account profile", needsAuth: true, budgetKb: 160 },
];

async function main() {
  console.log(`\n=== T4 R2 perf smoke @ ${BASE} ===`);
  console.log(`    budget: ${BUDGET_MS}ms response time, per-page KB budget below\n`);

  const jar = await loadCookies();

  const login = await timed("/api/auth/login", jar, {
    method: "POST",
    accept: "application/json",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD }),
  });
  record(`founder login`, login.status === 200, `${login.status} · ${login.elapsed.toFixed(0)}ms`);
  await saveCookies(jar);

  let totalBytes = 0;
  let totalElapsed = 0;

  for (const page of PAGES) {
    const r = await timed(page.path, jar);
    const kb = r.bytes / 1024;
    const okStatus = r.status === 200 || (r.status === 307 && !page.needsAuth);
    const okTime = r.elapsed <= BUDGET_MS;
    const okSize = kb <= (page.budgetKb ?? BUDGET_KB);
    totalBytes += r.bytes;
    totalElapsed += r.elapsed;

    record(
      `${page.label} (${page.path}) status`,
      okStatus,
      `status ${r.status}`,
    );
    record(
      `${page.label} response time ≤ ${BUDGET_MS}ms`,
      okTime,
      `${r.elapsed.toFixed(0)}ms`,
    );
    record(
      `${page.label} HTML size ≤ ${page.budgetKb ?? BUDGET_KB}KB`,
      okSize,
      `${kb.toFixed(1)}KB`,
    );
  }

  console.log(`\n  totals: ${(totalBytes / 1024).toFixed(1)}KB across ${PAGES.length} pages, ${totalElapsed.toFixed(0)}ms cumulative`);
  console.log(`\nResults: ${total - failures.length}/${total} passed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("✓ all green\n");
}

main().catch(err => {
  console.error("perf smoke crashed:", err);
  process.exit(2);
});
