import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes";
import { inspectEnv } from "../src/lib/server/env";

process.env.NODE_ENV = "test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLACE_ID = "ChIJj61dQgK6j4AR4GeTYWZsKWw";
const MOVED_PLACE_ID = "ChIJ05IRjKHxEQ0RJLV_5NLdK2w";

let ProspectService: typeof import("../src/built-ins/modules/leads-pipeline/src/server/prospects")["ProspectService"];
let googlePlacesSearchHandler: typeof import("../src/built-ins/modules/leads-pipeline/src/api/googlePlaces")["googlePlacesSearchHandler"];

before(async () => {
  ({ ProspectService } = await import("../src/built-ins/modules/leads-pipeline/src/server/prospects"));
  ({ googlePlacesSearchHandler } = await import("../src/built-ins/modules/leads-pipeline/src/api/googlePlaces"));
});

function memoryStorage() {
  const values = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { values.set(key, value); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
  return { storage, values };
}

function pluginCtx(
  storage: PluginStorage = memoryStorage().storage,
  onActivity: (input: Record<string, unknown>) => void = () => {},
): PluginCtx {
  return {
    agencyId: "agency_google_places" as never,
    actor: "user_google_places" as never,
    install: { id: "install_google_places", config: {} } as never,
    storage,
    services: {
      activity: {
        logActivity(input: Record<string, unknown>) {
          onActivity(input);
          return {} as never;
        },
        listActivity: () => [],
      },
    } as never,
  };
}

function allowedThrottle() {
  return { allowed: true, remaining: 29, resetAt: Date.now() + 60_000, retryAfterSec: 0 };
}

function outboundResponse(body: unknown, status = 200) {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    finalUrl: "https://places.googleapis.com/v1/places:searchText",
    headers: {},
    bodyText,
    bytes: Buffer.byteLength(bodyText),
    redirectCount: 0,
    pinnedAddresses: ["142.250.0.1"],
  };
}

describe("Google Place ID prospect persistence", () => {
  it("normalises, updates, and re-reads the durable opaque identifier", async () => {
    const world = memoryStorage();
    const service = new ProspectService(
      "agency_google_places" as never,
      world.storage,
      { logActivity: () => ({}) } as never,
      { emit: () => {} } as never,
    );
    const created = await service.create({
      company: "Opaque Place Ltd",
      googlePlaceId: `  ${PLACE_ID}  `,
      source: "google-places",
    }, "user_google_places" as never);
    assert.equal(created.googlePlaceId, PLACE_ID);
    assert.equal((await service.get(created.id))?.googlePlaceId, PLACE_ID);

    const updated = await service.update(created.id, { googlePlaceId: ` ${MOVED_PLACE_ID} ` }, "user_google_places" as never);
    assert.equal(updated?.googlePlaceId, MOVED_PLACE_ID);

    const opaqueId = "../../opaque:id?future-format=true";
    const stored = world.values.get(`prospect:${created.id}`) as Record<string, unknown>;
    world.values.set(`prospect:${created.id}`, { ...stored, googlePlaceId: ` ${opaqueId} ` });
    assert.equal((await service.get(created.id))?.googlePlaceId, opaqueId,
      "opaque provider identifiers must not be rejected by an invented format contract");
  });

  it("refuses non-text Place IDs without constraining Google's opaque format", async () => {
    const world = memoryStorage();
    const service = new ProspectService(
      "agency_google_places" as never,
      world.storage,
      { logActivity: () => ({}) } as never,
      { emit: () => {} } as never,
    );
    await assert.rejects(
      service.create({ company: "Unsafe", googlePlaceId: 42 as never, source: "google-places" }, "actor" as never),
      /Google Place ID is invalid/,
    );
    assert.equal(world.values.size, 0);
  });

  it("does not save a provider-only identity with no operator-entered label", async () => {
    const world = memoryStorage();
    const service = new ProspectService(
      "agency_google_places" as never,
      world.storage,
      { logActivity: () => ({}) } as never,
      { emit: () => {} } as never,
    );
    await assert.rejects(
      service.create({ googlePlaceId: PLACE_ID, source: "google-places" }, "actor" as never),
      /Add a business name, person, or website/,
    );
    assert.equal(world.values.size, 0);
  });
});

