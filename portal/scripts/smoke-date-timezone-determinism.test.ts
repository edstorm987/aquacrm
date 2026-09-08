// Regression: business dates render deterministically regardless of the runtime
// timezone or locale. The bug class this locks down: a date formatted without a
// pinned `timeZone` renders in the process zone (Railway runs UTC) on the server
// but in the browser's zone on the client — an off-by-a-day value AND a React
// hydration mismatch. The fix pins Europe/London everywhere; these tests prove it
// by re-running the formatter under hostile TZ/locale environments and asserting
// the output does not move.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  formatUkDateTime,
  formatUkDate,
  stableUkDateString,
} from "../src/lib/shared/formatDateTime";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANONICAL = join(HERE, "..", "src/lib/shared/formatDateTime.ts");
const MODULE_SAFEDATE = join(HERE, "..", "src/built-ins/modules/agency-hr/src/lib/safeDate.ts");

// 2026-09-25 23:30:00 UTC. In Europe/London (BST, +1) this is 26 Sep 2026 00:30 —
// a DIFFERENT calendar day from UTC, New York and Kolkata. A correct London-pinned
// formatter must show 26 Sep in every runtime zone.
const CROSS_MIDNIGHT_MS = Date.UTC(2026, 8, 25, 23, 30, 0);
const WINTER_NOON_UTC = Date.UTC(2026, 0, 15, 12, 0, 0); // London GMT → 12:00
const SUMMER_NOON_UTC = Date.UTC(2026, 6, 15, 12, 0, 0); // London BST → 13:00

/** Run one formatter export in a child process under a hostile TZ/locale. */
function formatUnder(env: { TZ?: string; LC_ALL?: string; LANG?: string }, modulePath: string, call: string): string {
  // tsx wraps a dynamically-imported .ts module's named exports under `.default`,
  // so unwrap to whichever namespace actually carries the formatter functions.
  const code = `const _m = await import(process.env.__FMT_PATH); const m = (_m.default && (_m.default.formatUkDate || _m.default.formatUkDateTime)) ? _m.default : _m; process.stdout.write(String(${call}));`;
  return execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      env: { ...process.env, ...env, __FMT_PATH: modulePath },
      encoding: "utf8",
      timeout: 30_000,
    },
  ).trim();
}

test("stableUkDateString collapses the two engine-divergent en-GB forms", () => {
  // V8 emits "Sept" + ", "; WebKit emits "Sep" + " at ". Both must normalise to
  // the V8/Node SSR form so server and client renders are byte-identical.
  assert.equal(stableUkDateString("25 Sept 2026, 16:16"), "25 Sep 2026, 16:16");
  assert.equal(stableUkDateString("25 Aug 2026 at 16:16"), "25 Aug 2026, 16:16");
  // "September" (long) is untouched — the word boundary protects it.
  assert.equal(stableUkDateString("25 September 2026"), "25 September 2026");
});

test("formatUkDateTime pins Europe/London (cross-midnight instant shows the London day)", () => {
  const out = formatUkDateTime(CROSS_MIDNIGHT_MS);
  assert.match(out, /26 Sep 2026/, `expected the London calendar day, got "${out}"`);
  assert.match(out, /00:30/, `expected the London wall-clock time, got "${out}"`);
  assert.doesNotMatch(out, /Sept\b/, "September must be normalised to Sep");
  assert.doesNotMatch(out, / at /, "the connector must be normalised to a comma");
});

test("formatUkDate honours British Summer Time (DST is applied, not a fixed offset)", () => {
  const winter = formatUkDate(WINTER_NOON_UTC, { hour: "2-digit", minute: "2-digit" });
  const summer = formatUkDate(SUMMER_NOON_UTC, { hour: "2-digit", minute: "2-digit" });
  assert.equal(winter, "12:00", `winter noon UTC should be 12:00 GMT in London, got "${winter}"`);
  assert.equal(summer, "13:00", `summer noon UTC should be 13:00 BST in London, got "${summer}"`);
});

test("output is identical across UTC, New York and Kolkata process zones", () => {
  const call = `m.formatUkDateTime(${CROSS_MIDNIGHT_MS})`;
  const utc = formatUnder({ TZ: "UTC" }, CANONICAL, call);
  const ny = formatUnder({ TZ: "America/New_York" }, CANONICAL, call);
  const kolkata = formatUnder({ TZ: "Asia/Kolkata" }, CANONICAL, call);
  assert.equal(utc, ny, "UTC vs New York process zone must not change the output");
  assert.equal(ny, kolkata, "New York vs Kolkata process zone must not change the output");
  assert.match(utc, /26 Sep 2026/, `child-process output should show the London day, got "${utc}"`);
});

test("output is identical across a non-English default locale", () => {
  const call = `m.formatUkDateTime(${CROSS_MIDNIGHT_MS})`;
  const c = formatUnder({ LC_ALL: "C" }, CANONICAL, call);
  const german = formatUnder({ LC_ALL: "de_DE.UTF-8", LANG: "de_DE.UTF-8" }, CANONICAL, call);
  assert.equal(c, german, "a German runtime locale must not change the en-GB output");
});

test("module safeDate copies also pin Europe/London and normalise the engine forms", () => {
  const call = `m.formatUkDate(${CROSS_MIDNIGHT_MS}, { day: "numeric", month: "short", year: "numeric" })`;
  const utc = formatUnder({ TZ: "UTC" }, MODULE_SAFEDATE, call);
  const ny = formatUnder({ TZ: "America/New_York" }, MODULE_SAFEDATE, call);
  assert.equal(utc, ny, "module date output must be TZ-independent");
  assert.match(utc, /26 Sep 2026/, `module formatter should show the London day, got "${utc}"`);
  assert.doesNotMatch(utc, /Sept\b/, "module formatter must normalise September to Sep");
});

test("module safeDate parses a numeric-string timestamp (the /^\\d+$/ regex fix)", () => {
  // Before the fix the pattern was /^\\d+$/ (a literal backslash), so a stringified
  // epoch fell through to `new Date(string)` → Invalid Date → the fallback text.
  const call = `m.formatUkDate("${CROSS_MIDNIGHT_MS}", { day: "numeric", month: "short", year: "numeric" })`;
  const out = formatUnder({ TZ: "UTC" }, MODULE_SAFEDATE, call);
  assert.notEqual(out, "Date needs review", "a numeric string must be parsed, not rejected");
  assert.match(out, /26 Sep 2026/, `numeric string should format to the London day, got "${out}"`);
});

test("a missing value yields the fallback, never today", () => {
  assert.equal(formatUkDateTime(undefined), "Date needs review");
  assert.equal(formatUkDateTime(null), "Date needs review");
  assert.equal(formatUkDate(undefined, { day: "numeric" }), "Date needs review");
});
