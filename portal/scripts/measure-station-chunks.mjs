#!/usr/bin/env node
/**
 * Measure the assets a real browser transfers on a pristine first navigation
 * to each Command Centre station.
 *
 * Run a production build at AQUA_BASE first, then:
 *   FOUNDER_PASSWORD=... AQUA_BASE=http://localhost:3041 npm run perf:station-chunks
 *
 * A local file/memory dev lane can authenticate through /dev instead. Login is
 * performed once and copied as storage state; every measured station still gets
 * a new context with the HTTP cache and service workers disabled.
 *
 * stdout is one JSON report. Human diagnostics go to stderr so the result can
 * be redirected or diffed without parsing log prose.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  STATION_ROUTES,
  assetKind,
  cdpAssetRecord,
  compareStationsToDay,
  navigationMatchesTarget,
  parseBaseUrl,
  safeReportUrl,
  summariseAssets,
  targetUrl,
} from "./lib/station-chunk-measurement.mjs";

const DEFAULT_BASE = "http://localhost:3041";
const DEFAULT_TIMEOUT_MS = 45_000;

function positiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function findProvisionedChromium(root) {
  if (!root || root === "0" || !existsSync(root)) return undefined;
  const direct = join(root, "chromium");
  if (existsSync(direct)) return direct;
  const revisions = readdirSync(root)
    .filter(name => /^chromium-\d+$/.test(name))
    .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]));
  for (const revision of revisions) {
    for (const relative of [["chrome-linux", "chrome"], ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"]]) {
      const candidate = join(root, revision, ...relative);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (error) {
    throw new Error(`playwright-core is unavailable; run npm install (${error.message})`);
  }

  const configured = process.env.AQUA_BROWSER_EXECUTABLE;
  try {
    const browser = await chromium.launch(configured ? { executablePath: configured } : {});
    return { browser, source: configured ? "configured executable" : "playwright-core Chromium" };
  } catch (firstError) {
    const provisioned = configured ? undefined : findProvisionedChromium(process.env.PLAYWRIGHT_BROWSERS_PATH);
    if (!provisioned) {
      throw new Error(
        "Chromium is unavailable; run npm run browser:install or set AQUA_BROWSER_EXECUTABLE "
        + `(${firstError.message})`,
      );
    }
    const browser = await chromium.launch({ executablePath: provisioned });
    return { browser, source: "pre-provisioned Chromium" };
  }
}

async function signIn(browser, baseUrl) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    const password = process.env.FOUNDER_PASSWORD || "";
    const mode = process.env.AQUA_AUTH || (password ? "password" : "dev");
    if (mode !== "password" && mode !== "dev") {
      throw new Error("AQUA_AUTH must be password or dev");
    }

    if (mode === "password") {
      if (!password) throw new Error("AQUA_AUTH=password requires FOUNDER_PASSWORD");
      const response = await page.request.post(targetUrl(baseUrl, "/api/auth/login"), {
        data: {
          email: process.env.FOUNDER_EMAIL || "edwardhallam07@gmail.com",
          password,
        },
        headers: { "content-type": "application/json" },
      });
      if (!response.ok()) throw new Error(`password sign-in returned HTTP ${response.status()}`);
    } else {
      const response = await page.goto(targetUrl(baseUrl, "/dev"), {
        waitUntil: "domcontentloaded",
        timeout: positiveNumber("AQUA_STATION_CHUNK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      });
      if (!response || response.status() >= 400) {
        throw new Error(`dev sign-in returned HTTP ${response?.status() ?? "no response"}`);
      }
    }
    return { mode, storageState: await context.storageState() };
  } finally {
    await context.close();
  }
}

function attachNetworkEvidence(cdp, baseUrl) {
  const requests = new Map();
  const responses = new Map();
  const finished = new Map();
  const failed = [];

  cdp.on("Network.requestWillBeSent", event => requests.set(event.requestId, event));
  cdp.on("Network.responseReceived", event => responses.set(event.requestId, event));
  cdp.on("Network.loadingFinished", event => finished.set(event.requestId, event));
  cdp.on("Network.loadingFailed", event => {
    const request = requests.get(event.requestId);
    const response = responses.get(event.requestId);
    const kind = assetKind({
      type: response?.type ?? request?.type,
      mimeType: response?.response?.mimeType,
      url: response?.response?.url ?? request?.request?.url,
    });
    if (!kind) return;
    const rawUrl = response?.response?.url ?? request?.request?.url;
    if (!rawUrl) return;
    failed.push({
      url: safeReportUrl(rawUrl, baseUrl),
      kind,
      error: event.errorText || "request failed",
    });
  });

  return {
    snapshot() {
      const assets = [];
      for (const [requestId, completed] of finished) {
        const asset = cdpAssetRecord({
          request: requests.get(requestId),
          response: responses.get(requestId),
          finished: completed,
          baseUrl,
        });
        if (asset) assets.push(asset);
      }
      return { assets, failed };
    },
  };
}

async function measureStation({ browser, baseUrl, storageState, station, timeoutMs }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const network = attachNetworkEvidence(cdp, baseUrl);
  const navigation = [];
  page.on("response", response => {
    const request = response.request();
    if (request.resourceType() === "document" && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigation.push({ status: response.status(), url: safeReportUrl(response.url(), baseUrl) });
    }
  });

  const expectedUrl = targetUrl(baseUrl, station.path);
  const startedAt = performance.now();
  const failures = [];
  let response = null;
  let documentResponseMs = null;
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.setBypassServiceWorker", { bypass: true });
    response = await page.goto(expectedUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    documentResponseMs = Math.round((performance.now() - startedAt) * 10) / 10;
    await page.locator(station.readySelector).first().waitFor({ state: "visible", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    // Let the protocol deliver the final loadingFinished event before taking
    // the synchronous snapshot. No fixed loading allowance is being measured.
    await page.waitForTimeout(50);
  } catch (error) {
    failures.push(redactMessage(error?.message || String(error)));
  }
  const settledMs = Math.round((performance.now() - startedAt) * 10) / 10;
  const finalUrl = page.url();
  const evidence = network.snapshot();
  const summary = summariseAssets(evidence.assets);

  if (!response) failures.push("navigation produced no document response");
  if (response && (response.status() < 200 || response.status() >= 300)) {
    failures.push(`document returned HTTP ${response.status()}`);
  }
  if (navigation.length > 1 || navigation.some(item => item.status >= 300 && item.status < 400)) {
    failures.push("document navigation redirected");
  }
  if (!navigationMatchesTarget(finalUrl, expectedUrl)) {
    failures.push(`landed on ${safeReportUrl(finalUrl, baseUrl)} instead of the requested station`);
  }
  if (summary.assetCount === 0 || summary.totalBytes === 0) {
    failures.push("no transferable JavaScript or CSS bytes were observed");
  }
  for (const asset of summary.assets) {
    if (asset.status < 200 || asset.status >= 400) failures.push(`${asset.url} returned HTTP ${asset.status}`);
    if (asset.fromDiskCache || asset.fromServiceWorker) {
      failures.push(`${asset.url} was not a pristine network transfer`);
    }
  }
  for (const assetFailure of evidence.failed) {
    failures.push(`${assetFailure.url} failed: ${assetFailure.error}`);
  }

  await cdp.detach().catch(() => {});
  await context.close();
  return {
    id: station.id,
    label: station.label,
    path: station.path,
    status: failures.length ? "fail" : "pass",
    httpStatus: response?.status() ?? null,
    finalUrl: safeReportUrl(finalUrl, baseUrl),
    redirected: navigation.length > 1 || navigation.some(item => item.status >= 300 && item.status < 400),
    navigation,
    documentResponseMs,
    settledMs,
    ...summary,
    failures: [...new Set(failures)],
  };
}

function redactMessage(message) {
  let safe = String(message);
  const password = process.env.FOUNDER_PASSWORD;
  if (password) safe = safe.split(password).join("[redacted]");
  return safe.replace(/([?&](?:auth|credential|key|pass|secret|session|signature|token)[^=]*=)[^&\s]+/gi, "$1[redacted]");
}

async function main() {
  const baseUrl = parseBaseUrl(process.env.AQUA_BASE || DEFAULT_BASE);
  const timeoutMs = positiveNumber("AQUA_STATION_CHUNK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const { browser, source } = await launchChromium();
  let authMode = null;
  try {
    const auth = await signIn(browser, baseUrl);
    authMode = auth.mode;
    const measured = [];
    for (const station of STATION_ROUTES) {
      process.stderr.write(`[perf:station-chunks] measuring ${station.label}\n`);
      measured.push(await measureStation({
        browser,
        baseUrl,
        storageState: auth.storageState,
        station,
        timeoutMs,
      }));
    }
    const stations = compareStationsToDay(measured);
    const failures = stations.flatMap(station => station.failures.map(detail => ({ station: station.id, detail })));
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      base: `${baseUrl.origin}${baseUrl.pathname === "/" ? "" : baseUrl.pathname}`,
      browser: { source, version: browser.version() },
      auth: { mode: authMode },
      baselineStation: "day",
      totals: {
        stationCount: stations.length,
        passed: stations.filter(station => station.status === "pass").length,
        failed: stations.filter(station => station.status === "fail").length,
      },
      failures,
      stations,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "fail",
      failures: [{ station: null, detail: redactMessage(error?.message || String(error)) }],
      stations: [],
    }, null, 2)}\n`);
    process.exitCode = 2;
  });
}
