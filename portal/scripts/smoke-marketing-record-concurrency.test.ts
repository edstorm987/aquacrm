import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createMarketingAssetHandler,
  deleteMarketingAssetHandler,
  listMarketingAssetsHandler,
  updateMarketingAssetHandler,
} from "../src/built-ins/modules/agency-marketing/src/api/handlers";
import { customerProfilesHandler } from "../src/built-ins/modules/agency-marketing/src/api/handlers-customer-profiles";
import type { PluginCtx, PluginStorage } from "../src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes";

function context(): PluginCtx {
  const values = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string) { return values.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
  return { agencyId: "agency_marketing_concurrency", storage } as unknown as PluginCtx;
}

/**
 * Two server instances of the same agency. Each instance keeps its own hydrated
 * snapshot (as `getState()` does in a real process) and writes through to the
 * shared durable store; only `runExclusive` re-hydrates that snapshot, and it
 * does so inside a lock shared by both instances — the same shape as
 * `withPortalStateTransaction` (ensureHydrated({fresh:true}) → operation →
 * flush, under a file lock or a Supabase/Postgres lease).
 */
function cluster() {
  const durable = new Map<string, unknown>();
  let lockTail: Promise<void> = Promise.resolve();

  function instance(): PluginCtx {
    const hydrated = new Map(durable);
    const storage: PluginStorage & {
      runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
    } = {
      async get<T = unknown>(key: string) { return hydrated.get(key) as T | undefined; },
      async set<T = unknown>(key: string, value: T) {
        const stored = structuredClone(value);
        hydrated.set(key, stored);
        durable.set(key, stored);
      },
      async del(key: string) { hydrated.delete(key); durable.delete(key); },
      async list(prefix = "") { return [...hydrated.keys()].filter(key => key.startsWith(prefix)); },
      async runExclusive<T>(_key: string, operation: () => Promise<T>) {
        const previous = lockTail;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        lockTail = previous.then(() => gate);
        await previous;
        try {
          hydrated.clear();
          for (const [key, value] of durable) hydrated.set(key, value);
          return await operation();
        } finally {
          release();
        }
      },
    };
    return { agencyId: "agency_marketing_cluster", storage } as unknown as PluginCtx;
  }

  return { instance };
}

function assetRequest(name: string): Request {
  return new Request("http://localhost/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "social", name, platform: "LinkedIn", status: "active" }),
  });
}

function profileRequest(name: string): Request {
  return new Request("http://localhost/customer-profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, audienceType: "business", status: "active" }),
  });
}

