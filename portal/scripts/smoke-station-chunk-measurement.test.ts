import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STATION_ROUTES,
  assetKind,
  cdpAssetRecord,
  compareStationsToDay,
  dedupeAssets,
  navigationMatchesTarget,
  parseBaseUrl,
  safeReportUrl,
  summariseAssets,
} from "./lib/station-chunk-measurement.mjs";

const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const DRIVER = readFileSync(new URL("./measure-station-chunks.mjs", import.meta.url), "utf8");

test("the production station measurement command covers every supported first-load station", () => {
  assert.equal(PACKAGE.scripts["perf:station-chunks"], "node scripts/measure-station-chunks.mjs");
  assert.deepEqual(
    STATION_ROUTES.map(station => station.id),
    ["day", "executive", "battle", "calendar", "actions", "advisor", "devteam", "radar-inspector"],
  );
  assert.equal(STATION_ROUTES[0]?.path, "/portal/agency?station=day");
  assert.ok(STATION_ROUTES.every(station => station.readySelector), "every station needs mounted-DOM proof");
});

test("authentication is one bootstrap and measured routes use fresh cacheless contexts", () => {
  assert.match(DRIVER, /const auth = await signIn\(browser, baseUrl\)/);
  assert.match(DRIVER, /for \(const station of STATION_ROUTES\)/);
  assert.match(DRIVER, /browser\.newContext\(\{[\s\S]*?storageState,[\s\S]*?serviceWorkers: "block"/);
  assert.match(DRIVER, /Network\.setCacheDisabled/);
  assert.match(DRIVER, /Network\.setBypassServiceWorker/);
  assert.doesNotMatch(DRIVER, /console\.log\([^)]*(password|FOUNDER_PASSWORD)/i);
});

test("asset classification accepts protocol types, MIME types and chunk extensions only", () => {
  assert.equal(assetKind({ type: "Script", url: "https://a.test/no-extension" }), "js");
  assert.equal(assetKind({ mimeType: "text/css", url: "https://a.test/no-extension" }), "css");
  assert.equal(assetKind({ url: "https://a.test/_next/static/chunks/a.js?v=1" }), "js");
  assert.equal(assetKind({ url: "https://a.test/_next/static/css/a.css" }), "css");
  assert.equal(assetKind({ type: "Fetch", mimeType: "application/json", url: "https://a.test/api" }), null);
});

test("CDP loadingFinished transfer bytes become the recorded first-load bytes", () => {
  const asset = cdpAssetRecord({
    request: { timestamp: 10, type: "Script", request: { url: "https://a.test/_next/static/a.js" } },
    response: {
      type: "Script",
      response: { url: "https://a.test/_next/static/a.js", mimeType: "application/javascript", status: 200 },
    },
    finished: { timestamp: 10.125, encodedDataLength: 12_345.4 },
    baseUrl: new URL("https://a.test"),
  });
  assert.deepEqual(asset, {
    url: "/_next/static/a.js",
    kind: "js",
    status: 200,
    transferBytes: 12_345,
    durationMs: 125,
    fromDiskCache: false,
    fromServiceWorker: false,
  });
});

test("assets are deduplicated by safe URL and route totals split JS from CSS", () => {
  const summary = summariseAssets([
    { url: "/a.js", kind: "js", status: 200, transferBytes: 100, durationMs: 4 },
    { url: "/a.js", kind: "js", status: 200, transferBytes: 120, durationMs: 6 },
    { url: "/a.css", kind: "css", status: 200, transferBytes: 30, durationMs: 2 },
  ]);
  assert.equal(summary.assetCount, 2);
  assert.equal(summary.totalBytes, 150);
  assert.equal(summary.jsBytes, 120);
  assert.equal(summary.cssBytes, 30);
  assert.equal(summary.assets.find(asset => asset.url === "/a.js")?.requestCount, 2);
  assert.equal(dedupeAssets([]).length, 0);
});

test("each station reports only unique additional assets and bytes versus Day", () => {
  const asset = (url: string, transferBytes: number) => ({ url, kind: "js", status: 200, transferBytes });
  const compared = compareStationsToDay([
    { id: "day", status: "pass", assets: [asset("/shared.js", 100), asset("/day.js", 20)] },
    { id: "battle", status: "pass", assets: [asset("/shared.js", 100), asset("/battle.js", 75)] },
  ]);
  assert.deepEqual(compared[0]?.extraVsDay, { assetCount: 0, bytes: 0, urls: [] });
  assert.deepEqual(compared[1]?.extraVsDay, { assetCount: 1, bytes: 75, urls: ["/battle.js"] });
  assert.equal(compareStationsToDay([{ id: "battle", status: "pass", assets: [] }])[0]?.extraVsDay, null);
});

test("report URLs redact secrets and navigation comparison ignores query order, not values", () => {
  const base = parseBaseUrl("https://a.test/");
  assert.equal(
    safeReportUrl("https://a.test/_next/a.js?v=1&sessionToken=secret", base),
    "/_next/a.js?v=1&sessionToken=%5Bredacted%5D",
  );
  assert.equal(
    navigationMatchesTarget("https://a.test/portal/agency?view=kpis&station=day", "https://a.test/portal/agency?station=day&view=kpis"),
    true,
  );
  assert.equal(
    navigationMatchesTarget("https://a.test/portal/agency?station=battle", "https://a.test/portal/agency?station=day"),
    false,
  );
  assert.throws(() => parseBaseUrl("https://user:password@a.test"), /must not contain credentials/);
});
