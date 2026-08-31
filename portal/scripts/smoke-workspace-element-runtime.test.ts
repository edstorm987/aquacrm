import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";

import type { CurrentAccessActor } from "../src/server/accessControl";
import type { AccessCapability, PeopleEmployee, PortalState, ServerUser } from "../src/server/types";

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

type WorkspaceElementAccessModule = typeof import("../src/lib/server/access/workspaceElementAccess");
type PeopleProjectionModule = typeof import("../src/lib/server/access/peopleWorkspaceProjection");
type StorageModule = typeof import("../src/server/storage");

let assertWorkspaceElementAccess: WorkspaceElementAccessModule["assertWorkspaceElementAccess"];
let resolveActorWorkspaceElementAccess: WorkspaceElementAccessModule["resolveActorWorkspaceElementAccess"];
let staffStationAccessEntries: WorkspaceElementAccessModule["staffStationAccessEntries"];
let workspaceElementLevel: WorkspaceElementAccessModule["workspaceElementLevel"];
let projectPeopleWorkspaceSnapshot: PeopleProjectionModule["projectPeopleWorkspaceSnapshot"];
let createEmptyPortalState: StorageModule["createEmptyPortalState"];

before(async () => {
  ({
    assertWorkspaceElementAccess,
    resolveActorWorkspaceElementAccess,
    staffStationAccessEntries,
    workspaceElementLevel,
  } = await import("../src/lib/server/access/workspaceElementAccess"));
  ({ projectPeopleWorkspaceSnapshot } = await import("../src/lib/server/access/peopleWorkspaceProjection"));
  ({ createEmptyPortalState } = await import("../src/server/storage"));
});

const AGENCY = "agency-test";

