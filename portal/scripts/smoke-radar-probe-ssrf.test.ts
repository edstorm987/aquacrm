// Radar synthetic-probe SSRF + DNS-rebinding (assume-breach containment).
//
// radarSyntheticProbes validates the resolved addresses of a monitored URL, then
// used a plain fetch(url) and a tls.connect({host: hostname}) — both of which
// RE-RESOLVE the hostname at connect time, so a rebind (or an unvetted
// alternate address) between the check and the connect escaped the check. The
// fix pins BOTH the HTTP fetch (undici Agent connect.lookup → vetted IP) and the
// TLS probe (connect to the vetted IP, hostname kept as SNI) to the address that
// was just vetted. This drives the REAL Radar entry point
// (runAgencySyntheticProbes), not safeSiteFetch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test, { before } from "node:test";

let runAgencySyntheticProbes: typeof import("../src/engines/data/server/radar/radarSyntheticProbes")["runAgencySyntheticProbes"];
let mutate: typeof import("../src/server/storage")["mutate"];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENCY = "radar-ssrf-agency";

before(async () => {
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  ({ runAgencySyntheticProbes } = await import("../src/engines/data/server/radar/radarSyntheticProbes"));
});

function seedTarget(url: string) {
  mutate(state => {
    state.agencyWebsites[AGENCY] = {
      agencyId: AGENCY, name: "SSRF probe target", firstParty: true, status: "live",
      gateHeadline: "", gateMessage: "", maintenanceMessage: "",
      productionUrl: url, previewUrl: "", repositoryUrl: "", localPath: "",
      pages: [], telemetrySiteKey: "",
    } as never;
  });
}

test("a probe target that IS a private/reserved IP is refused (fail-closed, no connect)", async () => {
  for (const url of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8080/", "http://[::1]/", "http://10.0.0.5/"]) {
    seedTarget(url);
    const [result] = await runAgencySyntheticProbes(AGENCY, { force: true });
    assert.ok(result, `probe ran for ${url}`);
    assert.equal(result.ok, false, `${url} must not report OK`);
    assert.equal(result.failureKind, "unsafe-url", `${url} must be refused as unsafe, got ${result.failureKind}`);
  }
});

test("both the HTTP and TLS probe paths pin the vetted IP (no re-resolve at connect)", () => {
  const src = readFileSync(join(ROOT, "src/engines/data/server/radar/radarSyntheticProbes.ts"), "utf8");
  // HTTP: undici Agent with connect.lookup returning the pinned address + SNI.
  assert.match(src, /import \{ Agent \} from "undici"/);
  assert.match(src, /fetchWithTimeout\(current, pinnedAddress/, "the fetch must be given the vetted address");
  assert.match(src, /lookup:\s*\(_hostname, _options, callback\) =>\s*callback\(null, pinnedAddress/, "the agent must pin the vetted IP");
  assert.match(src, /servername:\s*url\.hostname/, "TLS SNI must stay the original hostname");
  assert.match(src, /dispatcher:\s*agent/);
  // TLS: connect to the pinned IP, hostname as servername, rejectUnauthorized true.
  assert.match(src, /inspectTls\(current, pinnedAddress\)/, "the TLS probe must be given the vetted address");
  assert.match(src, /host:\s*pinnedAddress \|\| url\.hostname/, "the TLS socket must connect to the vetted IP");
  assert.match(src, /rejectUnauthorized:\s*true/, "cert verification must stay on");
  // The unsafe-address decision is shared with the rest of Radar.
  assert.match(src, /from "@\/engines\/data\/radar\/radarSyntheticSafety"/);
});
