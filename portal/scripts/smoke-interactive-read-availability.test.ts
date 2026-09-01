import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  readWebsiteSourceRegistry,
  websiteSourceRegistryPresentation,
} from "../src/lib/client/websiteSourceRegistryRead";
import { readSenderCatalogue } from "../src/lib/client/senderCatalogueRead";
import {
  validDevelopmentResourcePage,
  validPublicDevelopmentResource,
} from "../src/lib/client/developmentResourceRead";

const payload = {
  ok: true as const,
  sources: [{ id: "site_1", host: "client.example", label: "Client", destinationClientId: "client_1" }],
  clients: [{ id: "client_1", name: "Client One" }],
  companies: [{ id: "company_1", name: "Company One", website: "https://company.example" }],
  formSchemasBySource: { site_1: [] },
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("website-source registry checked reads", () => {
  it("accepts only the complete registry contract", async () => {
    const read = await readWebsiteSourceRegistry({ fetcher: async () => json(payload) });
    assert.equal(read.available, true);
    if (read.available) {
      assert.equal(read.data.sources[0]?.host, "client.example");
      assert.equal(read.data.clients[0]?.name, "Client One");
      assert.equal(read.data.companies[0]?.name, "Company One");
    }

    const missingCompanionCatalogue = await readWebsiteSourceRegistry({
      fetcher: async () => json({ ok: true, sources: [], clients: [], formSchemasBySource: {} }),
    });
    assert.equal(missingCompanionCatalogue.available, false, "a partial 200 must not become a confirmed empty registry");

    const malformedSource = await readWebsiteSourceRegistry({
      fetcher: async () => json({ ...payload, sources: [{ id: "site_1", host: "client.example" }] }),
    });
    assert.equal(malformedSource.available, false, "an unrenderable row must fail the whole registry read");
  });

  it("classifies transport, HTTP and unreadable responses as unavailable", async () => {
    const transport = await readWebsiteSourceRegistry({
      fetcher: async () => { throw new Error("connection lost"); },
    });
    const refused = await readWebsiteSourceRegistry({
      fetcher: async () => json({ ok: false, error: "dependency unavailable" }, 503),
    });
    const unreadable = await readWebsiteSourceRegistry({
      fetcher: async () => new Response("not-json", { status: 200 }),
    });

    assert.equal(transport.available, false);
    assert.equal(refused.available, false);
    assert.equal(unreadable.available, false);
  });

  it("never authorises writes or an ordinary empty claim without a current success", () => {
    const firstFailure = websiteSourceRegistryPresentation("unavailable", false, 0);
    assert.equal(firstFailure.canMutate, false);
    assert.equal(firstFailure.showUnavailable, true);
    assert.equal(firstFailure.showEmpty, false);
    assert.equal(firstFailure.showRows, false);

    const failedRefresh = websiteSourceRegistryPresentation("unavailable", true, 2);
    assert.equal(failedRefresh.canMutate, false);
    assert.equal(failedRefresh.showRows, true, "last-confirmed rows remain available as stale evidence");
    assert.equal(failedRefresh.retainedSnapshotIsStale, true);
    assert.equal(failedRefresh.showEmpty, false);

    const refreshing = websiteSourceRegistryPresentation("loading", true, 2);
    assert.equal(refreshing.canMutate, false);
    assert.equal(refreshing.showRows, true);
    assert.equal(refreshing.showLoading, true);

    const confirmedEmpty = websiteSourceRegistryPresentation("ready", true, 0);
    assert.equal(confirmedEmpty.canMutate, true);
    assert.equal(confirmedEmpty.showEmpty, true);
    assert.equal(confirmedEmpty.showUnavailable, false);
  });
});

describe("mounted registry and Development consumers", () => {
  it("mounts the same checked boundary, retry and write lock in both routing panels", () => {
    const agency = source("src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx");
    const client = source("src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx");

    for (const mounted of [agency, client]) {
      assert.match(mounted, /readWebsiteSourceRegistry\(\{ signal: controller\.signal \}\)/);
      assert.match(mounted, /websiteSourceRegistryPresentation\(/);
      assert.match(mounted, /disabled=\{[^}]*!presentation\.canMutate/);
      assert.match(mounted, /Retry (?:registered sites|routing)/);
      assert.match(mounted, /presentation\.showEmpty/);
    }
    assert.doesNotMatch(client, /catch\s*\{\s*\}/);
    assert.match(client, /snapshot\?\.clientId === clientId/,
      "a retained snapshot must be bound to the mounted client");
    assert.match(client, /not confirmation that no sites route here/);
    assert.match(agency, /last confirmed routing remains visible but is locked/i);
    assert.match(agency, /<FormMapping[^>]*disabled=\{!presentation\.canMutate\}/,
      "a stale form schema must not remain writable");
  });

  it("Development search shows unavailable/searching before any empty-success copy", () => {
    const toolkit = source("src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx");
    const effectStart = toolkit.indexOf("setLoadingResources(true)");
    const debounceStart = toolkit.indexOf("window.setTimeout", effectStart);
    assert.ok(effectStart >= 0 && debounceStart > effectStart,
      "the debounce interval can flash an unconfirmed empty search again");

    const unavailableBranch = toolkit.indexOf('resourceError ? (\n        <Empty title="Resources unavailable"');
    const loadingBranch = toolkit.indexOf('loadingResources ? (\n        <Empty title="Searching resources"', unavailableBranch);
    const emptyBranch = toolkit.indexOf('"Nothing matches"', loadingBranch);
    assert.ok(unavailableBranch >= 0 && loadingBranch > unavailableBranch && emptyBranch > loadingBranch,
      "failed or pending search still reaches the ordinary Nothing matches branch first");
    assert.match(toolkit, /an empty result cannot be confirmed/);
    assert.match(toolkit, /Retry resources/);
    assert.match(toolkit, /validDevelopmentResourcePage/,
      "the mounted search must reject malformed resource rows before rendering");
    assert.match(toolkit, /resourceSnapshotIsStale/);
    assert.match(toolkit, /Retained rows and counts are stale and all resource changes are locked/);
    assert.match(toolkit, /disabled=\{!canMutateResources\}/,
      "add and upload actions must lock while the resource read is not current");
    assert.match(toolkit, /mutationLocked=\{!canMutateResources\}/,
      "retained resource cards and open dialogs must lock their mutations");
    assert.match(toolkit, /disabled=\{mutationLocked \|\| deletionPending\}/,
      "a deletion checkpoint must disable editing even after the list read succeeds");
    assert.match(toolkit, /Retry deleting/);
    assert.match(toolkit, /!deletionPending && resource\.credential\?\.username/,
      "credential details must be withheld while permanent deletion is incomplete");
    assert.match(toolkit, /!deletionPending && resource\.credential\?\.passwordManagerUrl/);
    assert.match(toolkit, /validPublicDevelopmentResource\(result\?\.resource\)[\s\S]*setResources\(current => current\.map/,
      "a failed provider delete must replace the ordinary row with its retry-only checkpoint view");

    const portal = source("src/components/chrome/PortalSearch.tsx");
    const portalPending = portal.indexOf("setLoading(true)");
    const portalDebounce = portal.indexOf("window.setTimeout", portalPending);
    assert.ok(portalPending >= 0 && portalDebounce > portalPending,
      "workspace search can flash No matches during its debounce again");
    assert.match(portal, /checkedJsonMutation<RecordSearchPayload>/);
    assert.match(portal, /validate: validRecordSearch/);
    assert.doesNotMatch(portal, /json\?\.results \?\? \[\]/,
      "a malformed 200 response is being accepted as an empty search again");
    assert.match(portal, /Retry search/);
  });
});

describe("Development resource response validation", () => {
  const validResource = {
    id: "resource_1",
    kind: "tool",
    title: "Safe resource",
    tags: ["safe"],
    workflowStageIds: [],
    sopIds: [],
    visibility: "team",
    createdBy: "user_1",
    updatedAt: 1,
  };

  it("accepts a complete page and rejects rows that can crash mounted rendering", () => {
    assert.equal(validPublicDevelopmentResource(validResource), true);
    assert.equal(validDevelopmentResourcePage({ ok: true, resources: [validResource], total: 1 }), true);
    assert.equal(validDevelopmentResourcePage({ ok: true, resources: [{ ...validResource, tags: null }], total: 1 }), false);
    assert.equal(validDevelopmentResourcePage({ ok: true, resources: [{ ...validResource, kind: "unknown" }], total: 1 }), false);
    assert.equal(validDevelopmentResourcePage({ ok: true, resources: [{ ...validResource, credential: { hasPassword: true } }], total: 1 }), false);
    assert.equal(validDevelopmentResourcePage({ ok: true, resources: [validResource], total: "1" }), false);
    assert.equal(validPublicDevelopmentResource({ ...validResource, deleteState: "delete-failed", deleteError: "provider unavailable" }), true);
    assert.equal(validPublicDevelopmentResource({ ...validResource, deleteState: "not-a-state" }), false);
  });
});

describe("communications dependency reads", () => {
  it("distinguishes a confirmed empty sender catalogue from every failure shape", async () => {
    const confirmedEmpty = await readSenderCatalogue("/senders", {
      fetcher: async () => json({ ok: true, senders: [] }),
    });
    const confirmed = await readSenderCatalogue("/senders", {
      fetcher: async () => json({ ok: true, senders: [{ id: "sender_1", label: "Sales", address: "sales@example.test", provider: "smtp" }] }),
    });
    const malformed = await readSenderCatalogue("/senders", {
      fetcher: async () => json({ ok: true, senders: [{ id: "sender_1", label: "Sales" }] }),
    });
    const refused = await readSenderCatalogue("/senders", {
      fetcher: async () => json({ ok: false }, 503),
    });
    const transport = await readSenderCatalogue("/senders", {
      fetcher: async () => { throw new Error("offline"); },
    });

    assert.deepEqual(confirmedEmpty, { available: true, data: [] });
    assert.equal(confirmed.available, true);
    assert.equal(malformed.available, false);
    assert.equal(refused.available, false);
    assert.equal(transport.available, false);
  });

  it("mounts unavailable/retry states and locks outreach until the catalogue is confirmed", () => {
    const calls = source("src/components/telephony/CallControls.tsx");
    const email = source("src/components/telephony/EmailControls.tsx");
    for (const mounted of [calls, email]) {
      assert.match(mounted, /readSenderCatalogue\(/);
      assert.doesNotMatch(mounted, /\.catch\(\(\) => \[\]\)/);
      assert.match(mounted, /setSenderReadState\("unavailable"\)/);
      assert.match(mounted, /catalogueState !== "ready" \|\| !senderId/);
      assert.match(mounted, /This is unavailable, not confirmation/);
    }
    assert.match(calls, /Retry lines/);
    assert.match(email, /Retry addresses/);
    for (const mounted of [calls, email]) {
      assert.match(mounted, /localStorage\.removeItem\(STORAGE_KEY\)/,
        "clearing a selection must remove the persisted stale identity");
    }
    assert.match(calls, /setSelectedSender\(""\);\s*if \(list\.length\) setSelectedSender\(list\[0\]\.id\)/,
      "a confirmed call catalogue must revoke an absent or empty selection before fallback");
    assert.match(email, /setSelected\(""\);\s*if \(list\.length\) setSelected\(list\[0\]\.id\)/,
      "a confirmed email catalogue must revoke an absent or empty selection before fallback");
    for (const mounted of [calls, email]) {
      const clearIndex = mounted.indexOf('setSelected');
      const readyIndex = mounted.lastIndexOf('setSenderReadState("ready")');
      assert.ok(clearIndex >= 0 && readyIndex > clearIndex,
        "catalogue readiness must not publish before stale selection reconciliation");
    }
  });

  it("withholds combined inbox counts and empty copy when either source failed", () => {
    const inbox = source("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");
    assert.match(inbox, /sourceReadUnavailable \? "— open"/);
    assert.match(inbox, /count=\{websiteFormsAvailable \?/);
    assert.match(inbox, /count=\{socialInboxAvailable \?/);
    assert.match(inbox, /queueReadUnavailable \? "This queue is unavailable" : "Nothing in this queue"/);
    assert.match(inbox, /Retry conversations/);
    assert.match(inbox, /incomplete, not confirmed empty/);
  });
});
