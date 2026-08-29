// Every unauthenticated WRITE on the public surface must be rate limited.
//
// Phase D, 2026-08-27. `/api/public/*` is the part of the app a stranger can
// reach with no credential at all, so it is the part where "somebody can call
// this as fast as their connection allows" actually means something.
//
// The review found the enquiry endpoints — contact, careers, brand-enquiry,
// form-capture — all limited, and two that were not:
//
//   * `proposals/[token]`, the only unauthenticated write with no limit of any
//     kind, and the one that SIGNS A COMMERCIAL AGREEMENT.
//   * `health-check/complete`, which can finish by calling `sessionCookie(...)`
//     — an anonymous endpoint that signs somebody in.
//
// Both now have one. This test is what stops the next one shipping without.
//
// ── What it deliberately does NOT assert ─────────────────────────────────
//
// Not the numbers. A limit that is too tight is its own outage, and the right
// value depends on the funnel, not on a test. It asserts only that a limit
// EXISTS and is keyed per-caller, because the failure mode being guarded is a
// route that forgot entirely — which is what actually happened twice.
//
// GET routes are out of scope on purpose: `aqua-tag-config` and
// `business-os/context` are reads that serve configuration, and limiting them
// is a caching and abuse question rather than a correctness one. Recorded in
// the launch document instead of asserted here, because pretending a read is
// the same risk as a signature would make this test dishonest.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC_API = path.join(ROOT, "src/app/api/public");

/** Every `route.ts` under `src/app/api/public`. */
function publicRoutes(): Array<{ rel: string; src: string }> {
  const out: Array<{ rel: string; src: string }> = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === "route.ts") out.push({ rel: path.relative(ROOT, p), src: readFileSync(p, "utf8") });
    }
  })(PUBLIC_API);
  return out;
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("every unauthenticated write under /api/public is rate limited", () => {
  assert.ok(existsSync(PUBLIC_API), "the public API directory must exist");
  const routes = publicRoutes();
  assert.ok(routes.length >= 6, `expected the public surface to be found, got ${routes.length} routes`);

  const unlimited: string[] = [];
  for (const { rel, src } of routes) {
    const code = stripComments(src);
    // Only routes that MUTATE. A GET is a different risk and is excluded above.
    const writes = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(code);
    if (!writes) continue;
    // Comments stripped first, so a route cannot pass by merely DISCUSSING
    // rate limiting in a header — the trap that has caught assertions in this
    // repo before.
    if (!/rateLimit\s*\(/.test(code)) unlimited.push(rel);
  }

  assert.deepEqual(
    unlimited, [],
    `unauthenticated write routes with no rate limit — a stranger can call these as fast as they like:\n  ${unlimited.join("\n  ")}`,
  );
});

test("the rate limit is keyed per caller, not globally", () => {
  // A single global counter is worse than none: one abusive caller locks
  // everybody else out, turning a protection into a denial of service. Every
  // limited public route keys on the caller's IP.
  const offenders: string[] = [];
  for (const { rel, src } of publicRoutes()) {
    const code = stripComments(src);
    if (!/rateLimit\s*\(/.test(code)) continue;
    if (!/clientIpFromHeaders\s*\(/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(
    offenders, [],
    `these rate limits are not keyed per caller, so one abuser would lock out everyone:\n  ${offenders.join("\n  ")}`,
  );
});

test("the two routes the review found are specifically covered", () => {
  // Named because they are the consequential ones: one signs a commercial
  // agreement, the other signs somebody in. If either loses its limit, the
  // generic sweep above would catch it — this says WHY it matters.
  const accept = readFileSync(path.join(ROOT, "src/app/api/public/proposals/[token]/route.ts"), "utf8");
  const health = readFileSync(path.join(ROOT, "src/app/api/public/health-check/complete/route.ts"), "utf8");

  assert.match(stripComments(accept), /rateLimit\(\{[\s\S]*?proposal-accept/, "accepting a proposal must be rate limited");
  assert.match(stripComments(health), /rateLimit\(\{[\s\S]*?health-check-complete/, "the session-minting funnel completion must be rate limited");
  assert.match(stripComments(health), /sessionCookie\(/, "this test exists because that route mints a session — if it no longer does, revisit the reasoning");
});
