// How much Radar keeps, and the promise that compacting it loses nothing.
//
// Ed, 2026-08-29: *"we dont want to completely clog the database with it … be
// smart about how much we keep where and when … but making this very efficient
// while retaining all info we need."*
//
// ── What the measurement found ───────────────────────────────────────────
//
// Retention was expressed as COUNTS — 288 raw points, 720 hourly buckets. Those
// are correct for a five-minute probe cadence: 24 hours of raw, 30 days of
// hourly. The cadence became daily (issues #170) and the numbers stayed, so
// they came to mean **288 days of raw** and **~2 years of hourly** — about
// thirty times the intended history, held in a state document that is rewritten
// in full on every save.
//
// A count is only a duration if you also know the cadence, and the cadence is a
// setting. So retention is now expressed in TIME, with the counts kept purely
// as runaway guards, and a daily tier added so shortening the windows does not
// throw the long trend away.
//
// ── What these tests are really protecting ───────────────────────────────
//
// Not "the numbers are small". The numbers can be tuned. What must not break is
// the PROMISE: a sample that ages out of the raw window is still represented in
// the hourly bucket, and one that ages out of hourly is still in the daily one.
// Compaction that silently drops history would be far worse than a large blob,
// because Radar's whole job is to distinguish "this is unusual" from "this is
// normal", and it can only do that against history it still has.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const VAULT = "src/engines/data/server/radar/radarEvidenceVault.ts";
const source = readFileSync(VAULT, "utf8");

const DAY = 86_400_000;

/** The retention windows, read from the source so the test cannot drift from it. */
function constant(name: string): number {
  const match = new RegExp(`const ${name} = ([\\d_]+) \\* DAY_MS`).exec(source);
  assert.ok(match, `expected ${name} to be declared in days`);
  return Number(match[1]!.replace(/_/g, "")) * DAY;
}

