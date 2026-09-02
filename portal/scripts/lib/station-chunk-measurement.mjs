const SENSITIVE_QUERY_PARAMETER = /(auth|credential|key|pass|secret|session|signature|token)/i;

/**
 * The canonical Day route is deliberately first: every other station is
 * compared with a fresh-context load of this exact baseline.
 */
export const STATION_ROUTES = Object.freeze([
  { id: "day", label: "Agency Day", path: "/portal/agency?station=day", readySelector: ".mm-day-command-workspace" },
  { id: "executive", label: "Executive", path: "/portal/agency?station=executive", readySelector: "#command-centre-heading" },
  { id: "battle", label: "Battle Table", path: "/portal/agency?station=battle", readySelector: "#battle-table-heading" },
  { id: "calendar", label: "Calendar", path: "/portal/agency?station=calendar", readySelector: ".mm-actions-calendar" },
  { id: "actions", label: "Actions", path: "/portal/agency?station=actions", readySelector: "#unified-actions-heading" },
  { id: "advisor", label: "Aqua Advisor", path: "/portal/agency?station=advisor", readySelector: ".mm-assistant-workspace" },
  { id: "devteam", label: "Dev Team", path: "/portal/agency?station=devteam", readySelector: "#dev-team-station-heading" },
  // The app supports this bookmark explicitly and loads the inspector through
  // a next/dynamic boundary, so it belongs in the first-load evidence.
  { id: "radar-inspector", label: "Radar inspector", path: "/portal/agency?station=radar-inspector", readySelector: "[data-testid=\"radar-inspection-workspace\"]" },
]);

export function parseBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AQUA_BASE must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("AQUA_BASE must not contain credentials; use the authentication environment variables");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url;
}

export function targetUrl(baseUrl, routePath) {
  return new URL(routePath, baseUrl).href;
}

/** Keep evidence useful without ever echoing signed/authentication material. */
export function safeReportUrl(value, baseUrl) {
  const url = new URL(value, baseUrl);
  url.username = "";
  url.password = "";
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_PARAMETER.test(key)) url.searchParams.set(key, "[redacted]");
  }
  const base = baseUrl instanceof URL ? baseUrl : new URL(baseUrl);
  return url.origin === base.origin ? `${url.pathname}${url.search}` : url.href;
}

export function navigationMatchesTarget(actual, expected) {
  const actualUrl = new URL(actual);
  const expectedUrl = new URL(expected);
  if (actualUrl.origin !== expectedUrl.origin || actualUrl.pathname !== expectedUrl.pathname) return false;
  return sortedSearch(actualUrl.searchParams) === sortedSearch(expectedUrl.searchParams);
}

function sortedSearch(params) {
  return [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function assetKind({ type, mimeType, url } = {}) {
  const resourceType = String(type || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = String(url || "").split("?")[0].toLowerCase();
  }
  if (resourceType === "script" || /(?:javascript|ecmascript)/.test(mime) || /\.(?:m?js)$/.test(pathname)) return "js";
  if (resourceType === "stylesheet" || mime === "text/css" || /\.css$/.test(pathname)) return "css";
  return null;
}

export function cdpAssetRecord({ request, response, finished, baseUrl }) {
  const kind = assetKind({
    type: response?.type ?? request?.type,
    mimeType: response?.response?.mimeType,
    url: response?.response?.url ?? request?.request?.url,
  });
  if (!kind || !response?.response || !finished) return null;
  const rawUrl = response.response.url ?? request?.request?.url;
  if (!rawUrl) return null;
  const startedAt = Number(request?.timestamp);
  const finishedAt = Number(finished.timestamp);
  return {
    url: safeReportUrl(rawUrl, baseUrl),
    kind,
    status: Number(response.response.status) || 0,
    transferBytes: nonNegativeInteger(finished.encodedDataLength),
    durationMs: Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? Math.max(0, Math.round((finishedAt - startedAt) * 10_000) / 10)
      : null,
    fromDiskCache: Boolean(response.response.fromDiskCache),
    fromServiceWorker: Boolean(response.response.fromServiceWorker),
  };
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/**
 * A preload and its consuming script can surface more than once in protocol
 * evidence. The requested contract is unique asset URLs, so retain the largest
 * observed transfer rather than double-counting it.
 */
export function dedupeAssets(assets = []) {
  const byUrl = new Map();
  for (const asset of assets) {
    if (!asset?.url || !assetKind({ type: asset.kind, mimeType: asset.kind === "css" ? "text/css" : "application/javascript", url: asset.url })) continue;
    const current = byUrl.get(asset.url);
    const normalized = {
      url: String(asset.url),
      kind: asset.kind === "css" ? "css" : "js",
      status: nonNegativeInteger(asset.status),
      transferBytes: nonNegativeInteger(asset.transferBytes),
      durationMs: Number.isFinite(asset.durationMs) ? Math.max(0, Math.round(asset.durationMs * 10) / 10) : null,
      fromDiskCache: Boolean(asset.fromDiskCache),
      fromServiceWorker: Boolean(asset.fromServiceWorker),
      requestCount: 1,
    };
    if (!current) {
      byUrl.set(normalized.url, normalized);
      continue;
    }
    current.requestCount += 1;
    current.transferBytes = Math.max(current.transferBytes, normalized.transferBytes);
    current.status = Math.max(current.status, normalized.status);
    current.durationMs = Math.max(current.durationMs ?? 0, normalized.durationMs ?? 0);
    current.fromDiskCache ||= normalized.fromDiskCache;
    current.fromServiceWorker ||= normalized.fromServiceWorker;
  }
  return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
}

export function summariseAssets(assets = []) {
  const unique = dedupeAssets(assets);
  const js = unique.filter(asset => asset.kind === "js");
  const css = unique.filter(asset => asset.kind === "css");
  const sum = rows => rows.reduce((total, asset) => total + asset.transferBytes, 0);
  return {
    assets: unique,
    assetCount: unique.length,
    jsAssetCount: js.length,
    cssAssetCount: css.length,
    totalBytes: sum(unique),
    jsBytes: sum(js),
    cssBytes: sum(css),
  };
}

export function compareStationsToDay(stations = []) {
  const day = stations.find(station => station.id === "day" && station.status === "pass");
  if (!day) return stations.map(station => ({ ...station, extraVsDay: null }));
  const dayUrls = new Set(day.assets.map(asset => asset.url));
  return stations.map(station => {
    const extras = station.assets.filter(asset => !dayUrls.has(asset.url));
    return {
      ...station,
      extraVsDay: {
        assetCount: extras.length,
        bytes: extras.reduce((total, asset) => total + asset.transferBytes, 0),
        urls: extras.map(asset => asset.url),
      },
    };
  });
}
