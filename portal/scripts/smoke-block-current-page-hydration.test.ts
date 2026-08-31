// Published "current page" website blocks must not derive their first render
// from `window`. Issues #143.
//
// Share Buttons documents a blank `url` as "the current page" and auto
// Breadcrumb documents a blank `items` as "segment `window.location.pathname`".
// Both used to read `window` DURING RENDER, so the server tree and the FIRST
// client tree disagreed. React 19's hydration runtime does not patch a
// mismatched attribute up, which left the social anchors pointing at the
// server's empty `?url=` target for the life of the page while Copy Link — a
// client handler — used the real URL.
//
// The contract is therefore about the two trees React compares, not about the
// eventual value: server HTML and first client render must be IDENTICAL, and
// neither may carry a broken share target while the URL is still unknown.
//
// ── Why this spawns a child process ──────────────────────────────────────
// The canonical suite runs under `--conditions react-server`, where React
// exports no `useState`/`useEffect` and a `"use client"` block cannot be
// rendered at all. `scripts/website-block-hydration-probe.ts` does the two
// renders in a plain-React process and prints them as JSON.
//
// The blocks' own owner suite,
// `src/built-ins/modules/website-editor/src/__smoke__/r017-block-library-polish.test.ts`,
// asserts the same contract against the registry's real `defaultProps`; it runs
// in the website-editor lane (`npm run smoke:website-editor`), not here.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const portalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface RenderPair { server: string; firstClient: string }
interface ProbeResult {
  shareDefault: RenderPair;
  shareExplicit: RenderPair;
  breadcrumbAuto: RenderPair;
  breadcrumbExplicit: RenderPair;
}

