import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";

const testRoot = mkdtempSync(join(tmpdir(), "aquacrm-radar-realm-cache-"));
const inboxFile = join(testRoot, "inbox.json");
process.env.INBOX_LOCAL_DATA_FILE = inboxFile;

const AGENCY_ID = "agency-radar-realm-cache";
const LIVE_REALM = "live";
const EMPTY_REALM = "sandbox-radar-empty-cache";
const SANDBOX_REALM = "sandbox-radar-demo-cache";
const REALMS = [LIVE_REALM, EMPTY_REALM, SANDBOX_REALM] as const;

type RealmId = typeof REALMS[number];
type Runtime = Awaited<ReturnType<typeof runtime>>;
type SourceDataset = Awaited<ReturnType<Runtime["sources"]["listRadarSourceSearchDatasets"]>>[number];

let runtimePromise: Promise<{
  storage: typeof import("../src/server/storage");
  radar: typeof import("../src/engines/data/server/radar/businessIssueRadar");
  sources: typeof import("../src/engines/data/server/radar/radarSourceInspection");
}> | null = null;

function runtime() {
  runtimePromise ??= Promise.all([
    import("../src/server/storage"),
    import("../src/engines/data/server/radar/businessIssueRadar"),
    import("../src/engines/data/server/radar/radarSourceInspection"),
  ]).then(([storage, radar, sources]) => ({ storage, radar, sources }));
  return runtimePromise;
}

function markerFor(realmId: RealmId): string {
  if (realmId === LIVE_REALM) return "live";
  if (realmId === EMPTY_REALM) return "empty";
  return "sandbox";
}

async function seedRealm(
  storage: Runtime["storage"],
  realmId: RealmId,
  populated: boolean,
): Promise<void> {
  const marker = markerFor(realmId);
  await storage.runInDataRealm(realmId, async () => {
    await storage.reset();
    storage.mutate(state => {
      state.agencies[AGENCY_ID] = {
        id: AGENCY_ID,
        name: `${marker} agency`,
        slug: `${marker}-radar-realm-cache`,
        brand: { primaryColor: "#0B6F6D" },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      };
      if (!populated) return;
      addRealmRecords(state, marker, "v1", 1);
    });
    await storage.flushPendingWrites();
  });
}