function actor(options?: {
  role?: ServerUser["role"];
  capabilities?: AccessCapability[];
  workspace?: "staff" | "fulfilment";
  legacy?: PeopleEmployee["workspaceAccess"];
  readOnly?: boolean;
}): CurrentAccessActor {
  const state = createEmptyPortalState();
  state.agencies[AGENCY] = {
    id: AGENCY,
    name: "Test Agency",
    slug: "test-agency",
    brand: { primaryColor: "#000000" },
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
  const user: ServerUser = {
    id: "person",
    email: "person@example.test",
    name: "Person",
    passwordHash: "test-only",
    role: options?.role ?? "agency-staff",
    agencyId: AGENCY,
    agencyIds: [AGENCY],
    createdAt: 1,
    updatedAt: 1,
  };
  state.users[user.email] = user;
  state.peopleEmployees.employee = {
    id: "employee",
    agencyId: AGENCY,
    userId: user.id,
    name: user.name,
    email: user.email,
    title: "Tester",
    employmentType: "full-time",
    status: "active",
    onboardingItems: [],
    commissionRules: [],
    workspaceAccess: options?.legacy ?? [{ stationId: "my-day", mode: "edit", order: 0 }],
    createdAt: 1,
    updatedAt: 1,
  } as PeopleEmployee;
  if (options?.capabilities) {
    state.accessGrants.policy = {
      id: "policy",
      agencyId: AGENCY,
      userId: user.id,
      scope: { kind: "workspace", id: options.workspace ?? "staff" },
      environment: "live",
      capabilities: options.capabilities,
      createdBy: "owner",
      createdAt: 1,
      updatedAt: 1,
    };
  }
  return {
    session: {
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: AGENCY,
      ...(options?.readOnly ? { publicShowcase: true } : {}),
    },
    user,
    agencyId: AGENCY,
    resourceAgencyId: AGENCY,
    environment: "live",
    governanceState: state,
    resourceState: state,
  };
}

describe("canonical workspace element runtime", () => {
  it("keeps the documented People station fallback when no canonical grant exists", () => {
    const current = actor({ legacy: [
      { stationId: "my-day", mode: "view", order: 0 },
      { stationId: "actions", mode: "edit", order: 1 },
    ] });
    const access = resolveActorWorkspaceElementAccess(current, "staff");
    assert.equal(access.source, "legacy");
    assert.equal(workspaceElementLevel(access, "staff.overview"), "view");
    assert.equal(workspaceElementLevel(access, "workspace.actions"), "use");
    assert.deepEqual(staffStationAccessEntries(current, access).map(item => item.stationId), ["my-day", "actions"]);
  });

  it("keeps legacy managers usable during migration", () => {
    const current = actor({ role: "agency-manager" });
    const staff = resolveActorWorkspaceElementAccess(current, "staff");
    const fulfilment = resolveActorWorkspaceElementAccess(current, "fulfilment");
    assert.equal(staff.source, "legacy");
    assert.equal(fulfilment.source, "legacy");
    assert.equal(workspaceElementLevel(staff, "staff.pay"), "manage");
    assert.equal(workspaceElementLevel(fulfilment, "fulfilment.projects"), "manage");
  });

  it("makes an exact canonical grant authoritative for hidden navigation and direct access", () => {
    const current = actor({ capabilities: ["element.staff.schedule.view"] });
    const access = resolveActorWorkspaceElementAccess(current, "staff");
    assert.equal(access.source, "canonical-grant");
    assert.equal(workspaceElementLevel(access, "staff.overview"), "hidden");
    assert.equal(workspaceElementLevel(access, "staff.schedule"), "view");
    assert.deepEqual(staffStationAccessEntries(current, access).map(item => item.stationId), ["calendar", "leave"]);
    assert.throws(() => assertWorkspaceElementAccess(access, "staff.overview", "view"));
  });

  it("enforces View, Use and Manage without turning Use into settings authority", () => {
    const view = resolveActorWorkspaceElementAccess(actor({ capabilities: ["element.fulfilment.services.view"], workspace: "fulfilment" }), "fulfilment");
    assert.doesNotThrow(() => assertWorkspaceElementAccess(view, "fulfilment.services", "view"));
    assert.throws(() => assertWorkspaceElementAccess(view, "fulfilment.services", "use"));

    const use = resolveActorWorkspaceElementAccess(actor({ capabilities: ["element.fulfilment.services.use"], workspace: "fulfilment" }), "fulfilment");
    assert.doesNotThrow(() => assertWorkspaceElementAccess(use, "fulfilment.services", "use"));
    assert.throws(() => assertWorkspaceElementAccess(use, "fulfilment.services", "manage"));

    const manage = resolveActorWorkspaceElementAccess(actor({ capabilities: ["element.workspace.settings.manage"], workspace: "fulfilment" }), "fulfilment");
    assert.doesNotThrow(() => assertWorkspaceElementAccess(manage, "workspace.settings", "manage"));
  });

  it("caps canonical Use and Manage to View in a read-only showcase", () => {
    const access = resolveActorWorkspaceElementAccess(actor({
      capabilities: ["element.fulfilment.services.manage"],
      workspace: "fulfilment",
      readOnly: true,
    }), "fulfilment");
    assert.equal(workspaceElementLevel(access, "fulfilment.services"), "view");
  });

  it("projects Staff data by owning element instead of serialising the full People snapshot", () => {
    const employee = {
      id: "employee", agencyId: AGENCY, userId: "person", name: "Sensitive Person", email: "sensitive@example.test", phone: "07000000000", title: "Tester",
      employmentType: "full-time", status: "active", weeklyHours: 37.5, holidayAllowanceDays: 28, payBasis: "salary", basePayMinor: 9000000, currency: "GBP",
      commissionRules: [{ id: "secret-rule", label: "Private", basis: "revenue", ratePercent: 10, cadence: "monthly", status: "active" }],
      workspaceAccess: [], onboardingItems: [{ id: "private-onboarding", label: "Private", owner: "manager", status: "todo" }], createdAt: 1, updatedAt: 1,
    } as PeopleEmployee;
    const snapshot = {
      applications: [], employees: [employee], leaveRequests: [], shifts: [], training: [], stations: [],
      directory: [{ id: employee.id, employeeId: employee.id, userId: employee.userId, name: employee.name, email: employee.email, title: employee.title, status: employee.status, employmentType: employee.employmentType, isOwner: false, isEmployeeOfMonth: false, hasPortalAccount: true, presence: { state: "offline", online: false }, openTasks: 0, onboardingRemaining: 1 }],
      cards: [], delegatable: [], employeeOfMonth: null,
      orgChart: { owner: null, freelancers: [], unplaced: [], departments: [], totalPeople: 1 },
      processConfig: { agencyId: AGENCY, onboardingSteps: [], hiringStages: [], updatedAt: 1 },
      contracts: [], contractTemplates: [], trainingModules: [],
    } as unknown as Parameters<typeof projectPeopleWorkspaceSnapshot>[0];
    const capacity = { available: true, health: null, areas: [], hiring: [], coverage: [], attention: [] };

    const scheduleAccess = resolveActorWorkspaceElementAccess(actor({ capabilities: ["element.staff.schedule.view"] }), "staff");
    const schedule = projectPeopleWorkspaceSnapshot(snapshot, scheduleAccess, capacity);
    assert.equal(schedule.people, null);
    assert.equal(schedule.capacity, null);
    assert.deepEqual(schedule.schedule?.people, [{ id: "employee", name: "Sensitive Person" }]);
    assert.doesNotMatch(JSON.stringify(schedule.schedule), /sensitive@example|07000000000|9000000|secret-rule|private-onboarding/);

    const peopleAccess = resolveActorWorkspaceElementAccess(actor({ capabilities: ["element.staff.people.view"] }), "staff");
    const people = projectPeopleWorkspaceSnapshot(snapshot, peopleAccess, capacity);
    assert.ok(people.people);
    assert.equal(people.capacity?.available, true);
    assert.equal(people.schedule, null);
    assert.equal(people.training, null);
    assert.equal(people.pay, null);
  });

  it("keeps route-level mutation guards and hidden direct-view redirects wired", async () => {
    const [teamPage, fulfilmentPage, pipelineRoute, peopleRoute, peoplePage, peopleCommand, proxy, agencyLayout] = await Promise.all([
      readFile(new URL("../src/app/portal/team/[section]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/fulfilment/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/pipelines/move-client/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/api/portal/people/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/people/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/people/_PeopleCommand.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/proxy.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/portal/agency/layout.tsx", import.meta.url), "utf8"),
    ]);
    assert.match(teamPage, /if \(!stations\.some\(item => item\.stationId === stationId\)\)/);
    assert.match(fulfilmentPage, /if \(viewAccess\[view\] === "hidden"\)/);
    assert.match(pipelineRoute, /"fulfilment\.services", "use"/);
    assert.match(peopleRoute, /requireManagerPeopleAction\(access, action, body\)/);
    assert.match(peopleRoute, /projectPeopleWorkspaceSnapshot\(snapshot, access\)/);
    assert.match(peoplePage, /accessLevels\.capacity !== "hidden" \? await staffCapacitySnapshot\(agencyId\) : null/);
    assert.match(peoplePage, /projectPeopleWorkspaceSnapshot\(snapshot, access, capacity\)/);
    assert.match(peopleCommand, /allowedTabs\.includes\(metric\.tab\)/);
    assert.match(peopleCommand, /allowedTabs\.includes\("candidates"\) \? <button/);
    assert.match(proxy, /"\/portal\/agency\/fulfilment"/);
    // The employee-workspace enumeration moved out of `src/proxy.ts` into
    // `src/lib/staffWorkspacePolicy.ts` so the shell, the proxy and the tests
    // read ONE list. The contract this line has always pinned is unchanged —
    // a delegated staff account must reach the pipeline move — so it is now
    // asserted against the policy the proxy consults, and against the proxy
    // actually consulting it rather than keeping a second copy.
    const { isStaffWorkspaceApiPath } = await import("../src/lib/staffWorkspacePolicy");
    assert.equal(isStaffWorkspaceApiPath("/api/portal/pipelines/move-client"), true);
    assert.match(proxy, /isStaffWorkspaceApiPath\(path\)/);
    assert.match(agencyLayout, /const delegatedStaff = session\.role === "agency-staff"/);
  });

  it("does not advertise hidden Fulfilment views from the overview", async () => {
    const workspace = await readFile(new URL("../src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx", import.meta.url), "utf8");

    assert.match(workspace, /const canViewStages = viewAccess\.stages !== "hidden";/);
    assert.match(workspace, /const canViewServices = viewAccess\.services !== "hidden";/);
    assert.match(workspace, /const canViewClients = viewAccess\.clients !== "hidden";/);
    assert.match(workspace, /const canViewPortals = viewAccess\.portals !== "hidden";/);
    assert.match(workspace, /const canViewTechnical = viewAccess\.technical !== "hidden";/);
    assert.match(workspace, /\{canViewStages \? <Link href="\/portal\/agency\/fulfilment\?view=stages"/);
    assert.match(workspace, /\{canViewServices \? <section>[\s\S]*?View all workspaces/);
    assert.match(workspace, /\{canViewClients \? <section className="border-t border-black\/10 pt-6">[\s\S]*?View every client workspace/);
    assert.match(workspace, /\{canViewPortals \? <ToolkitLink href="\/portal\/agency\/fulfilment\?view=portals"/);
    assert.match(workspace, /\{canViewTechnical \? <ToolkitLink href="\/portal\/agency\/fulfilment\?view=technical"/);
    assert.match(workspace, /\{canViewToolkit \? <section className="border-t border-black\/10 pt-6">/);
  });
});