describe("Prospect link persistence boundary", () => {
  it("canonicalises ordinary browser links and supported Google Maps URL variants", async () => {
    const world = memoryStorage();
    const service = new ProspectService(
      "agency_google_places" as never,
      world.storage,
      { logActivity: () => ({}) } as never,
      { emit: () => {} } as never,
    );
    const created = await service.create({
      company: "Safe Links Ltd",
      source: "manual",
      website: "  HTTPS://Example.COM/path?ref=scout  ",
      instagramUrl: "http://www.instagram.com/safe-links",
      facebookUrl: "https://m.facebook.com/safe-links",
      linkedinUrl: "https://uk.linkedin.com/company/safe-links",
      googleMapsUrl: "https://maps.google.com/?cid=123",
    }, "actor" as never);

    assert.equal(created.website, "https://example.com/path?ref=scout");
    assert.equal(created.instagramUrl, "http://www.instagram.com/safe-links");
    assert.equal(created.facebookUrl, "https://m.facebook.com/safe-links");
    assert.equal(created.linkedinUrl, "https://uk.linkedin.com/company/safe-links");

    const supportedMapsUrls = [
      "https://maps.google.com/?cid=123",
      "https://maps.google.co.uk/?cid=456",
      "https://www.google.com/maps/place/Safe+Links",
      "https://google.co.uk/maps/search/Safe+Links",
      "https://maps.app.goo.gl/AbCd123",
      "https://goo.gl/maps/AbCd123",
    ];
    for (const googleMapsUrl of supportedMapsUrls) {
      const updated = await service.update(created.id, { googleMapsUrl }, "actor" as never);
      assert.equal(updated?.googleMapsUrl, new URL(googleMapsUrl).toString());
      assert.equal((await service.get(created.id))?.googleMapsUrl, new URL(googleMapsUrl).toString());
    }
  });

  it("rejects active-content, credentialed, and non-Google Maps links before storage", async () => {
    const world = memoryStorage();
    const service = new ProspectService(
      "agency_google_places" as never,
      world.storage,
      { logActivity: () => ({}) } as never,
      { emit: () => {} } as never,
    );

    await assert.rejects(
      service.create({ company: "Unsafe", source: "manual", website: "javascript:alert(1)" }, "actor" as never),
      /Website must be a safe http\(s\) URL/,
    );
    await assert.rejects(
      service.create({ company: "Unsafe", source: "manual", instagramUrl: "data:text/html,<script>alert(1)</script>" }, "actor" as never),
      /Instagram link must be a safe http\(s\) URL/,
    );
    await assert.rejects(
      service.create({ company: "Unsafe", source: "manual", facebookUrl: "file:\/\/\/etc\/passwd" }, "actor" as never),
      /Facebook link must be a safe http\(s\) URL/,
    );
    await assert.rejects(
      service.create({ company: "Unsafe", source: "manual", linkedinUrl: "https://user:secret@example.com/profile" }, "actor" as never),
      /LinkedIn link must be a safe http\(s\) URL/,
    );
    await assert.rejects(
      service.create({ company: "Unsafe", source: "manual", googleMapsUrl: "https://evil.example/maps/place/Unsafe" }, "actor" as never),
      /Google Maps listing must be a safe Google Maps http\(s\) URL/,
    );
    await assert.rejects(
      service.create({ company: "Unsafe", source: "manual", googleMapsUrl: "https://www.google.com/search?q=maps" }, "actor" as never),
      /Google Maps listing must be a safe Google Maps http\(s\) URL/,
    );
    assert.equal(world.values.size, 0, "rejected links must not create a prospect or index entry");
  });

  it("fails closed for unsafe legacy values and rejects unsafe updates without corrupting the record", async () => {
    const world = memoryStorage();
    const service = new ProspectService(
      "agency_google_places" as never,
      world.storage,
      { logActivity: () => ({}) } as never,
      { emit: () => {} } as never,
    );
    const created = await service.create({
      company: "Legacy Links Ltd",
      source: "manual",
      website: "https://safe.example/profile",
    }, "actor" as never);

    await assert.rejects(
      service.update(created.id, { website: "data:text/html,unsafe" }, "actor" as never),
      /Website must be a safe http\(s\) URL/,
    );
    assert.equal((await service.get(created.id))?.website, "https://safe.example/profile");

    const stored = world.values.get(`prospect:${created.id}`) as Record<string, unknown>;
    world.values.set(`prospect:${created.id}`, {
      ...stored,
      website: "javascript:alert(1)",
      googleMapsUrl: "https://maps.google.com.evil.example/place/Unsafe",
      instagramUrl: "data:text/html,unsafe",
      facebookUrl: "file:///etc/passwd",
      linkedinUrl: "https://user:secret@example.com/profile",
    });
    const normalized = await service.get(created.id);
    assert.ok(normalized, "the prospect itself must remain available");
    assert.equal(normalized.company, "Legacy Links Ltd");
    assert.equal(normalized.website, undefined);
    assert.equal(normalized.googleMapsUrl, undefined);
    assert.equal(normalized.instagramUrl, undefined);
    assert.equal(normalized.facebookUrl, undefined);
    assert.equal(normalized.linkedinUrl, undefined);

    const cleared = await service.update(created.id, { website: "" }, "actor" as never);
    assert.equal(cleared?.website, undefined);
    assert.equal((world.values.get(`prospect:${created.id}`) as Record<string, unknown>).website, undefined);
  });
});