describe("radar retention is expressed in time, not in samples", () => {
  it("every window is a duration", () => {
    // The whole bug was a count standing in for a duration. If any of these
    // goes back to a bare number, the same silent drift is available again.
    for (const name of ["RAW_POINT_RETENTION_MS", "HOURLY_RETENTION_MS", "DAILY_RETENTION_MS"]) {
      assert.ok(constant(name) > 0, `${name} must be a real window`);
    }
  });

  it("the counts survive only as runaway guards, and say so", () => {
    assert.match(source, /Runaway guards/,
      "the counts must be labelled as guards, or the next reader will treat them as the policy again");
    assert.match(source, /const RECENT_POINT_LIMIT = 288;/);
    assert.match(source, /const DAILY_ROLLUP_LIMIT = 400;/);
  });

  it("raw is the shortest window and daily the longest", () => {
    const raw = constant("RAW_POINT_RETENTION_MS");
    const hourly = constant("HOURLY_RETENTION_MS");
    const daily = constant("DAILY_RETENTION_MS");
    assert.ok(raw < hourly, "raw detail must not outlive the hourly summary of it");
    assert.ok(hourly < daily, "hourly must not outlive the daily summary of it");
    // If raw ever outlived its rollup, compaction would delete the summary and
    // keep the bulk — exactly backwards.
    assert.ok(daily >= 365 * DAY, "a year of trend is the point of the daily tier");
  });

  it("a sample is written into all three tiers at once", () => {
    // The alternative — a separate rollup pass — can fall behind or fail, and
    // then compaction deletes raw data that was never summarised. Folding on
    // the way in makes deletion safe by construction.
    assert.match(source, /series\.hourly = withinWindow\(updateHourly\(/);
    assert.match(source, /series\.daily = withinWindow\(updateDaily\(/);
    assert.match(source, /Compaction is then\s*\n\s*\/\/ only ever a DELETE of what is already summarised/,
      "the reason must be written where the code is");
  });

  it("ageing out is by timestamp, on every tier", () => {
    assert.match(source, /const rawCutoff = now - RAW_POINT_RETENTION_MS;/);
    assert.match(source, /series\.points\.filter\(entry => entry\.at >= rawCutoff\)/);
    assert.match(source, /function withinWindow<T extends \{ hour: number \}>/,
      "hourly and daily must age out the same way, or they drift apart");
    assert.match(source, /row\.hour >= cutoff/);
  });

  it("the daily rollup keeps the same shape as the hourly one", () => {
    // Two shapes for one question means every reader learns both, and the
    // charts end up handling only whichever came first.
    const daily = /function updateDaily[\s\S]*?\n}/.exec(source)?.[0] ?? "";
    for (const field of ["samples", "minimum", "maximum", "average", "last"]) {
      assert.ok(daily.includes(field), `the daily rollup must carry ${field}, as hourly does`);
    }
    assert.match(daily, /average: \(existing\.average \* existing\.samples \+ point\.value\) \/ samples/,
      "a running mean, so a busy day costs no more than a quiet one");
  });

  it("`now` is passed in, never read inside the window helper", () => {
    // A helper that read the clock itself would give a write and a render
    // different answers in the same second, and could not be tested at all.
    const helper = /function withinWindow[\s\S]*?\n}/.exec(source)?.[0] ?? "";
    assert.doesNotMatch(helper, /Date\.now\(\)/, "the clock must be an argument");
    assert.match(helper, /now: number/);
  });
});

describe("the window arithmetic actually bounds the series", () => {
  // Re-derived here rather than asserted as a magic number, so the reasoning is
  // visible and a tuning change shows its own cost.
  const RAW_BYTES = 58;      // {at, value, status}
  const ROLLUP_BYTES = 96;   // {hour, samples, minimum, maximum, average, last}
  const SERIES = 150;        // measured on the live state, 2026-08-29

  it("a daily cadence costs far less than the shape it replaced", () => {
    const raw = constant("RAW_POINT_RETENTION_MS") / DAY;
    const hourly = constant("HOURLY_RETENTION_MS") / DAY;   // one bucket a day at this cadence
    const daily = constant("DAILY_RETENTION_MS") / DAY;
    const perSeries = raw * RAW_BYTES + hourly * ROLLUP_BYTES + daily * ROLLUP_BYTES;

    // The shape before: 288 raw + 720 hourly, both saturated.
    const before = 288 * RAW_BYTES + 720 * ROLLUP_BYTES;
    assert.ok(
      perSeries < before,
      `retention must cost less than the count-based shape it replaced: ${Math.round(perSeries / 1024)} KB `
      + `vs ${Math.round(before / 1024)} KB per series`,
    );
    // And the total has to stay a number somebody would accept in a document
    // that is rewritten whole on every save.
    const totalMb = (perSeries * SERIES) / 1024 / 1024;
    assert.ok(totalMb < 8, `${totalMb.toFixed(1)} MB across ${SERIES} series is too much for a blob store`);
  });

  it("a five-minute cadence is held by the guards, not by the windows", () => {
    // Fourteen days of raw at 5-minute sampling would be 4,032 points. The cap
    // is what stands between a cadence change and a runaway document.
    const rawIfUncapped = (constant("RAW_POINT_RETENTION_MS") / 300_000);
    assert.ok(rawIfUncapped > 288, "this is exactly the case the guard exists for");
    assert.match(source, /\.slice\(-RECENT_POINT_LIMIT\)/, "and the guard must still be applied");
  });
});

// ══════════════════════════════════════════════════════════════════════════

describe("scan history keeps the trend and drops the bulk", () => {
  // Measured on the LIVE datastore, 2026-08-29:
  //
  //   whole document          3.25 MB
  //   radar total              974 KB   29.2%   ← more than 5x `clients`
  //     radarMemory            619 KB
  //       └ scans              473 KB   68 entries, ~7 KB each
  //     radarEvidence          349 KB
  //     clients                181 KB    5.4%
  //
  // At the 180-scan cap that one field was heading for ~1.26 MB per agency.
  // Almost all of the weight is four detail arrays, and **only `scans.at(-1)`
  // is ever read** — `radarMemory.ts` uses it to work out what is new,
  // worsening or recovered since the last sweep. Nothing reads the detail of
  // scan #170, so it is compacted away.

  const memory = readFileSync("src/engines/data/server/radar/radarMemory.ts", "utf8");
  const types = readFileSync("src/server/types.ts", "utf8");

  it("only the newest few scans keep their detail", () => {
    assert.match(memory, /const DETAILED_SCAN_LIMIT = \d+;/);
    assert.match(memory, /index >= all\.length - DETAILED_SCAN_LIMIT \? entry : compactScan\(entry\)/,
      "compaction must apply to everything older than the detailed window");
  });

  it("compaction DELETES the fields rather than emptying them", () => {
    // The distinction this test exists for. `issueStates: []` on a scan whose
    // detail we no longer hold says "nothing was wrong that sweep" — a
    // confident claim about data that was discarded. Absent says "not
    // retained", which is the truth.
    const fn = /function compactScan[\s\S]*?\n}/.exec(memory)?.[0] ?? "";
    assert.match(fn, /const \{ issueStates, attentionCheckIds, blindCheckIds, sourceStates, \.\.\.summary \} = scan;/,
      "the detail must be destructured away, leaving a summary");
    assert.doesNotMatch(fn, /issueStates: \[\]/, "emptying would be a lie about a discarded scan");
    assert.match(fn, /return summary;/);
  });

  it("the type says absence means 'not retained'", () => {
    assert.match(types, /issueStates\?: Array<\{ id: string; severity/,
      "the detail fields must be optional, or the shape claims they are always there");
    assert.match(types, /\*\*Absent means "not retained"; `\[\]` means "genuinely none"\.\*\*/,
      "and the meaning of absence must be written where the type is read");
  });

  it("the one reader tolerates a compacted scan", () => {
    // `previous` is always `at(-1)` and so always detailed — but a future
    // reader reaching further back must not silently read a compacted scan as
    // a clean one.
    assert.match(memory, /\(previous\?\.issueStates \?\? \[\]\)\.map/);
    assert.match(memory, /\[\.\.\.\(previous\.attentionCheckIds \?\? \[\]\), \.\.\.\(previous\.blindCheckIds \?\? \[\]\)\]/);
  });

  it("the summary — the trend — survives compaction", () => {
    // What must NOT be lost: assurance over time, counts, and when it ran.
    // That is what the hourly rollups and any trend chart are built from.
    const fn = /function compactScan[\s\S]*?\n}/.exec(memory)?.[0] ?? "";
    for (const field of ["assurancePercent", "scannedAt", "totalChecks", "criticalIssues"]) {
      assert.ok(!fn.includes(`${field},`), `${field} is trend data and must survive compaction`);
    }
  });

  it("compaction is idempotent", () => {
    // It runs on every write over the whole retained list, so it must be safe
    // to apply to a scan that has already been compacted.
    const fn = /function compactScan[\s\S]*?\n}/.exec(memory)?.[0] ?? "";
    assert.match(fn, /if \(scan\.issueStates === undefined && scan\.attentionCheckIds === undefined\) return scan;/,
      "an already-compacted scan must be returned untouched, not re-destructured every sweep");
  });
});
