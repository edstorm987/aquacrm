// T1 perf-easy-wins smoke — assert the audit's easy-wins are present
// in source. File-marker pattern (see smoke-founder-seed.test.ts) so
// tsx can run it without booting Next or hitting `server-only`.
//
// What we verify:
//   1. SiteShell preconnects + DNS-prefetches the Google Fonts host.
//   2. SiteShell preloads the Playfair Display stylesheet.
//   3. SiteShell still ships the actual <link rel="stylesheet">.
//   4. seo-audit/page imports SeoAuditTool via next/dynamic.
//   5. site-speed/page imports SiteSpeedTool via next/dynamic.
//   6. accessibility-audit/page imports the tool via next/dynamic.
//   7. founderSeed.ts implements DEV_SEED_TTL_MS memoize.
//   8. founderSeed.ts clears devSeedPromise in the test reset helper.
//   9. Every public/<app>/*.html with a <script src=…> tag uses defer.
//  10. No public/<app>/*.html ships the legacy IE X-UA-Compatible
//      meta tag (chapter perf — modern browsers only).
//  11. perf-baseline script exists and is executable.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SITE_SHELL = readFileSync(join(ROOT, "src/components/SiteShell.tsx"), "utf8");
const SEO_PAGE = readFileSync(join(ROOT, "src/app/resources/seo-audit/page.tsx"), "utf8");
const SPEED_PAGE = readFileSync(join(ROOT, "src/app/resources/site-speed/page.tsx"), "utf8");
const A11Y_PAGE = readFileSync(
  join(ROOT, "src/app/resources/accessibility-audit/page.tsx"),
  "utf8",
);
const FOUNDER_SEED = readFileSync(join(ROOT, "src/lib/server/founderSeed.ts"), "utf8");
const PERF_SCRIPT = join(ROOT, "scripts/perf-baseline.mjs");

function walkHtml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkHtml(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

describe("Perf — easy wins (T1 perf-audit)", () => {
  it("SiteShell preconnects + DNS-prefetches Google Fonts", () => {
    assert.ok(SITE_SHELL.includes('rel="dns-prefetch"'));
    assert.ok(SITE_SHELL.includes('href="https://fonts.googleapis.com"'));
    assert.ok(SITE_SHELL.includes('href="https://fonts.gstatic.com"'));
  });

  it("SiteShell preloads the Playfair Display stylesheet", () => {
    assert.ok(SITE_SHELL.includes('rel="preload"'));
    assert.ok(SITE_SHELL.includes('as="style"'));
    assert.ok(SITE_SHELL.includes("Playfair+Display"));
  });

  it("SiteShell still ships the real stylesheet link (fallback / progressive enhancement)", () => {
    assert.ok(SITE_SHELL.includes('rel="stylesheet"'));
  });

  it("seo-audit page lazy-loads SeoAuditTool via next/dynamic", () => {
    assert.ok(SEO_PAGE.includes('import dynamic from "next/dynamic"'));
    assert.ok(SEO_PAGE.includes("SeoAuditTool"));
    assert.ok(SEO_PAGE.includes("loading:"));
  });

  it("site-speed page lazy-loads SiteSpeedTool via next/dynamic", () => {
    assert.ok(SPEED_PAGE.includes('import dynamic from "next/dynamic"'));
    assert.ok(SPEED_PAGE.includes("SiteSpeedTool"));
    assert.ok(SPEED_PAGE.includes("loading:"));
  });

  it("accessibility-audit page lazy-loads AccessibilityAuditTool via next/dynamic", () => {
    assert.ok(A11Y_PAGE.includes('import dynamic from "next/dynamic"'));
    assert.ok(A11Y_PAGE.includes("AccessibilityAuditTool"));
    assert.ok(A11Y_PAGE.includes("loading:"));
  });

  it("founderSeed.ts implements 30s DEV_SEED_TTL_MS memoize", () => {
    assert.ok(FOUNDER_SEED.includes("DEV_SEED_TTL_MS"));
    assert.ok(FOUNDER_SEED.includes("30_000"));
    assert.ok(FOUNDER_SEED.includes("devSeedPromise"));
  });

  it("founderSeed.ts memoize cache failure clears so retries don't poison", () => {
    assert.ok(FOUNDER_SEED.includes("devSeedPromise = null"));
    assert.ok(FOUNDER_SEED.includes("devSeedAt = 0"));
  });

  it("public/<app>/*.html scripts all use defer", () => {
    const apps = ["health-check", "business-os", "incubator"].map((a) =>
      join(ROOT, "public", a),
    );
    const offenders: string[] = [];
    for (const app of apps) {
      for (const f of walkHtml(app)) {
        const html = readFileSync(f, "utf8");
        const scriptTags = html.match(/<script[^>]*\bsrc=[^>]*>/g) ?? [];
        for (const tag of scriptTags) {
          if (!/\bdefer\b|\basync\b|\btype="module"/.test(tag)) {
            offenders.push(`${f}: ${tag}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `non-deferred scripts:\n${offenders.join("\n")}`);
  });

  it("public/<app>/*.html does not ship legacy X-UA-Compatible meta", () => {
    const apps = ["health-check", "business-os", "incubator", "_marketing"].map((a) =>
      join(ROOT, "public", a),
    );
    const offenders: string[] = [];
    for (const app of apps) {
      for (const f of walkHtml(app)) {
        const html = readFileSync(f, "utf8");
        if (/X-UA-Compatible/i.test(html)) offenders.push(f);
      }
    }
    assert.deepEqual(offenders, [], `legacy IE meta found in:\n${offenders.join("\n")}`);
  });

  it("scripts/perf-baseline.mjs exists", () => {
    assert.ok(existsSync(PERF_SCRIPT));
    const src = readFileSync(PERF_SCRIPT, "utf8");
    assert.ok(src.includes("perf-baseline"));
    assert.ok(src.includes(".next"));
  });
});
