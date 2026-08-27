import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withSession } from "./dev-console-request-scope";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";

const testRoot = mkdtempSync(join(tmpdir(), "aquacrm-search-realm-cache-"));
const inboxFile = join(testRoot, "inbox.json");
process.env.INBOX_LOCAL_DATA_FILE = inboxFile;

const AGENCY_ID = "agency-search-realm-cache";
const USER_ID = "user-search-realm-cache";
const USER_EMAIL = "owner-search-realm-cache@example.test";
const LIVE_REALM = "live";
const EMPTY_REALM = "sandbox-search-empty-cache";
const DEMO_REALM = "sandbox-search-demo-cache";
const REALMS = [LIVE_REALM, EMPTY_REALM, DEMO_REALM] as const;

type RealmId = typeof REALMS[number];
type Runtime = Awaited<ReturnType<typeof runtime>>;

let runtimePromise: Promise<{
  storage: typeof import("../src/server/storage");
  route: typeof import("../src/app/api/portal/search/route");
  sessions: typeof import("../src/lib/server/auth/sessionToken");
}> | null = null;

function runtime() {
  runtimePromise ??= Promise.all([
    import("../src/server/storage"),
    import("../src/app/api/portal/search/route"),
    import("../src/lib/server/auth/sessionToken"),
  ]).then(([storage, route, sessions]) => ({ storage, route, sessions }));
  return runtimePromise;
}

function markerFor(realmId: RealmId): "live" | "empty" | "demo" {
  if (realmId === LIVE_REALM) return "live";
  if (realmId === EMPTY_REALM) return "empty";
  return "demo";
}

function addRealmRecords(
  state: ReturnType<Runtime["storage"]["getState"]>,
  marker: "live" | "demo",
): void {
  const clientId = `client-${marker}-realmprobe`;
  state.clients[clientId] = {
    id: clientId,
    agencyId: AGENCY_ID,
    relationshipId: clientId,
    name: `${marker} realmprobe client`,
    slug: `${marker}-realmprobe-client`,
    ownerEmail: `${marker}-client@example.test`,
    metadata: {
      linkedContacts: [{
        id: `contact-${marker}-realmprobe`,
        name: `${marker} realmprobe contact`,
        email: `${marker}-contact@example.test`,
      }],
    },
    brand: { primaryColor: "#0B6F6D" },
    stage: "live",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };

  const installId = `${AGENCY_ID}|_agency|agency-finance`;
  state.pluginInstalls[installId] = {
    id: installId,
    pluginId: "agency-finance",
    agencyId: AGENCY_ID,
    enabled: true,
    config: {},
    features: {},
    installedAt: 1,
  };
  state.pluginData[installId] = {
    [`invoices/by-id/invoice-${marker}-realmprobe`]: {
      id: `invoice-${marker}-realmprobe`,
      number: `${marker} realmprobe invoice`,
      clientId,
      status: "sent",
      totalCents: 10_000,
      currency: "GBP",
    },
    [`expenses/by-id/expense-${marker}-realmprobe`]: {
      id: `expense-${marker}-realmprobe`,
      vendor: `${marker} realmprobe expense`,
      clientId,
      status: "approved",
      amountCents: 2_500,
      currency: "GBP",
    },
    [`income/by-id/income-${marker}-realmprobe`]: {
      id: `income-${marker}-realmprobe`,
      title: `${marker} realmprobe income`,
      clientId,
      amountCents: 10_000,
      currency: "GBP",
    },
  };
}

async function seedRealm(storage: Runtime["storage"], realmId: RealmId): Promise<void> {
  const marker = markerFor(realmId);
  await storage.runInDataRealm(realmId, async () => {
    await storage.reset();
    storage.mutate(state => {
      state.agencies[AGENCY_ID] = {
        id: AGENCY_ID,
        name: `${marker} realmprobe agency`,
        slug: `${marker}-realmprobe-agency`,
        brand: { primaryColor: "#0B6F6D" },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      };
      state.users[USER_EMAIL] = {
        id: USER_ID,
        email: USER_EMAIL,
        name: "Same Realm Search Owner",
        passwordHash: "test-only",
        role: "agency-owner",
        agencyId: AGENCY_ID,
        agencyIds: [AGENCY_ID],
        createdAt: 1,
        updatedAt: 1,
      };
      if (marker !== "empty") addRealmRecords(state, marker);
    });
    await storage.flushPendingWrites();
  });
}

