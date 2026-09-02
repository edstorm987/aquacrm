// Private staged-upload owner binding.
//
// Proves the durable lifecycle and the mounted campaign command agree on the
// exact lifecycle id, provider and provider key before an owner can become
// authoritative. The commit-side case deliberately changes the confirmed key
// after claim to pin the re-check beside the owner mutation.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

process.env.PORTAL_BACKEND = "memory";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type Lifecycle = typeof import("../src/lib/server/privateObjectLifecycle");
type PortalStorage = typeof import("../src/server/storage");
let lifecycle: Lifecycle;
let portalStorage: PortalStorage;

before(async () => {
  [lifecycle, portalStorage] = await Promise.all([
    import("../src/lib/server/privateObjectLifecycle"),
    import("../src/server/storage"),
  ]);
  await portalStorage.ensureHydrated();
});

async function stage(input: {
  agencyId: string;
  purpose: string;
  objectId: string;
  provider: "local" | "supabase" | "vercel-blob";
  key: string;
}): Promise<string> {
  const requestHash = lifecycle.privateObjectRequestHash([
    input.agencyId,
    input.purpose,
    input.objectId,
    input.provider,
    input.key,
  ]);
  await lifecycle.beginStagedPrivateUpload({
    agencyId: input.agencyId,
    purpose: input.purpose,
    objectId: input.objectId,
    requestHash,
    planned: { storageProvider: input.provider, storageKey: input.key },
    localDirectory: "owner-binding-smoke",
  });
  await lifecycle.confirmStagedPrivateUpload({
    agencyId: input.agencyId,
    purpose: input.purpose,
    objectId: input.objectId,
    requestHash,
    stored: { storageProvider: input.provider, storageKey: input.key },
  });
  return requestHash;
}

