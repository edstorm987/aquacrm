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
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test, { before } from "node:test";

let runAgencySyntheticProbes: typeof import("../src/engines/data/server/radar/radarSyntheticProbes")["runAgencySyntheticProbes"];
let fetchWithTimeout: typeof import("../src/engines/data/server/radar/radarSyntheticProbes")["fetchWithTimeout"];
let mutate: typeof import("../src/server/storage")["mutate"];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENCY = "radar-ssrf-agency";

before(async () => {
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  ({ runAgencySyntheticProbes, fetchWithTimeout } = await import("../src/engines/data/server/radar/radarSyntheticProbes"));
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

test("the pinned fetch connects to the vetted IP, IGNORING the hostname's resolution (rebind is defeated)", async () => {
  // Behavioural proof of the TOCTOU closure. A local server answers on
  // 127.0.0.1:<port>. We drive the REAL fetchWithTimeout with a URL whose
  // hostname is UNRESOLVABLE (.invalid is reserved by RFC 6761 to never
  // resolve), but pin the address to 127.0.0.1. If the connection followed the
  // hostname (a plain fetch(url), i.e. the pre-fix code — or a rebind moving the
  // resolution), it would fail to resolve and throw. Because the socket is
  // pinned, it reaches our loopback server instead. This test FAILS if the pin
  // is reverted to fetch(url).
  const server: Server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("pinned-ok"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    // Hostname resolves to nothing; only the pin makes this reachable.
    const response = await fetchWithTimeout(new URL(`http://vetted-target.invalid:${port}/`), "127.0.0.1", 3000);
    assert.equal(response.status, 200, "the pinned connection must reach the loopback server");
    assert.equal(await response.text(), "pinned-ok");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("both the HTTP and TLS probe paths pin the vetted IP (structural backstop)", () => {
  // Structural belt-and-braces on top of the behavioural pin test above and the
  // behavioural refusal test at the top of this file.
  const src = readFileSync(join(ROOT, "src/engines/data/server/radar/radarSyntheticProbes.ts"), "utf8");
  // HTTP: undici Agent with connect.lookup returning the pinned address + SNI.
  assert.match(src, /import \{ Agent \} from "undici"/);
  assert.match(src, /fetchWithTimeout\(current, pinnedAddress/, "the fetch must be given the vetted address");
  // undici 6 requires the address-LIST callback form; the plain (err,address,family)
  // form silently breaks the connect (see the behavioural pin test above).
  assert.match(src, /callback\(null, \[\{ address: pinnedAddress, family \}\]\)/, "the agent must pin the vetted IP via the undici address-list form");
  assert.match(src, /servername:\s*url\.hostname/, "TLS SNI must stay the original hostname");
  assert.match(src, /dispatcher:\s*agent/);
  // TLS: connect to the pinned IP, hostname as servername, rejectUnauthorized true.
  assert.match(src, /inspectTls\(current, pinnedAddress\)/, "the TLS probe must be given the vetted address");
  assert.match(src, /host:\s*pinnedAddress \|\| url\.hostname/, "the TLS socket must connect to the vetted IP");
  assert.match(src, /rejectUnauthorized:\s*true/, "cert verification must stay on");
  // The unsafe-address decision is shared with the rest of Radar.
  assert.match(src, /from "@\/engines\/data\/radar\/radarSyntheticSafety"/);
});