describe("Mounted Marketing record concurrency", () => {
  it("preserves every acknowledged asset and customer-profile create", async () => {
    const ctx = context();
    const responses = await Promise.all([
      createMarketingAssetHandler(assetRequest("Asset alpha"), ctx),
      createMarketingAssetHandler(assetRequest("Asset bravo"), ctx),
      customerProfilesHandler(profileRequest("Profile alpha"), ctx),
      customerProfilesHandler(profileRequest("Profile bravo"), ctx),
    ]);
    assert.deepEqual(responses.map(response => response.status), [201, 201, 201, 201]);

    const assetList = await listMarketingAssetsHandler(new Request("http://localhost/assets"), ctx);
    const assets = (await assetList.json()) as { assets: Array<{ name: string }> };
    assert.deepEqual(assets.assets.map(asset => asset.name).sort(), ["Asset alpha", "Asset bravo"]);

    const profileList = await customerProfilesHandler(new Request("http://localhost/customer-profiles"), ctx);
    const profiles = (await profileList.json()) as { profiles: Array<{ name: string }> };
    assert.deepEqual(profiles.profiles.map(profile => profile.name).sort(), ["Profile alpha", "Profile bravo"]);
  });

  it("returns one visible stale conflict when two tabs edit the same asset version", async () => {
    const ctx = context();
    const createdResponse = await createMarketingAssetHandler(assetRequest("Shared asset"), ctx);
    const created = (await createdResponse.json()) as { asset: { id: string; updatedAt: number } };
    const patch = (name: string) => new Request("http://localhost/assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: created.asset.id,
        expectedUpdatedAt: created.asset.updatedAt,
        patch: { name },
      }),
    });
    const responses = await Promise.all([
      updateMarketingAssetHandler(patch("First tab"), ctx),
      updateMarketingAssetHandler(patch("Second tab"), ctx),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const conflict = responses.find(response => response.status === 409);
    assert.match(String((await conflict?.json() as { error?: string }).error), /changed in another tab/i);

    const listResponse = await listMarketingAssetsHandler(new Request("http://localhost/assets"), ctx);
    const list = (await listResponse.json()) as { assets: Array<{ name: string }> };
    assert.equal(list.assets.length, 1);
    assert.ok(["First tab", "Second tab"].includes(list.assets[0]?.name ?? ""));
  });

  it("refuses a stale delete and removes only the reviewed asset version", async () => {
    const ctx = context();
    const createdResponse = await createMarketingAssetHandler(assetRequest("Delete review"), ctx);
    const created = (await createdResponse.json()) as { asset: { id: string; updatedAt: number } };
    const updateResponse = await updateMarketingAssetHandler(new Request("http://localhost/assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: created.asset.id,
        expectedUpdatedAt: created.asset.updatedAt,
        patch: { owner: "Latest owner" },
      }),
    }), ctx);
    const updated = (await updateResponse.json()) as { asset: { updatedAt: number } };

    const staleDelete = await deleteMarketingAssetHandler(new Request(
      `http://localhost/assets?id=${created.asset.id}&updatedAt=${created.asset.updatedAt}`,
      { method: "DELETE" },
    ), ctx);
    assert.equal(staleDelete.status, 409);
    const acceptedDelete = await deleteMarketingAssetHandler(new Request(
      `http://localhost/assets?id=${created.asset.id}&updatedAt=${updated.asset.updatedAt}`,
      { method: "DELETE" },
    ), ctx);
    assert.equal(acceptedDelete.status, 200);
    const listResponse = await listMarketingAssetsHandler(new Request("http://localhost/assets"), ctx);
    assert.equal(((await listResponse.json()) as { assets: unknown[] }).assets.length, 0);
  });

  it("returns one visible stale conflict when two tabs edit the same profile version", async () => {
    const ctx = context();
    const createdResponse = await customerProfilesHandler(profileRequest("Shared profile"), ctx);
    const created = (await createdResponse.json()) as { profile: { id: string; updatedAt: number } };
    const patch = (summary: string) => new Request("http://localhost/customer-profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: created.profile.id,
        expectedUpdatedAt: created.profile.updatedAt,
        patch: { summary },
      }),
    });
    const responses = await Promise.all([
      customerProfilesHandler(patch("First tab"), ctx),
      customerProfilesHandler(patch("Second tab"), ctx),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const conflict = responses.find(response => response.status === 409);
    assert.match(String((await conflict?.json() as { error?: string }).error), /changed in another tab/i);
  });

  it("refuses a stale asset edit raised on a second server instance", async () => {
    const farm = cluster();
    const instanceOne = farm.instance();
    const createdResponse = await createMarketingAssetHandler(assetRequest("Shared across instances"), instanceOne);
    const created = (await createdResponse.json()) as { asset: { id: string; updatedAt: number } };

    // A second server process, started with the record already committed.
    const instanceTwo = farm.instance();
    const openedResponse = await listMarketingAssetsHandler(new Request("http://localhost/assets"), instanceTwo);
    const opened = (await openedResponse.json()) as { assets: Array<{ id: string; updatedAt: number }> };
    assert.equal(opened.assets[0]?.id, created.asset.id);

    const patch = (name: string) => new Request("http://localhost/assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: created.asset.id, expectedUpdatedAt: created.asset.updatedAt, patch: { name } }),
    });
    const accepted = await updateMarketingAssetHandler(patch("Edited on instance one"), instanceOne);
    assert.equal(accepted.status, 200);

    const stale = await updateMarketingAssetHandler(patch("Edited on instance two"), instanceTwo);
    assert.equal(stale.status, 409);
    const conflict = (await stale.json()) as { error?: string; current?: { name?: string } };
    assert.match(String(conflict.error), /changed in another tab/i);
    assert.equal(conflict.current?.name, "Edited on instance one");

    const restarted = farm.instance();
    const listResponse = await listMarketingAssetsHandler(new Request("http://localhost/assets"), restarted);
    const list = (await listResponse.json()) as { assets: Array<{ name: string }> };
    assert.deepEqual(list.assets.map(asset => asset.name), ["Edited on instance one"]);
  });

  it("refuses a stale asset delete raised on a second server instance", async () => {
    const farm = cluster();
    const instanceOne = farm.instance();
    const createdResponse = await createMarketingAssetHandler(assetRequest("Delete across instances"), instanceOne);
    const created = (await createdResponse.json()) as { asset: { id: string; updatedAt: number } };
    const instanceTwo = farm.instance();

    const updateResponse = await updateMarketingAssetHandler(new Request("http://localhost/assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: created.asset.id,
        expectedUpdatedAt: created.asset.updatedAt,
        patch: { owner: "Owner set on instance one" },
      }),
    }), instanceOne);
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as { asset: { updatedAt: number } };

    const staleDelete = await deleteMarketingAssetHandler(new Request(
      `http://localhost/assets?id=${created.asset.id}&updatedAt=${created.asset.updatedAt}`,
      { method: "DELETE" },
    ), instanceTwo);
    assert.equal(staleDelete.status, 409);

    const survivorResponse = await listMarketingAssetsHandler(new Request("http://localhost/assets"), farm.instance());
    const survivors = (await survivorResponse.json()) as { assets: Array<{ owner?: string }> };
    assert.deepEqual(survivors.assets.map(asset => asset.owner), ["Owner set on instance one"]);

    const acceptedDelete = await deleteMarketingAssetHandler(new Request(
      `http://localhost/assets?id=${created.asset.id}&updatedAt=${updated.asset.updatedAt}`,
      { method: "DELETE" },
    ), instanceTwo);
    assert.equal(acceptedDelete.status, 200);
    const afterResponse = await listMarketingAssetsHandler(new Request("http://localhost/assets"), farm.instance());
    assert.equal(((await afterResponse.json()) as { assets: unknown[] }).assets.length, 0);
  });

  it("refuses a stale customer-profile edit raised on a second server instance", async () => {
    const farm = cluster();
    const instanceOne = farm.instance();
    const createdResponse = await customerProfilesHandler(profileRequest("Profile across instances"), instanceOne);
    const created = (await createdResponse.json()) as { profile: { id: string; updatedAt: number } };
    const instanceTwo = farm.instance();

    const patch = (summary: string) => new Request("http://localhost/customer-profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: created.profile.id, expectedUpdatedAt: created.profile.updatedAt, patch: { summary } }),
    });
    assert.equal((await customerProfilesHandler(patch("Summary from instance one"), instanceOne)).status, 200);

    const stale = await customerProfilesHandler(patch("Summary from instance two"), instanceTwo);
    assert.equal(stale.status, 409);
    const conflict = (await stale.json()) as { error?: string; current?: { summary?: string } };
    assert.match(String(conflict.error), /changed in another tab/i);
    assert.equal(conflict.current?.summary, "Summary from instance one");
  });

  it("mounted asset, funnel and profile editors send the version they opened", () => {
    const channels = readFileSync("src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx", "utf8");
    const funnels = readFileSync("src/app/portal/agency/marketing/_FunnelsWorkspace.tsx", "utf8");
    const profiles = readFileSync("src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx", "utf8");
    assert.match(channels, /expectedUpdatedAt: draft\.expectedUpdatedAt/);
    assert.match(channels, /expectedUpdatedAt: asset\.updatedAt/);
    assert.match(funnels, /expectedUpdatedAt: draft\.expectedUpdatedAt/);
    assert.match(profiles, /expectedUpdatedAt: draft\.expectedUpdatedAt/);
  });
});
