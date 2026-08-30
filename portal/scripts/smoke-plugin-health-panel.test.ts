// Plugin health — the surface that finally shows it.
//
// `smoke-plugin-health-route.test.ts` is the contract for the route, which has
// been correct since 2026-08-28 and displayed nowhere. This is the contract for
// the panel, and it exists because the ways a health UI goes wrong are not the
// ways a health ROUTE goes wrong:
//
//   • the route is careful that a module with no hook is `supported: false` and
//     never `ok: false` — and a panel can throw that away again by painting it
//     red, which is the same lie told in CSS;
//   • `HealthStatus` carries a `components` map, and `client-crm` is the live
//     proof that it can disagree with its own headline (`ok: true` alongside
//     `segments: { ok: false }`) — a panel showing only the top line hides a
//     real failure behind a green dot;
//   • the route computes a summary precisely so a caller does not re-derive it
//     and decide "unhealthy" differently, which is exactly the bug the Dev
//     Console already shipped once with its worker count.
//
// The rules live in `src/lib/chrome/pluginHealth.ts` rather than in the
// component, so all of the above can be driven directly here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  failingComponents, healthHeadline, healthNeedsAttention, healthSummaryLine,
  healthTone, readableHealthError, sortForDisplay,
  type PluginHealthRow,
} from "../src/lib/chrome/pluginHealth";

function row(over: Partial<PluginHealthRow> = {}): PluginHealthRow {
  return { pluginId: "m", installId: "i", supported: true, status: { ok: true }, durationMs: 5, ...over };
}

describe("a module that ships no healthcheck", () => {
  const unsupported = row({ supported: false, status: undefined });

  it("is unknown — not healthy, and above all not unhealthy", () => {
    assert.equal(healthTone(unsupported), "unknown");
  });

  it("says so in words rather than leaving a blank row that reads as loading", () => {
    assert.match(healthHeadline(unsupported), /No healthcheck/);
  });

  it("never raises attention on its own", () => {
    // Three of the thirteen modules ship no hook by design. A badge lit
    // permanently for an unchanging fact is a badge nobody reads.
    const report = {
      scope: { agencyId: "a" },
      health: [unsupported, unsupported],
      summary: { checked: 0, unsupported: 2, unhealthy: 0 },
    };
    assert.equal(healthNeedsAttention(report), false);
  });

  it("is reported as not reporting, never counted as a fault", () => {
    const line = healthSummaryLine({ checked: 9, unsupported: 3, unhealthy: 0 });
    assert.match(line, /3 not reporting/);
    assert.doesNotMatch(line, /unhealthy/,
      "with nothing unhealthy the word must not appear at all");
  });
});

describe("a module whose components disagree with its headline", () => {
  // client-crm, exactly as it is written today.
  const degraded = row({
    pluginId: "client-crm",
    status: {
      ok: true,
      message: "4/6 active contacts · 0 segments",
      components: { contacts: { ok: true, message: "6 rows" }, segments: { ok: false, message: "0 rows" } },
    },
  });

  it("is degraded, not healthy", () => {
    assert.equal(healthTone(degraded), "degraded");
  });

  it("names the component that is failing", () => {
    assert.deepEqual(failingComponents(degraded), [{ name: "segments", message: "0 rows" }]);
  });

  it("raises attention even though the route counts it as healthy", () => {
    const report = {
      scope: { agencyId: "a" },
      health: [degraded],
      summary: { checked: 1, unsupported: 0, unhealthy: 0 },
    };
    assert.equal(healthNeedsAttention(report), true);
  });

  it("does NOT re-score the route's totals", () => {
    // Degraded is a display tone. The route counts `unhealthy` as
    // `status.ok === false` and nothing else; if this line started counting
    // degraded rows the header and the tiles would drift apart.
    const line = healthSummaryLine({ checked: 1, unsupported: 0, unhealthy: 0 });
    assert.doesNotMatch(line, /unhealthy/);
    assert.match(line, /1 answering/);
  });
});