describe("private upload owner binding", () => {
  it("derives expense content URLs from the provider metadata instead of trusting the browser", async () => {
    const { canonicalExpenseAttachment } = await import(
      "../src/built-ins/modules/agency-finance/src/lib/expenseAttachments"
    );
    const attachment = canonicalExpenseAttachment({
      id: "exa_canonical",
      name: " receipt one.pdf ",
      url: "/api/portal/finance/expense-attachments/content?provider=supabase&key=forged",
      size: 321,
      contentType: "application/pdf",
      storageProvider: "local",
      storageKey: "agency_canonical/exa_canonical-receipt.pdf",
      uploadedAt: 123,
    });
    const url = new URL(attachment.url, "http://localhost");
    assert.equal(attachment.name, "receipt one.pdf");
    assert.equal(url.pathname, "/api/portal/finance/expense-attachments/content");
    assert.equal(url.searchParams.get("id"), attachment.id);
    assert.equal(url.searchParams.get("provider"), attachment.storageProvider);
    assert.equal(url.searchParams.get("key"), attachment.storageKey);
    assert.equal(url.searchParams.get("name"), attachment.name);
    assert.equal(url.searchParams.get("type"), attachment.contentType);
    assert.equal(url.searchParams.get("size"), String(attachment.size));
  });

  it("refuses a forged provider or key before changing the lifecycle state", async () => {
    const agencyId = `agency_owner_binding_${Date.now()}`;
    const objectId = "creative_exact_metadata";
    const key = `${agencyId}/creative_exact_metadata.png`;
    await stage({ agencyId, purpose: "campaign-asset", objectId, provider: "local", key });

    for (const binding of [
      { objectId, storageProvider: "supabase" as const, storageKey: key },
      { objectId, storageProvider: "local" as const, storageKey: `${key}.forged` },
    ]) {
      await assert.rejects(
        lifecycle.claimStagedPrivateUploadsForOwnership({
          agencyId,
          purpose: "campaign-asset",
          objectIds: [objectId],
          expectedBindings: [binding],
        }),
        lifecycle.PrivateObjectLifecycleClaimError,
      );
      const record = Object.values(portalStorage.getState().privateObjectLifecycles)
        .find(item => item.agencyId === agencyId && item.objectId === objectId);
      assert.equal(record?.state, "uploading", "a refused binding must remain reclaimable by the exact owner intent");
    }
  });

  it("re-checks exact provider metadata beside commit and never runs a stale owner mutation", async () => {
    const agencyId = `agency_owner_recheck_${Date.now()}`;
    const objectId = "expense_recheck_metadata";
    const originalKey = `${agencyId}/expense_recheck_metadata.pdf`;
    const requestHash = await stage({
      agencyId,
      purpose: "expense-attachment",
      objectId,
      provider: "local",
      key: originalKey,
    });
    const expectedBindings = [{ objectId, storageProvider: "local" as const, storageKey: originalKey }];
    await lifecycle.claimStagedPrivateUploadsForOwnership({
      agencyId,
      purpose: "expense-attachment",
      objectIds: [objectId],
      expectedBindings,
    });

    const changedKey = `${agencyId}/expense_recheck_metadata-changed.pdf`;
    await lifecycle.confirmStagedPrivateUpload({
      agencyId,
      purpose: "expense-attachment",
      objectId,
      requestHash,
      stored: { storageProvider: "local", storageKey: changedKey },
    });
    let ownerMutationRan = false;
    await assert.rejects(
      lifecycle.commitStagedPrivateUploadOwnership({
        agencyId,
        purpose: "expense-attachment",
        objectIds: [objectId],
        expectedBindings,
        commit: async () => {
          ownerMutationRan = true;
          return { ownerId: "expense_never_written", value: undefined };
        },
      }),
      lifecycle.PrivateObjectLifecycleClaimError,
    );
    assert.equal(ownerMutationRan, false);
    const record = Object.values(portalStorage.getState().privateObjectLifecycles)
      .find(item => item.agencyId === agencyId && item.objectId === objectId);
    assert.equal(record?.state, "claiming");
    assert.equal(record?.ownerId, undefined);
  });

  it("fences a second claimant and never lets a no-id caller adopt a ready object", async () => {
    const agencyId = `agency_owner_fence_${Date.now()}`;
    const objectId = "expense_owner_fence";
    const key = `${agencyId}/expense_owner_fence.pdf`;
    await stage({ agencyId, purpose: "expense-attachment", objectId, provider: "local", key });
    const expectedBindings = [{ objectId, storageProvider: "local" as const, storageKey: key }];

    await lifecycle.claimStagedPrivateUploadsForOwnership({
      agencyId,
      purpose: "expense-attachment",
      objectIds: [objectId],
      expectedBindings,
      claimId: "expense-owner-one",
    });
    await assert.rejects(
      lifecycle.claimStagedPrivateUploadsForOwnership({
        agencyId,
        purpose: "expense-attachment",
        objectIds: [objectId],
        expectedBindings,
        claimId: "expense-owner-two",
      }),
      /another owner operation/,
    );
    await lifecycle.commitStagedPrivateUploadOwnership({
      agencyId,
      purpose: "expense-attachment",
      objectIds: [objectId],
      expectedBindings,
      claimId: "expense-owner-one",
      commit: async () => ({ ownerId: "expense_owner_one", value: undefined }),
    });
    await assert.rejects(
      lifecycle.claimStagedPrivateUploadsForOwnership({
        agencyId,
        purpose: "expense-attachment",
        objectIds: [objectId],
        expectedBindings,
      }),
      /another owner operation/,
    );
    await assert.rejects(
      lifecycle.claimStagedPrivateUploadsForOwnership({
        agencyId,
        purpose: "expense-attachment",
        objectIds: [objectId],
        expectedBindings,
        claimId: "expense-owner-two",
      }),
      /another owner operation/,
    );
    const record = Object.values(portalStorage.getState().privateObjectLifecycles)
      .find(item => item.agencyId === agencyId && item.objectId === objectId);
    assert.equal(record?.state, "ready");
    assert.equal(record?.ownerId, "expense_owner_one");
  });

  it("the real campaign handler binds exact assets and releases only definite pre-write refusals", async () => {
    const [foundation, handlers] = await Promise.all([
      import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter"),
      import("../src/built-ins/modules/leads-pipeline/src/api/handlers"),
    ]);
    const agencyId = `agency_campaign_binding_${Date.now()}`;
    const actor = "user_campaign_binding";
    const objectId = "creative_campaign_binding";
    const key = `${agencyId}/${objectId}.png`;
    await stage({ agencyId, purpose: "campaign-asset", objectId, provider: "local", key });

    const values = new Map<string, unknown>();
    const storage = {
      async get<T = unknown>(storageKey: string) { return values.get(storageKey) as T | undefined; },
      async set<T = unknown>(storageKey: string, value: T) { values.set(storageKey, structuredClone(value)); },
      async del(storageKey: string) { values.delete(storageKey); },
      async list(prefix = "") { return [...values.keys()].filter(storageKey => storageKey.startsWith(prefix)); },
    };
    const agency = {
      id: agencyId,
      name: "Campaign binding agency",
      slug: "campaign-binding-agency",
      brand: { primaryColor: "#071a33" },
      status: "active" as const,
      createdAt: 0,
      updatedAt: 0,
    };
    const install = {
      id: "install_campaign_binding",
      pluginId: "leads-pipeline",
      agencyId,
      enabled: true,
      config: {},
      features: {},
      installedAt: 0,
      installedBy: actor,
    };
    let failCampaignActivity = false;
    const activity = {
      logActivity: async (input: Record<string, unknown>) => {
        if (failCampaignActivity && input.action === "leads.campaign.created") {
          throw new Error("campaign_activity_post_write_failure");
        }
        return { id: "activity_campaign_binding", ts: Date.now(), ...input };
      },
      listActivity: async () => [],
    };
    const events = { emit: () => undefined };
    foundation.registerLeadsPipelineFoundation({
      tenant: { getAgency: (id: string) => id === agencyId ? agency : null },
      activity,
      events,
      pluginInstalls: { getInstall: () => install },
    });
    const ctx = {
      agencyId,
      actor,
      install,
      storage,
      services: {
        clients: {}, pluginInstalls: {}, pluginRuntime: {}, registry: {}, phases: {},
        activity, events, variants: {}, tenant: { getAgency: () => agency },
      },
    } as never;
    const asset = {
      id: objectId,
      fileName: "creative.png",
      contentType: "image/png",
      size: 128,
      storageProvider: "local" as const,
      storageKey: key,
    };
    type CandidateAsset = Omit<typeof asset, "storageProvider"> & {
      storageProvider: "local" | "supabase" | "vercel-blob";
    };
    const request = (candidate: CandidateAsset, method: "POST" | "PATCH" = "POST", campaignId?: string) => new Request(
      `http://localhost/campaigns${campaignId ? `?id=${encodeURIComponent(campaignId)}` : ""}`,
      {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(method === "POST" ? { name: "Exact campaign asset", channel: "meta-ads", audienceFilter: {} } : {}),
        creative: { placements: ["instagram-feed"], asset: candidate },
      }),
    });

    try {
      const refused = await handlers.createCampaignHandler(request({ ...asset, storageProvider: "supabase" }), ctx);
      assert.equal(refused.status, 422);
      assert.deepEqual(await values.get("campaigns/index") ?? [], []);

      const accepted = await handlers.createCampaignHandler(request(asset), ctx);
      assert.equal(accepted.status, 201);
      const body = await accepted.json() as { campaign: { id: string; creative: { asset: CandidateAsset } } };
      assert.deepEqual(body.campaign.creative.asset, asset);
      const record = Object.values(portalStorage.getState().privateObjectLifecycles)
        .find(item => item.agencyId === agencyId && item.objectId === objectId);
      assert.equal(record?.state, "ready");
      assert.equal(record?.ownerId, body.campaign.id);

      const reused = await handlers.createCampaignHandler(request(asset), ctx);
      assert.equal(reused.status, 422, "a new campaign cannot adopt an asset that already has an owner");
      assert.equal((await values.get("campaigns/index") as string[]).length, 1);

      const changedProvider = await handlers.updateCampaignHandler(
        request({ ...asset, storageProvider: "supabase" }, "PATCH", body.campaign.id),
        ctx,
      );
      assert.equal(changedProvider.status, 422, "provider changes with the same key still require an exact staged claim");
      const stored = await values.get(`campaign:${body.campaign.id}`) as { creative: { asset: CandidateAsset } };
      assert.deepEqual(stored.creative.asset, asset);

      const refusedCreateId = "creative_campaign_refused_create";
      const refusedCreateKey = `${agencyId}/${refusedCreateId}.png`;
      await stage({
        agencyId,
        purpose: "campaign-asset",
        objectId: refusedCreateId,
        provider: "local",
        key: refusedCreateKey,
      });
      const refusedCreateAsset: CandidateAsset = {
        ...asset,
        id: refusedCreateId,
        storageKey: refusedCreateKey,
      };
      const refusedCreate = await handlers.createCampaignHandler(new Request("http://localhost/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Newsletter missing required content",
          channel: "newsletter",
          audienceFilter: {},
          creative: { placements: ["instagram-feed"], asset: refusedCreateAsset },
        }),
      }), ctx);
      assert.equal(refusedCreate.status, 422);
      const refusedCreateLifecycle = Object.values(portalStorage.getState().privateObjectLifecycles)
        .find(item => item.agencyId === agencyId && item.objectId === refusedCreateId);
      assert.equal(refusedCreateLifecycle?.state, "uploading", "a validation refusal before the campaign row write must release its exact claim");
      assert.equal(refusedCreateLifecycle?.claimId, undefined);

      const refusedUpdateId = "creative_campaign_refused_update";
      const refusedUpdateKey = `${agencyId}/${refusedUpdateId}.png`;
      await stage({
        agencyId,
        purpose: "campaign-asset",
        objectId: refusedUpdateId,
        provider: "local",
        key: refusedUpdateKey,
      });
      const refusedUpdateAsset: CandidateAsset = {
        ...asset,
        id: refusedUpdateId,
        storageKey: refusedUpdateKey,
      };
      values.set(`campaign:${body.campaign.id}`, {
        ...(await values.get(`campaign:${body.campaign.id}`) as Record<string, unknown>),
        status: "sent",
      });
      const refusedUpdate = await handlers.updateCampaignHandler(
        request(refusedUpdateAsset, "PATCH", body.campaign.id),
        ctx,
      );
      assert.equal(refusedUpdate.status, 422);
      const refusedUpdateLifecycle = Object.values(portalStorage.getState().privateObjectLifecycles)
        .find(item => item.agencyId === agencyId && item.objectId === refusedUpdateId);
      assert.equal(refusedUpdateLifecycle?.state, "uploading", "a sent-campaign refusal happens before owner mutation and must release the claim");
      assert.equal(refusedUpdateLifecycle?.claimId, undefined);

      const ambiguousId = "creative_campaign_post_write_failure";
      const ambiguousKey = `${agencyId}/${ambiguousId}.png`;
      await stage({
        agencyId,
        purpose: "campaign-asset",
        objectId: ambiguousId,
        provider: "local",
        key: ambiguousKey,
      });
      const ambiguousAsset: CandidateAsset = {
        ...asset,
        id: ambiguousId,
        storageKey: ambiguousKey,
      };
      failCampaignActivity = true;
      const ambiguous = await handlers.createCampaignHandler(request(ambiguousAsset), ctx);
      failCampaignActivity = false;
      assert.equal(ambiguous.status, 422);
      const ambiguousLifecycle = Object.values(portalStorage.getState().privateObjectLifecycles)
        .find(item => item.agencyId === agencyId && item.objectId === ambiguousId);
      assert.equal(ambiguousLifecycle?.state, "claiming", "a failure after the campaign row write must retain the claim for reconciliation");
      assert.ok(ambiguousLifecycle?.claimId);
    } finally {
      failCampaignActivity = false;
      foundation.clearLeadsPipelineFoundation();
    }
  });
});