function writeInboxFixture(marker?: "live" | "demo" | "poison"): void {
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
      displayName: `${marker} realmprobe account`,
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
      displayName: `${marker} realmprobe inbox contact`,
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
      id: `message-${marker}-realmprobe`,
      agencyId: AGENCY_ID,
      connectionId,
      conversationId,
      direction: "inbound",
      type: "text",
      text: `${marker} realmprobe message`,
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

function tokenFor(
  sessions: Runtime["sessions"],
  realmId: RealmId,
): string {
  const now = Math.floor(Date.now() / 1000);
  const sandbox = realmId === LIVE_REALM ? undefined : {
    realmId,
    dataset: realmId === EMPTY_REALM ? "empty" as const : "demo" as const,
    access: "writable" as const,
    persona: "owner" as const,
    returnUserId: USER_ID,
    returnAgencyId: AGENCY_ID,
    enteredAt: Date.now(),
  };
  return sessions.signSessionPayload({
    userId: USER_ID,
    email: USER_EMAIL,
    role: "agency-owner",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    activeAgencyId: AGENCY_ID,
    sandbox,
    isDemo: Boolean(sandbox) || undefined,
    sessionRev: 0,
    accessRev: 0,
    iat: now,
    exp: now + 60,
  });
}

interface SearchResult {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  excerpt?: string;
  href: string;
}

async function searchRealm(
  runtimeValue: Runtime,
  realmId: RealmId,
): Promise<{ results: SearchResult[]; indexed: number }> {
  const response = await withSession(tokenFor(runtimeValue.sessions, realmId), () =>
    runtimeValue.route.GET(new Request("http://localhost/api/portal/search?q=realmprobe")),
  );
  assert.equal(response.status, 200);
  return await response.json() as { results: SearchResult[]; indexed: number };
}

function familyMarkers(results: SearchResult[]) {
  const byCategory = (category: string) => results
    .filter(result => result.category === category)
    .map(result => `${result.id} ${result.title} ${result.subtitle ?? ""} ${result.excerpt ?? ""}`.toLowerCase());
  return {
    clients: byCategory("Client"),
    contacts: byCategory("Contact"),
    messages: byCategory("Message"),
    invoices: byCategory("Invoice"),
    expenses: byCategory("Expense"),
    income: byCategory("Income"),
    radar: [...byCategory("Radar"), ...byCategory("Check")],
  };
}

function assertMarkerFamilies(results: SearchResult[], marker: "live" | "demo"): void {
  const families = familyMarkers(results);
  for (const [family, values] of Object.entries(families)) {
    assert.ok(values.some(value => value.includes(marker) && value.includes("realmprobe")), `${family} carries ${marker} realm data`);
  }
}

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test("search candidates isolate the same identity across live, empty, demo and back to live", async () => {
  const runtimeValue = await runtime();
  for (const realmId of REALMS) await seedRealm(runtimeValue.storage, realmId);

  writeInboxFixture("live");
  const live = await searchRealm(runtimeValue, LIVE_REALM);
  writeInboxFixture();
  const empty = await searchRealm(runtimeValue, EMPTY_REALM);
  writeInboxFixture("demo");
  const demo = await searchRealm(runtimeValue, DEMO_REALM);
  writeInboxFixture("poison");
  const liveWarm = await searchRealm(runtimeValue, LIVE_REALM);

  assertMarkerFamilies(live.results, "live");
  const emptyFamilies = familyMarkers(empty.results);
  for (const [family, values] of Object.entries(emptyFamilies)) {
    assert.deepEqual(values, [], `an empty realm has no ${family} candidates from the populated live index`);
  }
  assert.match(JSON.stringify(empty), /empty realmprobe/);
  assert.doesNotMatch(JSON.stringify(empty), /live realmprobe|demo realmprobe/);
  assertMarkerFamilies(demo.results, "demo");
  assert.deepEqual(liveWarm, live, "returning to live reuses only live candidates, not the latest realm/provider file");
  assert.doesNotMatch(JSON.stringify(liveWarm), /demo realmprobe|poison realmprobe/);
  assert.doesNotMatch(JSON.stringify(demo), /live realmprobe|poison realmprobe/);
});