describe("a module that could not answer", () => {
  const broken = row({
    pluginId: "email-sender",
    status: { ok: false, message: "This module could not report its health." },
    error: "timed out after 5000ms",
    durationMs: 5_001,
  });

  it("is unhealthy", () => {
    assert.equal(healthTone(broken), "unhealthy");
  });

  it("shows the route's reason rather than the generic sentence", () => {
    // The route sets a friendly `status.message` AND the real `error`. The
    // reason is the actionable half, so it wins.
    assert.equal(healthHeadline(broken), "timed out after 5000ms");
  });

  it("still reads as unhealthy when the hook returned no message at all", () => {
    const silent = row({ status: { ok: false } });
    assert.match(healthHeadline(silent), /without a reason/);
  });
});

describe("display order", () => {
  it("floats problems above the healthy majority", () => {
    // The route sorts by pluginId so its output is stable and diffable. That is
    // wrong for a 366px popover: one broken module must not sort below six
    // healthy ones and land under the fold.
    const rows = [
      row({ pluginId: "a-healthy" }),
      row({ pluginId: "b-unknown", supported: false, status: undefined }),
      row({ pluginId: "c-unhealthy", status: { ok: false } }),
      row({ pluginId: "d-degraded", status: { ok: true, components: { x: { ok: false } } } }),
    ];
    assert.deepEqual(
      sortForDisplay(rows).map(r => r.pluginId),
      ["c-unhealthy", "d-degraded", "b-unknown", "a-healthy"],
    );
  });

  it("breaks ties alphabetically, so the order is deterministic", () => {
    const rows = [row({ pluginId: "z" }), row({ pluginId: "m" }), row({ pluginId: "a" })];
    assert.deepEqual(sortForDisplay(rows).map(r => r.pluginId), ["a", "m", "z"]);
  });

  it("does not mutate the array it was handed", () => {
    const rows = [row({ pluginId: "z" }), row({ pluginId: "a" })];
    sortForDisplay(rows);
    assert.deepEqual(rows.map(r => r.pluginId), ["z", "a"]);
  });
});

describe("the empty and broken cases", () => {
  it("says nothing is installed rather than printing an empty tally", () => {
    assert.equal(healthSummaryLine({ checked: 0, unsupported: 0, unhealthy: 0 }), "No modules installed here.");
  });

  it("turns the route's machine codes into sentences the founder can act on", () => {
    assert.match(readableHealthError("unauthorized", 401), /Sign in again/);
    assert.match(readableHealthError("client not found", 404), /no longer exists/);
    assert.match(readableHealthError(undefined, 500), /unavailable \(500\)/);
  });
});

describe("the panel wiring", () => {
  const panel = readFileSync("src/components/chrome/DevConsolePanel.tsx", "utf8");

  it("reads health on its own generation counter", () => {
    // Sharing `loadId` with the console read would let either route cancel the
    // other's in-flight response.
    assert.match(panel, /healthLoadId = useRef\(0\)/);
  });

  it("fails alone — a sick module must not red-bar the whole console", () => {
    assert.match(panel, /setHealthError\(/);
    const healthLoad = /const loadHealth = useCallback\([\s\S]*?\n  \}, \[\]\);/.exec(panel)?.[0] ?? "";
    assert.notEqual(healthLoad, "", "loadHealth must exist");
    assert.doesNotMatch(healthLoad, /setError\(/,
      "the health read must never touch the console's own error bar");
  });

  it("is not awaited by the findings composer", () => {
    // Capture immediately is the console's whole reason for existing; ten
    // healthchecks doing I/O must not sit in front of it.
    assert.match(panel, /useEffect\(\(\) => \{ void loadHealth\(\); \}, \[loadHealth\]\);/);
  });

  it("prints the route's summary instead of re-deriving one", () => {
    assert.match(panel, /healthSummaryLine\(health\.summary\)/);
  });
});
