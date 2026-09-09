// safeSiteFetch DNS-rebinding TOCTOU (assume-breach containment, Phase 6).
//
// safeSiteFetch validates a user-supplied site's resolved addresses, then
// fetches it. A plain fetch(url) re-resolves the hostname at connect time, so a
// rebind between the check and the connect (→ 169.254.169.254) escapes the
// check. The fix pins the connection to the vetted IP via an undici Agent whose
// connect.lookup returns that address, with the hostname kept as TLS servername.
// The private/reserved address decision stays shared with Radar via
// radarSyntheticSafety, so the two probes can never drift.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { normalizeSiteUrl, SafeFetchError } from "../src/lib/server/safeSiteFetch";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "src/lib/server/safeSiteFetch.ts"), "utf8");

test("the fetch pins the vetted IP at connect time (closes the rebind TOCTOU)", () => {
  assert.match(src, /import \{ Agent \} from "undici"/, "must use an undici Agent to pin the connection");
  assert.match(src, /connect:\s*\{[\s\S]*lookup:/, "must override connect.lookup with the pinned address");
  assert.match(src, /servername:\s*url\.hostname/, "TLS must still validate against the original hostname");
  assert.match(src, /dispatcher:\s*agent/, "the pinned agent must be passed as the fetch dispatcher");
  // The pinned address comes from the just-vetted resolution, not a re-resolve.
  assert.match(src, /fetchNoRedirect\(current,\s*vetted\[0\]!/, "the connect target must be the vetted address");
});

test("credentials in the URL and non-http(s) schemes are still refused up front", () => {
  assert.throws(() => normalizeSiteUrl("https://user:pass@example.com"), SafeFetchError);
  assert.throws(() => normalizeSiteUrl("ftp://example.com"), SafeFetchError);
  assert.throws(() => normalizeSiteUrl("file:///etc/passwd"), SafeFetchError);
});

test("the private/reserved decision is shared with Radar (no second copy)", () => {
  assert.match(src, /from "@\/engines\/data\/radar\/radarSyntheticSafety"/, "must reuse the shared address classifier");
  assert.match(src, /isUnsafeSyntheticAddress/, "must apply the shared unsafe-address rule to every resolved address");
});