describe("Google Places scouting endpoint", () => {
  it("fails the production env check when a public Embed key reuses the server Places secret", () => {
    const issues = inspectEnv({
      NODE_ENV: "production",
      GOOGLE_PLACES_API_KEY: "one-key-must-not-cross-both-boundaries",
      NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY: "one-key-must-not-cross-both-boundaries",
    });
    assert.ok(issues.some(issue => issue.name === "GOOGLE_PLACES_API_KEY"
      && issue.severity === "error"
      && issue.reason.includes("must differ")));

    const invalidQuota = inspectEnv({
      NODE_ENV: "production",
      GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY: "1day",
    });
    assert.ok(invalidQuota.some(issue => issue.name === "GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY"
      && issue.severity === "error"
      && issue.reason.includes("1 to 10000")));
  });

  it("uses the fixed brokered provider request and returns only the approved sanitized schema", async () => {
    let outbound: Parameters<NonNullable<import("../src/built-ins/modules/leads-pipeline/src/api/googlePlaces").GooglePlacesSearchDependencies["brokeredFetch"]>>[0] | undefined;
    let providerGate = "";
    const world = memoryStorage();
    const audits: Array<Record<string, unknown>> = [];
    const response = await googlePlacesSearchHandler(new Request(
      "https://portal.test/api/portal/leads-pipeline/google-places/search",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8" },
        body: JSON.stringify({
          query: "  plumbers   in Stafford  ",
          regionCode: "gb",
          locationBias: { latitude: 52.8067, longitude: -2.1164, radiusMeters: 8_000 },
        }),
      },
    ), pluginCtx(world.storage, input => audits.push(input)), {
      env: { GOOGLE_PLACES_API_KEY: "server-only-test-key" },
      mayUseEnvironmentCredentials: () => true,
      rateLimit: allowedThrottle,
      assertLiveProviderAccess: provider => { providerGate = provider; },
      brokeredFetch: async request => {
        outbound = request;
        return outboundResponse({
          places: [
            {
              id: PLACE_ID,
              displayName: { text: "  Example\u0000 Plumbing  " },
              formattedAddress: "  1 High Street\nStafford  ",
              googleMapsUri: "https://maps.google.com/?cid=123",
              primaryType: "plumber",
              internationalPhoneNumber: "+44 1785 000 000",
              websiteUri: "javascript:alert(1)",
              businessStatus: "OPERATIONAL",
              attributions: Array.from({ length: 10 }, (_, index) => ({
                provider: `Example Data ${index + 1}`,
                providerUri: `https://example.com/source/${index + 1}`,
              })),
              reviews: [{ text: "must never leave the provider adapter" }],
            },
            { id: 42, displayName: { text: "Drop me" } },
          ],
        });
      },
    });

    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(providerGate, "Google Places business search");
    assert.equal(outbound?.url, "https://places.googleapis.com/v1/places:searchText");
    assert.equal(outbound?.method, "POST");
    assert.deepEqual(outbound?.policy, { allowHostSuffixes: ["places.googleapis.com"] });
    assert.equal(outbound?.followRedirects, false);
    assert.equal(outbound?.headers?.["x-goog-api-key"], "server-only-test-key");
    assert.equal(outbound?.headers?.["x-goog-fieldmask"], [
      "places.id",
      "places.attributions",
      "places.displayName",
      "places.formattedAddress",
      "places.googleMapsUri",
      "places.primaryType",
      "places.internationalPhoneNumber",
      "places.websiteUri",
      "places.businessStatus",
    ].join(","));
    assert.deepEqual(JSON.parse(String(outbound?.body)), {
      textQuery: "plumbers in Stafford",
      pageSize: 10,
      regionCode: "GB",
      locationBias: {
        circle: {
          center: { latitude: 52.8067, longitude: -2.1164 },
          radius: 8_000,
        },
      },
    });
    const responseBody = await response.json() as { ok: boolean; places: Array<Record<string, unknown>> };
    assert.deepEqual(responseBody, {
      ok: true,
      places: [{
        placeId: PLACE_ID,
        displayName: "Example Plumbing",
        formattedAddress: "1 High Street Stafford",
        googleMapsUri: "https://maps.google.com/?cid=123",
        primaryType: "plumber",
        phone: "+44 1785 000 000",
        businessStatus: "OPERATIONAL",
        attributions: Array.from({ length: 10 }, (_, index) => ({
          provider: `Example Data ${index + 1}`,
          providerUri: `https://example.com/source/${index + 1}`,
        })),
      }],
    });
    assert.equal((responseBody.places[0]?.attributions as unknown[])?.length, 10,
      "required provider attributions must never be silently truncated");
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.action, "leads.google-places.searched");
    assert.deepEqual(audits[0]?.metadata, { resultCount: 1, dailyLimit: 500 });
    assert.ok(!JSON.stringify(audits).includes("plumbers in Stafford"), "search text must not enter durable audit activity");
  });

  it("enforces a durable per-tenant daily paid-search ceiling before provider egress", async () => {
    const world = memoryStorage();
    const ctx = pluginCtx(world.storage);
    let egressCalls = 0;
    const request = () => new Request("https://portal.test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "cafes in York" }),
    });
    const dependencies = {
      env: {
        GOOGLE_PLACES_API_KEY: "test-key",
        GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY: "1",
      },
      now: () => Date.parse("2026-09-11T12:00:00.000Z"),
      mayUseEnvironmentCredentials: () => true,
      rateLimit: allowedThrottle,
      assertLiveProviderAccess: () => {},
      brokeredFetch: async () => {
        egressCalls += 1;
        return outboundResponse({ places: [] });
      },
    };

    const first = await googlePlacesSearchHandler(request(), ctx, dependencies);
    const second = await googlePlacesSearchHandler(request(), ctx, dependencies);
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.deepEqual(await second.json(), { ok: false, error: "google_places_daily_quota_exhausted" });
    assert.equal(second.headers.get("retry-after"), String(12 * 60 * 60));
    assert.equal(egressCalls, 1);
    assert.deepEqual(world.values.get("google-places:daily-quota"), { day: "2026-09-11", count: 1 });
  });

  it("does not partially parse a malformed quota and fails closed when durable quota storage is unavailable", async () => {
    const request = () => new Request("https://portal.test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "cafes in York" }),
    });
    const world = memoryStorage();
    let egressCalls = 0;
    const dependencies = {
      env: {
        GOOGLE_PLACES_API_KEY: "test-key",
        GOOGLE_PLACES_SEARCHES_PER_TENANT_DAY: "1day",
      },
      mayUseEnvironmentCredentials: () => true,
      rateLimit: allowedThrottle,
      assertLiveProviderAccess: () => {},
      brokeredFetch: async () => {
        egressCalls += 1;
        return outboundResponse({ places: [] });
      },
    };
    assert.equal((await googlePlacesSearchHandler(request(), pluginCtx(world.storage), dependencies)).status, 200);
    assert.equal((await googlePlacesSearchHandler(request(), pluginCtx(world.storage), dependencies)).status, 200,
      "a malformed quota must use the safe default rather than parse an attacker-controlled numeric prefix");

    const unavailableStorage: PluginStorage = {
      ...world.storage,
      async runExclusive<T>(_key: string, _operation: () => Promise<T>): Promise<T> {
        throw new Error("storage unavailable");
      },
    };
    const unavailable = await googlePlacesSearchHandler(request(), pluginCtx(unavailableStorage), dependencies);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { ok: false, error: "google_places_quota_unavailable" });
    assert.equal(egressCalls, 2, "paid provider egress must not run when the durable budget cannot be advanced");
  });

  it("rejects unknown input fields, invalid control characters, and oversized bodies before egress", async () => {
    let calls = 0;
    const invoke = (body: string) => googlePlacesSearchHandler(new Request("https://portal.test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }), pluginCtx(), {
      env: { GOOGLE_PLACES_API_KEY: "test-key" },
      mayUseEnvironmentCredentials: () => true,
      rateLimit: allowedThrottle,
      assertLiveProviderAccess: () => {},
      brokeredFetch: async () => { calls += 1; return outboundResponse({}); },
    });

    const unknown = await invoke(JSON.stringify({ query: "cafes in York", pageToken: "user-controlled" }));
    assert.equal(unknown.status, 400);
    assert.deepEqual(await unknown.json(), { ok: false, error: "invalid_search_request" });
    const control = await invoke(JSON.stringify({ query: "cafes\u0000in York" }));
    assert.equal(control.status, 400);
    const oversized = await invoke(JSON.stringify({ query: "x".repeat(5_000) }));
    assert.equal(oversized.status, 413);
    assert.equal(calls, 0);
  });

  it("fails closed when unconfigured, sandbox-blocked, locally throttled, or given malformed provider data", async () => {
    const request = () => new Request("https://portal.test/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "dentists in Lichfield" }),
    });
    const unconfigured = await googlePlacesSearchHandler(request(), pluginCtx(), {
      env: {}, rateLimit: allowedThrottle,
    });
    assert.equal(unconfigured.status, 503);
    assert.deepEqual(await unconfigured.json(), { ok: false, error: "google_places_not_configured" });

    let tenantEgress = 0;
    const nonFounderTenant = await googlePlacesSearchHandler(request(), pluginCtx(), {
      env: { GOOGLE_PLACES_API_KEY: "founder-deployment-key" },
      mayUseEnvironmentCredentials: () => false,
      rateLimit: allowedThrottle,
      brokeredFetch: async () => {
        tenantEgress += 1;
        return outboundResponse({ places: [] });
      },
    });
    assert.equal(nonFounderTenant.status, 503);
    assert.deepEqual(await nonFounderTenant.json(), { ok: false, error: "google_places_not_configured" });
    assert.equal(tenantEgress, 0, "a SaaS tenant must never spend the founder deployment's Google key");

    const sandboxError = new Error("do not leak this message");
    sandboxError.name = "SandboxProviderBlockedError";
    const sandbox = await googlePlacesSearchHandler(request(), pluginCtx(), {
      env: { GOOGLE_PLACES_API_KEY: "test-key" },
      mayUseEnvironmentCredentials: () => true,
      rateLimit: allowedThrottle,
      assertLiveProviderAccess: () => { throw sandboxError; },
    });
    assert.equal(sandbox.status, 403);
    assert.deepEqual(await sandbox.json(), { ok: false, error: "google_places_blocked_in_sandbox" });

    const throttled = await googlePlacesSearchHandler(request(), pluginCtx(), {
      rateLimit: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 12_000, retryAfterSec: 12 }),
    });
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("retry-after"), "12");
    assert.deepEqual(await throttled.json(), { ok: false, error: "rate_limited" });

    const malformed = await googlePlacesSearchHandler(request(), pluginCtx(), {
      env: { GOOGLE_PLACES_API_KEY: "test-key" },
      mayUseEnvironmentCredentials: () => true,
      rateLimit: allowedThrottle,
      assertLiveProviderAccess: () => {},
      brokeredFetch: async () => outboundResponse("{not-json"),
    });
    assert.equal(malformed.status, 502);
    assert.deepEqual(await malformed.json(), { ok: false, error: "google_places_invalid_response" });
  });

  it("is mounted only as the authenticated owner/manager POST route", () => {
    const routes = readFileSync(join(ROOT, "src/built-ins/modules/leads-pipeline/src/api/routes.ts"), "utf8");
    assert.match(routes, /path:\s*"google-places\/search",\s*methods:\s*\["POST"\],\s*handler:\s*googlePlacesSearchHandler,\s*visibleToRoles:\s*\[\.\.\.AGENCY_ADMIN\]/);
    assert.doesNotMatch(routes, /path:\s*"google-places\/search"[^\n]*public:\s*true/);
  });
});
