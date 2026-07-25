// Self-contained smoke for the agency-HR plugin. Builds an in-memory
// foundation, runs a simple lifecycle (seed defaults → add staff → add
// department → request leave → approve → check side-effects), asserts
// at each step.
//
// Run from `04-the-final-portal/plugins/agency-hr/`:
//
//   npm run smoke

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  Agency,
  AgencyId,
  PluginInstall,
  PluginInstallScope,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
} from "../server/ports";
import { buildAgencyHrContainer } from "../server/index";

const AGENCY_ID: AgencyId = "agency_hr_smoke";
const ACTOR = "user_hr_smoke";

function buildWorld() {
  const agency: Agency = {
    id: AGENCY_ID,
    name: "Smoke HR Agency",
    slug: "smoke-hr",
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 0,
    updatedAt: 0,
  };
  const data: Record<string, unknown> = {};
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  let nextId = 1;

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return data[key] as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      data[key] = value;
    },
    async del(key: string): Promise<void> {
      delete data[key];
    },
    async list(prefix?: string): Promise<string[]> {
      const keys = Object.keys(data);
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };

  const tenant: TenantPort = {
    getAgency: id => (id === AGENCY_ID ? agency : null),
  };

  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(nextId++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId,
        clientId: input.clientId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        category: input.category,
        action: input.action,
        message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) {
      let entries = activityLog.filter(e => e.agencyId === filter.agencyId);
      if (filter.clientId) entries = entries.filter(e => e.clientId === filter.clientId);
      const limit = filter.limit ?? entries.length;
      return entries.slice(-limit).reverse();
    },
  };

  const eventBus: EventBusPort = {
    emit(_scope, name, payload) {
      events.push({ name, payload });
    },
  };

  const pluginInstalls: PluginInstallStorePort = {
    getInstall(_scope: PluginInstallScope, _pluginId: string): PluginInstall | null {
      return null;
    },
  };

  return { storage, tenant, activity, eventBus, pluginInstalls, activityLog, events };
}

describe("agency-hr smoke", () => {
  let world: ReturnType<typeof buildWorld>;
  let services: ReturnType<typeof buildAgencyHrContainer>;
  let staffId: string;
  let leaveId: string;

  before(() => {
    world = buildWorld();
    services = buildAgencyHrContainer({
      agencyId: AGENCY_ID,
      storage: world.storage,
      activity: world.activity,
      events: world.eventBus,
      tenant: world.tenant,
      pluginInstalls: world.pluginInstalls,
    });
  });

  test("step 0: seed default departments (idempotent)", async () => {
    const first = await services.departments.seedDefaults(ACTOR);
    assert.equal(first.seeded, 5, "five default departments seeded on first install");
    const second = await services.departments.seedDefaults(ACTOR);
    assert.equal(second.seeded, 0);
    assert.equal(second.existed, 5);

    const list = await services.departments.list();
    assert.equal(list.length, 5);
    assert.deepEqual(
      list.map(d => d.name).sort(),
      ["Design", "Engineering", "Marketing", "Operations", "Sales"],
    );
  });

  test("step 1: create staff + department uniqueness", async () => {
    const eng = (await services.departments.list()).find(d => d.name === "Engineering")!;
    const staff = await services.staff.create({
      name: "Riley Chen",
      email: "riley@smoke-hr.test",
      role: "agency-staff",
      title: "Staff Engineer",
      departmentId: eng.id,
      joinedAt: "2026-04-01",
      locationType: "remote",
    }, ACTOR);
    staffId = staff.id;
    assert.equal(staff.status, "active");

    // Email uniqueness — duplicate fails.
    await assert.rejects(
      services.staff.create({
        name: "Different Name",
        email: "RILEY@smoke-hr.test",
        role: "agency-staff",
        title: "Other",
        joinedAt: "2026-04-01",
      }, ACTOR),
      /already in directory/i,
    );
  });

  test("step 2: department cycle prevention", async () => {
    const list = await services.departments.list();
    const a = list[0]!;
    const b = list[1]!;
    await services.departments.update(a.id, { parentId: b.id }, ACTOR);
    await assert.rejects(
      services.departments.update(b.id, { parentId: a.id }, ACTOR),
      /cycle/i,
    );
  });

  test("step 3: request leave + approval flow", async () => {
    const r = await services.leave.request({
      staffId,
      type: "pto",
      startDate: "2026-06-01",
      endDate: "2026-06-05",
      reason: "Holiday",
    }, ACTOR);
    leaveId = r.id;
    assert.equal(r.status, "pending");
    assert.equal(r.days, 5);

    // Approval flips staff to on-leave + records approver.
    const approver = "user_owner";
    const decided = await services.leave.decide(leaveId, {
      status: "approved",
      approvedBy: approver,
    });
    assert.ok(decided);
    assert.equal(decided?.status, "approved");
    const updated = await services.staff.get(staffId);
    assert.equal(updated?.status, "on-leave");

    // Re-deciding fails.
    await assert.rejects(
      services.leave.decide(leaveId, { status: "rejected", approvedBy: approver }),
      /already approved/i,
    );
  });

  test("step 4: side effects — activity + events recorded", async () => {
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, limit: 50 });
    const actions = log.map(e => e.action);
    // Five seed departments + one staff create + one department update +
    // one leave request + one leave decide + one staff update (on-leave).
    assert.ok(actions.includes("hr.staff.created"));
    assert.ok(actions.includes("hr.leave.requested"));
    assert.ok(actions.includes("hr.leave.approved"));
    assert.ok(actions.includes("hr.staff.updated"));
    assert.ok(actions.filter(a => a === "hr.department.created").length >= 5);

    const eventNames = world.events.map(e => e.name);
    assert.ok(eventNames.includes("hr.staff.created"));
    assert.ok(eventNames.includes("hr.leave.approved"));
  });

  test("step 5: filters + listing", async () => {
    const onLeave = await services.staff.list({ status: "on-leave" });
    assert.equal(onLeave.length, 1);
    assert.equal(onLeave[0]?.id, staffId);

    const pending = await services.leave.list({ status: "pending" });
    assert.equal(pending.length, 0, "approved leave drops out of pending filter");

    const queryByName = await services.staff.list({ query: "riley" });
    assert.equal(queryByName.length, 1);
  });
});
