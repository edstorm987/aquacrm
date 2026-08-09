import "server-only";

import crypto from "node:crypto";
import type { PerformanceEvent } from "@/lib/performanceAnalytics";

interface ServiceAccountKey {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

interface SearchConsoleRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  position?: number;
}

const SEARCH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export async function testGoogleSearchConsole(
  values: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<string> {
  const events = await fetchGoogleSearchConsoleEvents(values, {
    startDate: dateDaysAgo(8),
    endDate: dateDaysAgo(1),
    rowLimit: 1,
    fetchImpl,
    signal,
  });
  return `Search Console connected to ${values.siteUrl}. ${events.length ? "Search data is available." : "Access is valid; Google returned no rows for the last seven days."}`;
}

export async function fetchGoogleSearchConsoleEvents(
  values: Record<string, string>,
  options: {
    startDate: string;
    endDate: string;
    rowLimit?: number;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<PerformanceEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const siteUrl = values.siteUrl?.trim();
  const propertyId = values.propertyId?.trim();
  if (!siteUrl) throw new Error("Search Console property is missing.");
  if (!propertyId) throw new Error("Aqua property ID is missing.");

  const accessToken = await serviceAccountAccessToken(values.serviceAccountJson, fetchImpl, options.signal);
  const response = await fetchImpl(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate: options.startDate,
        endDate: options.endDate,
        dimensions: ["date", "page", "query"],
        dataState: "all",
        rowLimit: Math.max(1, Math.min(options.rowLimit ?? 5_000, 25_000)),
      }),
      cache: "no-store",
      signal: options.signal,
    },
  );
  const payload = await response.json().catch(() => null) as { rows?: SearchConsoleRow[]; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || `Search Console returned ${response.status}.`);

  return (payload?.rows ?? []).map((row, index) => {
    const [date, page, query] = row.keys ?? [];
    return {
      type: "search",
      propertyId,
      occurredAt: date ? Date.parse(`${date}T12:00:00Z`) : Date.now(),
      path: pagePath(page),
      query: query?.slice(0, 300),
      clicks: finiteCount(row.clicks),
      impressions: finiteCount(row.impressions),
      position: typeof row.position === "number" && Number.isFinite(row.position) ? row.position : undefined,
      metric: `search-console:${index}`,
    };
  });
}

async function serviceAccountAccessToken(
  rawJson: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  let key: ServiceAccountKey;
  try {
    key = JSON.parse(rawJson || "") as ServiceAccountKey;
  } catch {
    throw new Error("The service account JSON is not valid JSON.");
  }
  if (!key.client_email || !key.private_key) throw new Error("The service account JSON is missing its email or private key.");
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1_000);
  const assertion = signedJwt(
    { alg: "RS256", typ: "JWT" },
    { iss: key.client_email, scope: SEARCH_SCOPE, aud: tokenUri, iat: now, exp: now + 3_600 },
    key.private_key,
  );
  const response = await fetchImpl(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; error_description?: string; error?: string } | null;
  if (!response.ok || !payload?.access_token) throw new Error(payload?.error_description || payload?.error || "Google did not issue an access token.");
  return payload.access_token;
}

function signedJwt(header: object, claims: object, privateKey: string): string {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedClaims = base64Url(JSON.stringify(claims));
  const input = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
  return `${input}.${signature}`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function pagePath(value?: string): string {
  if (!value) return "/";
  try {
    return new URL(value).pathname || "/";
  } catch {
    return value.startsWith("/") ? value : `/${value}`;
  }
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