function addRealmRecords(
  state: ReturnType<Runtime["storage"]["getState"]>,
  marker: string,
  version: string,
  stamp: number,
): void {
  const clientId = `client-${marker}-${version}`;
  const email = `${marker}-${version}@example.test`;
  state.clients[clientId] = {
    id: clientId,
    agencyId: AGENCY_ID,
    relationshipId: clientId,
    name: `${marker} ${version} client`,
    slug: `${marker}-${version}-client`,
    brand: { primaryColor: "#0B6F6D" },
    stage: "live",
    status: "active",
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.users[email] = {
    id: `user-${marker}-${version}`,
    email,
    name: `${marker} ${version} user`,
    passwordHash: "realm-cache-test-only",
    role: "agency-owner",
    agencyIds: [AGENCY_ID],
    agencyId: AGENCY_ID,
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.activity.push({
    id: `activity-${marker}-${version}`,
    ts: stamp,
    agencyId: AGENCY_ID,
    category: "system",
    action: `realm.${version}`,
    message: `${marker} ${version} activity`,
  });
}

function writeInboxFixture(marker?: string): void {
  const now = 1_700_000_000_000;
  const connectionId = marker ? `connection-${marker}` : "";
  const identityId = marker ? `identity-${marker}` : "";
  const conversationId = marker ? `conversation-${marker}` : "";
  writeFileSync(inboxFile, JSON.stringify({
    connections: marker ? [{
      id: connectionId,
      agencyId: AGENCY_ID,
      provider: "meta",
      channel: "instagram",
      authMode: "instagram-login",
      externalAccountId: `account-${marker}`,
      displayName: `${marker} account`,
      scopes: [],
      status: "connected",
      webhookStatus: "subscribed",
      encryptedAccessToken: "test-secret",
      createdAt: now,
      updatedAt: now,
    }] : [],
    identities: marker ? [{
      id: identityId,
      agencyId: AGENCY_ID,
      connectionId,
      externalUserId: `external-user-${marker}`,
      displayName: `${marker} contact`,
      createdAt: now,
      updatedAt: now,
    }] : [],
    conversations: marker ? [{
      id: conversationId,
      agencyId: AGENCY_ID,
      connectionId,
      identityId,
      externalConversationId: `external-conversation-${marker}`,
      status: "open",
      tags: [],
      unreadCount: 1,
      lastMessageAt: now,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }] : [],
    messages: marker ? [{
      id: `message-${marker}`,
      agencyId: AGENCY_ID,
      connectionId,
      conversationId,
      direction: "inbound",
      type: "text",
      text: `${marker} raw message`,
      attachments: [],
      status: "received",
      metadata: {},
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    }] : [],
    webhookEvents: [],
  }));
}

function records(datasets: SourceDataset[], datasetId: string): Array<Record<string, unknown>> {
  const dataset = datasets.find(candidate => candidate.id === datasetId);
  assert.ok(dataset, `missing source dataset ${datasetId}`);
  return dataset.records;
}

function sourceMarkers(datasets: SourceDataset[]) {
  return {
    clients: records(datasets, "core:clients").map(record => String(record.name)).sort(),
    team: records(datasets, "core:team").map(record => String(record.name)).sort(),
    activity: records(datasets, "core:activity").map(record => String(record.message)).sort(),
    messages: records(datasets, "external:social-messages").map(record => String(record.text)).sort(),
  };
}

function radarClientIds(radar: Awaited<ReturnType<Runtime["radar"]["getCachedBusinessIssueRadar"]>>): string[] {
  return radar.coverageManifest.entries
    .filter(entry => entry.type === "client")
    .map(entry => entry.id)
    .sort();
}

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test("Radar result and raw source caches isolate equal agency ids across live, empty and Sandbox realms", async () => {
  const { storage, radar, sources } = await runtime();
  await seedRealm(storage, LIVE_REALM, true);
  await seedRealm(storage, EMPTY_REALM, false);
  await seedRealm(storage, SANDBOX_REALM, true);

  const now = Date.now();
  const readRadar = (realmId: RealmId, scanAt = now) => storage.runInDataRealm(
    realmId,
    () => radar.getCachedBusinessIssueRadar(AGENCY_ID, scanAt),
  );
  const readSources = (realmId: RealmId) => storage.runInDataRealm(
    realmId,
    () => sources.listRadarSourceSearchDatasets(AGENCY_ID),
  );

  // Alternating the same agency id is the regression: an agency-only cache
  // returns the first live result for both following realms.
  const liveRadar = await readRadar(LIVE_REALM);
  const emptyRadar = await readRadar(EMPTY_REALM);
  const sandboxRadar = await readRadar(SANDBOX_REALM);
  const liveRadarWarm = await readRadar(LIVE_REALM);
  assert.deepEqual(radarClientIds(liveRadar), ["client-live-v1"]);
  assert.deepEqual(radarClientIds(emptyRadar), []);
  assert.deepEqual(radarClientIds(sandboxRadar), ["client-sandbox-v1"]);
  assert.equal(liveRadarWarm, liveRadar, "the live realm should retain its own warm Radar object");

  writeInboxFixture("live-v1");
  const liveSources = await readSources(LIVE_REALM);
  writeInboxFixture();
  const emptySources = await readSources(EMPTY_REALM);
  writeInboxFixture("sandbox-v1");
  const sandboxSources = await readSources(SANDBOX_REALM);
  writeInboxFixture("uncached-poison");
  const liveSourcesWarm = await readSources(LIVE_REALM);
  const emptySourcesWarm = await readSources(EMPTY_REALM);
  const sandboxSourcesWarm = await readSources(SANDBOX_REALM);

  assert.deepEqual(sourceMarkers(liveSources), {
    clients: ["live v1 client"],
    team: ["live v1 user"],
    activity: ["live v1 activity"],
    messages: ["live-v1 raw message"],
  });
  assert.deepEqual(sourceMarkers(emptySources), { clients: [], team: [], activity: [], messages: [] });
  assert.deepEqual(sourceMarkers(sandboxSources), {
    clients: ["sandbox v1 client"],
    team: ["sandbox v1 user"],
    activity: ["sandbox v1 activity"],
    messages: ["sandbox-v1 raw message"],
  });
  assert.deepEqual(sourceMarkers(liveSourcesWarm), sourceMarkers(liveSources));
  assert.deepEqual(sourceMarkers(emptySourcesWarm), sourceMarkers(emptySources));
  assert.deepEqual(sourceMarkers(sandboxSourcesWarm), sourceMarkers(sandboxSources));

  // One agency invalidation must clear that agency in every realm, even when
  // called from live. Mutate all three realms without emitting domain events,
  // then prove every subsequent read rebuilds rather than serving a stale key.
  for (const realmId of REALMS) {
    const marker = markerFor(realmId);
    await storage.runInDataRealm(realmId, async () => {
      storage.mutate(state => addRealmRecords(state, marker, "v2", 2));
      await storage.flushPendingWrites();
    });
  }
  storage.runInDataRealm(LIVE_REALM, () => {
    radar.invalidateBusinessIssueRadarCache(AGENCY_ID);
    sources.invalidateRadarSourceInspection(AGENCY_ID);
  });

  const emptyRadarAfterInvalidation = await readRadar(EMPTY_REALM, now + 1);
  const sandboxRadarAfterInvalidation = await readRadar(SANDBOX_REALM, now + 1);
  const liveRadarAfterInvalidation = await readRadar(LIVE_REALM, now + 1);
  assert.deepEqual(radarClientIds(emptyRadarAfterInvalidation), ["client-empty-v2"]);
  assert.deepEqual(radarClientIds(sandboxRadarAfterInvalidation), ["client-sandbox-v1", "client-sandbox-v2"]);
  assert.deepEqual(radarClientIds(liveRadarAfterInvalidation), ["client-live-v1", "client-live-v2"]);

  writeInboxFixture("empty-v2");
  const emptySourcesAfterInvalidation = await readSources(EMPTY_REALM);
  writeInboxFixture("sandbox-v2");
  const sandboxSourcesAfterInvalidation = await readSources(SANDBOX_REALM);
  writeInboxFixture("live-v2");
  const liveSourcesAfterInvalidation = await readSources(LIVE_REALM);
  assert.deepEqual(sourceMarkers(emptySourcesAfterInvalidation), {
    clients: ["empty v2 client"],
    team: ["empty v2 user"],
    activity: ["empty v2 activity"],
    messages: ["empty-v2 raw message"],
  });
  assert.deepEqual(sourceMarkers(sandboxSourcesAfterInvalidation), {
    clients: ["sandbox v1 client", "sandbox v2 client"],
    team: ["sandbox v1 user", "sandbox v2 user"],
    activity: ["sandbox v1 activity", "sandbox v2 activity"],
    messages: ["sandbox-v2 raw message"],
  });
  assert.deepEqual(sourceMarkers(liveSourcesAfterInvalidation), {
    clients: ["live v1 client", "live v2 client"],
    team: ["live v1 user", "live v2 user"],
    activity: ["live v1 activity", "live v2 activity"],
    messages: ["live-v2 raw message"],
  });
});