/** `react-server` makes client hooks unavailable — the probe must not inherit it. */
function withoutReactServerCondition(nodeOptions = ""): string {
  return nodeOptions
    .replace(/(?:^|\s)--conditions(?:=|\s+)react-server(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function runProbe(): Promise<ProbeResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join(portalRoot, "scripts", "website-block-hydration-probe.ts")],
      {
        cwd: portalRoot,
        env: { ...process.env, NODE_OPTIONS: withoutReactServerCondition(process.env.NODE_OPTIONS) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", code => {
      if (code !== 0) {
        reject(new Error(`hydration probe exited ${code ?? "unknown"}\n${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout.trim().split("\n").pop() ?? "") as ProbeResult);
      } catch (error) {
        reject(new Error(`hydration probe printed no JSON: ${String(error)}\n${stdout}\n${stderr}`));
      }
    });
  });
}

test("default share buttons and auto breadcrumb render identically on the server and on first hydration", async () => {
  const probe = await runProbe();

  // The whole defect: these two strings used to differ.
  assert.equal(probe.shareDefault.server, probe.shareDefault.firstClient);
  assert.equal(probe.breadcrumbAuto.server, probe.breadcrumbAuto.firstClient);
  // Explicit props were always stable; they must stay that way.
  assert.equal(probe.shareExplicit.server, probe.shareExplicit.firstClient);
  assert.equal(probe.breadcrumbExplicit.server, probe.breadcrumbExplicit.firstClient);
});

test("a share target that is not yet known is declared, not faked with an empty URL", async () => {
  const probe = await runProbe();
  const pending = probe.shareDefault.server;

  assert.match(pending, /data-share-target="pending"/);
  // No share anchor at all rather than one aimed at nothing.
  assert.doesNotMatch(pending, /\?url=/);
  assert.doesNotMatch(pending, /\?u=/);
  for (const host of ["twitter.com", "linkedin.com", "facebook.com"]) {
    assert.ok(!pending.includes(host), `pending share markup still links to ${host}`);
  }
  assert.doesNotMatch(pending, /<a [^>]*href=/);
  assert.equal((pending.match(/aria-disabled="true"/g) ?? []).length, 3);
  // Copy Link cannot copy a URL it does not have yet.
  assert.match(pending, /aria-label="Copy page link" disabled=""/);
  // …and none of the four may LOOK live while it is inert. Inline styles
  // override the UA's disabled rendering, so the pending state has to say so
  // itself: no hand cursor, reduced contrast.
  assert.doesNotMatch(pending, /cursor:pointer/);
  assert.equal((pending.match(/cursor:default/g) ?? []).length, 4);
  assert.equal((pending.match(/opacity:0\.5/g) ?? []).length, 4);

  // With an explicit URL nothing is deferred: real targets, nothing disabled.
  const resolved = probe.shareExplicit.server;
  assert.match(resolved, /data-share-target="resolved"/);
  assert.match(resolved, /twitter\.com\/intent\/tweet\?url=https%3A%2F%2Fexample\.com%2Fpost/);
  assert.doesNotMatch(resolved, /aria-disabled="true"/);
  assert.doesNotMatch(resolved, /disabled=""/);
  assert.doesNotMatch(resolved, /opacity:0\.5/);
  assert.equal((resolved.match(/cursor:pointer/g) ?? []).length, 4);
});

test("auto breadcrumb renders nothing until it is mounted, explicit items still render server-side", async () => {
  const probe = await runProbe();

  // CAREFUL what this proves. The probe renders in plain React with NO Next
  // router, so `usePathname()` has nothing to return and auto mode produces
  // "" here. In a real Next render the router supplies the path on the server
  // too and the nav IS in the server HTML — which is the point of the
  // `usePathname` migration. So this assertion pins hydration SAFETY (the two
  // trees agree even with no router), not "the breadcrumb is absent from
  // published HTML". Crawlable output is not provable in this harness; it needs
  // the browser matrix against a published page.
  assert.equal(probe.breadcrumbAuto.server, "");
  assert.match(probe.breadcrumbExplicit.server, /^<nav [^>]*aria-label="Breadcrumb"/);
  assert.match(probe.breadcrumbExplicit.server, /<a href="\/blog"/);
  assert.match(probe.breadcrumbExplicit.server, /aria-current="page"/);
});

test("neither current-page block reads window during render", () => {
  const blocks = join(portalRoot, "src/built-ins/modules/website-editor/src/components/blocks");
  for (const file of ["ShareButtonsBlock.tsx", "BreadcrumbBlock.tsx"]) {
    const source = readFileSync(join(blocks, file), "utf8");
    const withoutComments = source.replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(withoutComments, /typeof window/, `${file} branches on \`typeof window\` again`);
  }
});

// The two blocks solve the same hydration problem DIFFERENTLY, on purpose, and
// the difference is the point: a breadcrumb needs only a PATH, which the router
// knows on both sides, so it can be server-rendered and crawled; a share target
// must be ABSOLUTE, and the origin is not knowable on the server, so it stays
// deferred. Pinning them identically is what let the breadcrumb regress into
// rendering nothing at all for crawlers and no-JS visitors.
test("the breadcrumb takes its path from the router, not from an effect", () => {
  const source = readFileSync(join(
    portalRoot, "src/built-ins/modules/website-editor/src/components/blocks/BreadcrumbBlock.tsx",
  ), "utf8");
  const code = source.replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /usePathname\(\)/,
    "auto mode is back on a browser-only value, so the server renders no breadcrumb for a crawler");
  assert.doesNotMatch(code, /window\.location/,
    "the breadcrumb reads window again; the router already knows the path on both sides");
  assert.doesNotMatch(code, /addEventListener\("popstate"/,
    "a popstate listener is back — it misses app-router soft navigations, which is what usePathname exists to handle");
});

test("share buttons re-read the URL on a soft navigation, not only on popstate", () => {
  const source = readFileSync(join(
    portalRoot, "src/built-ins/modules/website-editor/src/components/blocks/ShareButtonsBlock.tsx",
  ), "utf8");
  const code = source.replace(/^\s*\/\/.*$/gm, "");
  // Still deferred — the origin genuinely is not knowable server-side.
  assert.match(code, /useState<string \| null>\(null\)/);
  assert.match(code, /useEffect\(/);
  // ...but the read must be re-triggered by the router, or a block that
  // survives an app-router navigation keeps offering the PREVIOUS page's URL
  // and silently shares the wrong page. pushState fires no popstate.
  const effectDeps = /\}, \[([^\]]*)\]\);/.exec(code.slice(code.indexOf("useEffect(")))?.[1] ?? "";
  assert.ok(effectDeps.includes("pathname"),
    "the URL read does not depend on the router path, so a soft navigation leaves a stale share target");
  assert.ok(effectDeps.includes("searchParams"),
    "the URL read ignores query changes, so sharing from a filtered view shares the unfiltered page");
});
