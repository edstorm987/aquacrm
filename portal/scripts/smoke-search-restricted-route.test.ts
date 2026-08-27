import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withSession } from "./dev-console-request-scope";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.INBOX_STORAGE_BACKEND = "file";

const testRoot = mkdtempSync(join(tmpdir(), "aquacrm-search-restricted-"));
process.env.INBOX_LOCAL_DATA_FILE = join(testRoot, "inbox.json");
writeFileSync(process.env.INBOX_LOCAL_DATA_FILE, JSON.stringify({
  connections: [], identities: [], conversations: [], messages: [], webhookEvents: [],
}));

const AGENCY_ID = "agency-search-restricted";
const USER_ID = "user-search-restricted";
const USER_EMAIL = "restricted-search@example.test";
const QUERY = "restrictedrealmprobe";

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

function sessionToken(sessions: Runtime["sessions"]): string {
  const now = Math.floor(Date.now() / 1000);
  return sessions.signSessionPayload({
    userId: USER_ID,
    email: USER_EMAIL,
    role: "agency-staff",
    agencyId: AGENCY_ID,
    agencyIds: [AGENCY_ID],
    activeAgencyId: AGENCY_ID,
    isDemo: true,
    sessionRev: 0,
    accessRev: 1,
    iat: now,
    exp: now + 60,
  });
}

async function readResults(runtimeValue: Runtime, token: string): Promise<Array<{ category: string; title: string }>> {
  const response = await withSession(token, () =>
    runtimeValue.route.GET(new Request(`http://localhost/api/portal/search?q=${QUERY}`)),
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { results: Array<{ category: string; title: string }> };
  return body.results;
}

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test("the live search route applies Staff element revokes without waiting for its 15-second index TTL", async () => {
  const runtimeValue = await runtime();
  await runtimeValue.storage.reset();
  runtimeValue.storage.mutate(state => {
    state.agencies[AGENCY_ID] = {
      id: AGENCY_ID,
      name: "Restricted Search Agency",
      slug: "restricted-search-agency",
      brand: { primaryColor: "#0B6F6D" },
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
    state.users[USER_EMAIL] = {
      id: USER_ID,
      email: USER_EMAIL,
      name: `${QUERY} person`,
      passwordHash: "test-only",
      role: "agency-staff",
      agencyId: AGENCY_ID,
      agencyIds: [AGENCY_ID],
      accessRev: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    state.accessGrants.schedule = {
      id: "schedule",
      agencyId: AGENCY_ID,
      userId: USER_ID,
      scope: { kind: "workspace", id: "staff" },
      environment: "live",
      capabilities: ["element.staff.schedule.view"],
      createdBy: "owner",
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
      "invoices/by-id/restricted": {
        id: "invoice-restricted",
        number: `${QUERY} invoice`,
        status: "sent",
        totalCents: 5_000,
        currency: "GBP",
      },
    };
  });
  await runtimeValue.storage.flushPendingWrites();
  const token = sessionToken(runtimeValue.sessions);

  const restricted = await readResults(runtimeValue, token);
  assert.deepEqual(restricted, [], "Schedule-only Staff cannot discover People or Finance records");

  runtimeValue.storage.mutate(state => {
    state.accessGrants.people = {
      id: "people",
      agencyId: AGENCY_ID,
      userId: USER_ID,
      scope: { kind: "workspace", id: "staff" },
      environment: "live",
      capabilities: ["element.staff.people.view"],
      createdBy: "owner",
      createdAt: 2,
      updatedAt: 2,
    };
    state.users[USER_EMAIL]!.accessRev = 2;
  });
  const granted = await readResults(runtimeValue, token);
  assert.equal(granted.some(result => result.category === "Staff" && result.title === `${QUERY} person`), true);
  assert.equal(granted.some(result => result.category === "Invoice"), false, "People access never reveals agency Finance");

  runtimeValue.storage.mutate(state => {
    state.accessGrants.people!.revokedAt = 3;
    state.accessGrants.people!.updatedAt = 3;
    state.users[USER_EMAIL]!.accessRev = 3;
  });
  const revoked = await readResults(runtimeValue, token);
  assert.deepEqual(revoked, [], "the access fingerprint bypasses the still-warm granted index immediately");
});
