// ELEMENT ENGINE P3 — the HTML-parity safety net.
//
// P3 brings the client portal's 16 block types onto the shared element
// registry so there is ONE list of placeable things instead of two. Live client
// portals render from those blocks right now. This file exists to make one
// promise enforceable:
//
//   THE MERGE DID NOT CHANGE A SINGLE CHARACTER OF WHAT A CLIENT SEES.
//
// `scripts/smoke-portal-element-parity.harness.tsx` renders every portal block
// type to real HTML — 137 renders spanning every type, both empty and populated
// clients, every tone/alignment/width/visibility branch, every data-source,
// request, approval and upload binding, preview mode, custom pages, unsafe
// hrefs and an unknown type. `scripts/portal-block-parity.baseline.json` is
// that capture taken from the PRE-MERGE code. This test re-runs the harness
// against whatever the code is now and requires the output to be byte-identical.
//
// ── Why a child process ───────────────────────────────────────────────────
//
// The suite runs under `NODE_OPTIONS='--conditions react-server'`. Under that
// condition `react-dom/server` does not resolve and `next/link` throws on
// `React.createContext` — so a portal page cannot be rendered to HTML in this
// process at all. The harness therefore runs as a plain Node process with the
// condition stripped, and this file spawns it and diffs the JSON. That is the
// difference between comparing real HTML and comparing an approximation of it.
//
// ── If this test fails ────────────────────────────────────────────────────
//
// It is telling you that a client's portal page now renders differently. Do NOT
// re-capture the baseline to make it green. Either the change was unintended —
// fix it — or it is deliberate, in which case it must be named: add the intended
// difference to `INTENDED_DIFFERENCES` below with a reason, re-capture with
// `npx tsx scripts/smoke-portal-element-parity.harness.tsx --write-baseline`,
// and say so in the change notes. A silently re-captured baseline is the same
// as having no baseline.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HARNESS = fileURLToPath(new URL("./smoke-portal-element-parity.harness.tsx", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const BASELINE = fileURLToPath(new URL("./portal-block-parity.baseline.json", import.meta.url));

/**
 * The 17 known portal block types: the 16 in the palette plus the
 * `system-content` shim that renders the operational page.
 *
 * Spelled out rather than derived, so that dropping a type from the registry is
 * a failure here instead of a silently smaller test.
 */
const PORTAL_BLOCK_TYPES = [
  "hero", "rich-text", "callout", "image", "video", "metrics", "service-grid",
  "product-hub", "file-list", "activity", "request-form", "approval-panel",
  "file-upload", "link-list", "custom-extension", "divider", "system-content",
];

/**
 * Deliberate, named departures from the pre-merge HTML.
 *
 * EMPTY, and it should stay empty. Anything listed here is a change a signed-in
 * client can see, and the entry must say why that is acceptable. An entry with
 * no reason is a bug someone hid.
 */
const INTENDED_DIFFERENCES: Array<{ key: string; reason: string }> = [];

interface Capture {
  blocks: Record<string, Record<string, unknown>>;
  normalise: unknown;
  render: Record<string, string>;
}

function runHarness(): Capture {
  // The condition has to go, or `react-dom/server` will not resolve in the
  // child either. Everything else about the environment is inherited.
  const env = { ...process.env };
  const nodeOptions = (env.NODE_OPTIONS ?? "")
    .replace(/--conditions[= ]react-server/g, "")
    .trim();
  if (nodeOptions) env.NODE_OPTIONS = nodeOptions;
  else delete env.NODE_OPTIONS;

  const stdout = execFileSync(process.execPath, [TSX, HARNESS], {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
  return JSON.parse(stdout) as Capture;
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Capture;
const current = runHarness();

describe("P3 parity — the portal renders byte-identically to before the merge", () => {
  it("the baseline covers every portal block type, and has not been quietly shrunk", () => {
    // Guards the guard. A baseline that lost half its keys would make every
    // assertion below pass while testing nothing.
    assert.deepEqual(
      Object.keys(baseline.blocks).sort(),
      [...PORTAL_BLOCK_TYPES].sort(),
      "the parity baseline no longer covers exactly the 17 known portal block types",
    );
    assert.ok(
      Object.keys(baseline.render).length >= 137,
      `the parity baseline shrank to ${Object.keys(baseline.render).length} renders`,
    );
    for (const type of PORTAL_BLOCK_TYPES) {
      for (const scenario of ["bare/default", "rich/default", "bare/dressed", "rich/dressed", "rich/preview"]) {
        const key = `${scenario}/${type}`;
        assert.ok(baseline.render[key], `the baseline has no capture for ${key}`);
        assert.ok(baseline.render[key]!.length > 0, `${key} captured an empty render`);
      }
    }
  });

  it("every stored block record still comes out of createPortalBlock unchanged", () => {
    // The stored shape, not the HTML. A "harmless" default change here rewrites
    // what an operator gets when they insert a block, and — because portal
    // documents store the whole record — what every portal built after it shows.
    for (const type of PORTAL_BLOCK_TYPES) {
      assert.deepEqual(
        current.blocks[type],
        baseline.blocks[type],
        `createPortalBlock("${type}") no longer produces the record it produced before the merge`,
      );
    }
  });

  it("normalisePortalBuilder still fails soft exactly as it did", () => {
    // The fail-soft (unknown type → rich-text, missing system block re-added,
    // hostile ids and field types coerced) is a PORTAL-SURFACE adapter. It has
    // to survive the merge unchanged, and it must not become engine behaviour —
    // `getElementDefinition` returning something for an unknown type would make
    // a typo invisible on every surface. That half is asserted in
    // smoke-portal-elements.test.ts.
    assert.deepEqual(current.normalise, baseline.normalise);
  });

  it("every rendered portal block is byte-identical to the pre-merge HTML", () => {
    const intended = new Map(INTENDED_DIFFERENCES.map(entry => [entry.key, entry.reason]));
    const missing: string[] = [];
    const changed: string[] = [];

    for (const [key, html] of Object.entries(baseline.render)) {
      const now = current.render[key];
      if (now === undefined) { missing.push(key); continue; }
      if (now === html) {
        assert.ok(!intended.has(key), `${key} is listed as an intended difference but renders identically — remove the stale entry`);
        continue;
      }
      if (intended.has(key)) continue;
      changed.push(`${key}\n    was: ${firstDifference(html, now).was}\n    now: ${firstDifference(html, now).now}`);
    }

    assert.deepEqual(missing, [], "the harness stopped capturing renders the baseline has");
    assert.deepEqual(
      changed,
      [],
      `the merge changed what a client sees:\n  ${changed.join("\n  ")}`,
    );

    // And nothing new appeared without being captured, which would be an
    // untested surface rather than a changed one.
    const extra = Object.keys(current.render).filter(key => !(key in baseline.render));
    assert.deepEqual(extra, [], "the harness captured renders the baseline does not have — re-capture deliberately");
  });
});

/** The first 120 characters either side of the first differing index. */
function firstDifference(was: string, now: string): { was: string; now: string } {
  let index = 0;
  while (index < was.length && index < now.length && was[index] === now[index]) index += 1;
  const from = Math.max(0, index - 40);
  return {
    was: `…${was.slice(from, index + 80)}…`,
    now: `…${now.slice(from, index + 80)}…`,
  };
}
