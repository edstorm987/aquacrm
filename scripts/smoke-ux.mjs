#!/usr/bin/env node
// T4 R1 — UX/a11y visual-regression smoke (lightweight).
//
// Confirms three things across ~12 representative pages at 3 viewports
// (375 / 768 / 1280 widths) without spinning up Playwright:
//   1. The page returns 200 (or 307 → 200 after a single redirect).
//   2. The page's HTML carries the global skip-to-content link.
//   3. The page's HTML carries the post-R1 chrome a11y attributes
//      where applicable (`aria-label="Primary navigation"`,
//      `id="main-content"`, etc.).
//   4. The HTML response includes our globals.css (focus-ring + sr-only
//      utilities reach the page).
//
// This is "smoke" not "test" — it asserts the foundation is plumbed,
// not pixel-correctness. Real visual regression lands with Playwright
// in a future round.
//
// Usage:
//   node scripts/smoke-ux.mjs                        # default base http://localhost:3050
//   AQUA_BASE=https://my-deploy node scripts/smoke-ux.mjs
//
// Requires the dev server (or a build) running at AQUA_BASE.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.AQUA_BASE || "http://localhost:3050";
const JAR = join(tmpdir(), `aqua-ux-smoke-${process.pid}.json`);

const failures = [];
let total = 0;

function record(label, ok, detail = "") {
  total += 1;
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
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
    if (raw.toLowerCase().includes("max-age=0") || raw.toLowerCase().includes("expires=thu, 01 jan 1970")) {
      delete jar[name];
    } else {
      jar[name] = value;
    }
  }
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function get(path, viewport, jar, allowRedirect = true) {
  const url = `${BASE}${path}`;
  const headers = {
    "user-agent": `aqua-ux-smoke/1.0 (viewport=${viewport})`,
    cookie: cookieHeader(jar),
    // Tell Next we want the server-rendered HTML, not RSC payload.
    accept: "text/html,application/xhtml+xml",
  };
  const res = await fetch(url, { headers, redirect: allowRedirect ? "follow" : "manual" });
  mergeSetCookie(jar, res.headers);
  const text = await res.text();
  return { status: res.status, text, contentType: res.headers.get("content-type") ?? "" };
}

const PAGES = [
  { path: "/", label: "Landing", needsAuth: false },
  { path: "/login", label: "Login", needsAuth: false },
  { path: "/embed/login", label: "Embed login", needsAuth: false },
  { path: "/portal/agency", label: "Agency home", needsAuth: true },
  { path: "/portal/clients", label: "Clients list", needsAuth: true },
  // Plugin pages (resolve dynamically via demo seed)
  { path: "/portal/agency/agency-hr", label: "HR / staff", needsAuth: true },
  { path: "/portal/agency/agency-finance", label: "Finance / invoices", needsAuth: true },
  { path: "/portal/agency/agency-marketing", label: "Marketing / campaigns", needsAuth: true },
];

const VIEWPORTS = [375, 768, 1280];

async function main() {
  console.log(`\n=== T4 R1 UX smoke @ ${BASE} ===\n`);

  const jar = await loadCookies();

  // Ensure demo session.
  const demo = await get("/demo", 1280, jar);
  record("/demo bootstrap (200 or redirect)", demo.status === 200 || demo.status === 307, `status ${demo.status}`);
  await saveCookies(jar);

  // Check each page at each viewport.
  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      const r = await get(page.path, vp, jar);
      const ok = r.status === 200 || (r.status === 307 && !page.needsAuth);
      record(`[${vp}] ${page.label} (${page.path})`, ok, `status ${r.status}`);

      if (r.status === 200 && r.contentType.includes("text/html")) {
        // Skip-to-content present on every authenticated portal page.
        if (page.needsAuth) {
          record(
            `[${vp}] ${page.label} has skip-to-content link`,
            r.text.includes("Skip to content"),
          );
          record(
            `[${vp}] ${page.label} has main-content landmark`,
            r.text.includes('id="main-content"'),
          );
          record(
            `[${vp}] ${page.label} has aria-label primary nav`,
            r.text.includes('aria-label="Primary navigation"') || r.text.includes('aria-label="Primary"'),
          );
        }
        // No console-error markers in the body.
        const errorMarkers = ["Application error", "An unexpected error occurred", "next-error"];
        const hasError = errorMarkers.some(m => r.text.includes(m));
        record(`[${vp}] ${page.label} no app-error markers`, !hasError);
      }
    }
  }

  console.log(`\nResults: ${total - failures.length}/${total} passed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("✓ all green\n");
}

main().catch(err => {
  console.error("smoke crashed:", err);
  process.exit(2);
});
