import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { before, beforeEach, describe, it } from "node:test";

import { checkedJsonMutation } from "../src/lib/client/checkedMutation";
import {
  isClientMilestoneDeletePayload,
  isClientMilestoneWritePayload,
} from "../src/lib/client/performanceMilestoneMutationPayload";
import { withRequestScope, withSession } from "./dev-console-request-scope";
import type { ClientMilestone } from "../src/server/types";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_STORAGE_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "performance-milestone-mutation-test-secret";
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

type Storage = typeof import("../src/server/storage");
type Auth = typeof import("../src/lib/server/auth/auth");
type Tenants = typeof import("../src/server/tenants");
type Users = typeof import("../src/server/users");
type MilestonesRoute = typeof import("../src/app/api/tenants/client-milestones/route");

let storage: Storage;
let auth: Auth;
let tenants: Tenants;
let users: Users;
let milestonesRoute: MilestonesRoute;

before(async () => {
  [storage, auth, tenants, users, milestonesRoute] = await Promise.all([
    import("../src/server/storage"),
    import("../src/lib/server/auth/auth"),
    import("../src/server/tenants"),
    import("../src/server/users"),
    import("../src/app/api/tenants/client-milestones/route"),
  ]);
});

beforeEach(async () => {
  await storage.reset();
});

function sampleMilestone(overrides: Partial<ClientMilestone> = {}): ClientMilestone {
  return {
    id: "mile_one",
    agencyId: "agency_one",
    clientId: "client_one",
    title: "Launch",
    status: "not-started",
    progress: 0,
    sortOrder: 0,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000,
    ...overrides,
  };
}

function milestoneRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tenants/client-milestones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fixture() {
  const agency = tenants.createAgency({ name: "Milestone mutation checks" });
  const operator = users.createUser({
    email: `manager-${agency.id}@milestones.test`,
    name: "Milestone manager",
    role: "agency-manager",
    agencyId: agency.id,
    password: "test-password",
  });
  const client = tenants.createClient(agency.id, { name: "Milestone client" });
  storage.mutate(state => {
    state.accessGrants.milestoneMutationGrant = {
      id: "milestoneMutationGrant",
      agencyId: agency.id,
      userId: operator.id,
      scope: { kind: "client", id: client.id },
      environment: "live",
      capabilities: [
        "element.client.fulfilment.view",
        "element.client.fulfilment.use",
        "element.client.fulfilment.manage",
      ],
      createdBy: operator.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });
  const token = auth.issueSession({
    userId: operator.id,
    email: operator.email,
    role: operator.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    sessionRev: operator.sessionRev ?? 0,
  });
  await storage.flushPendingWrites();
  return { agency, client, token };
}

describe("Performance milestone mutation receipts", () => {
  it("requires the exact milestone identity and its matching authoritative client collection", () => {
    const milestone = sampleMilestone();
    const valid = { ok: true, milestone, milestones: [milestone] };
    const expectedCreate = { clientId: milestone.clientId, fields: { title: milestone.title, status: milestone.status, progress: milestone.progress } };
    const expectedUpdate = { clientId: milestone.clientId, milestoneId: milestone.id, fields: { status: milestone.status, progress: milestone.progress } };
    assert.equal(isClientMilestoneWritePayload(valid, expectedCreate), true);
    assert.equal(isClientMilestoneWritePayload(valid, expectedUpdate), true);
    assert.equal(isClientMilestoneWritePayload(valid, { ...expectedUpdate, milestoneId: "mile_other" }), false);
    assert.equal(isClientMilestoneWritePayload({ ...valid, milestone: { ...milestone, clientId: "client_other" } }, expectedCreate), false);
    assert.equal(isClientMilestoneWritePayload({ ...valid, milestones: [{ ...milestone, progress: 50 }] }, expectedCreate), false);
    assert.equal(isClientMilestoneWritePayload({ ...valid, milestones: [milestone, milestone] }, expectedCreate), false);
    assert.equal(isClientMilestoneWritePayload({ ok: false, milestone, milestones: [milestone] }, expectedCreate), false);
  });

  it("rejects correct-scope 200 receipts that do not match the requested create or update", () => {
    const milestone = sampleMilestone();
    const wrongCreate = sampleMilestone({ title: "A different server-created milestone" });
    assert.equal(isClientMilestoneWritePayload({ ok: true, milestone: wrongCreate, milestones: [wrongCreate] }, {
      clientId: milestone.clientId,
      fields: { title: milestone.title, description: undefined, metric: undefined, targetValue: undefined, autoTrack: false },
    }), false);
    const wrongUpdate = sampleMilestone({ progress: 10, status: "not-started" });
    assert.equal(isClientMilestoneWritePayload({ ok: true, milestone: wrongUpdate, milestones: [wrongUpdate] }, {
      clientId: milestone.clientId,
      milestoneId: milestone.id,
      fields: { progress: 55, status: "in-progress" },
    }), false);
  });

  it("requires exact delete identities and an authoritative collection without the deleted milestone", () => {
    const remaining = sampleMilestone({ id: "mile_two" });
    const valid = { ok: true, clientId: "client_one", milestoneId: "mile_one", milestones: [remaining] };
    assert.equal(isClientMilestoneDeletePayload(valid, "client_one", "mile_one"), true);
    assert.equal(isClientMilestoneDeletePayload({ ...valid, clientId: "client_other" }, "client_one", "mile_one"), false);
    assert.equal(isClientMilestoneDeletePayload({ ...valid, milestoneId: "mile_other" }, "client_one", "mile_one"), false);
    assert.equal(isClientMilestoneDeletePayload({ ...valid, milestones: [sampleMilestone()] }, "client_one", "mile_one"), false);
  });

  it("does not cross the checked boundary on transport, unreadable, HTTP, domain or wrong-identity success", async () => {
    const milestone = sampleMilestone();
    const accepts = async (fetcher: typeof fetch) => {
      let continued = false;
      try {
        await checkedJsonMutation(
          "/api/tenants/client-milestones",
          { method: "POST" },
          {
            fallback: "The milestone could not be updated.",
            fetcher,
            validate: value => isClientMilestoneWritePayload(value, {
              clientId: milestone.clientId,
              milestoneId: milestone.id,
              fields: { progress: milestone.progress, status: milestone.status },
            }),
          },
        );
        continued = true;
      } catch {
        // The UI follows this branch: it reports the error and retains the row/form state.
      }
      return continued;
    };

    assert.equal(await accepts(async () => { throw new TypeError("offline"); }), false);
    assert.equal(await accepts(async () => new Response("not json", { status: 200 })), false);
    assert.equal(await accepts(async () => Response.json({ error: "Refused" }, { status: 409 })), false);
    assert.equal(await accepts(async () => Response.json({ ok: false, error: "Refused" })), false);
    assert.equal(await accepts(async () => Response.json({ ok: true, milestone: { ...milestone, id: "mile_wrong" }, milestones: [{ ...milestone, id: "mile_wrong" }] })), false);
    assert.equal(await accepts(async () => Response.json({ ok: true, milestone, milestones: [milestone] })), true);
  });

  it("returns authoritative create, update and delete snapshots from the real route", async () => {
    const home = await fixture();
    const invalidAction = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({
      action: "unexpected",
      clientId: home.client.id,
      milestoneId: "mile_missing",
    })));
    assert.equal(invalidAction.status, 400);
    const missingUpdateId = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({
      action: "update",
      clientId: home.client.id,
      progress: 55,
    })));
    assert.equal(missingUpdateId.status, 400);

    const createResponse = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({
      action: "create",
      clientId: home.client.id,
      title: "Launch the client site",
    })));
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as { ok: true; milestone: ClientMilestone; milestones: ClientMilestone[] };
    assert.deepEqual(Object.keys(created).sort(), ["milestone", "milestones", "ok"]);
    assert.equal(isClientMilestoneWritePayload(created, {
      clientId: home.client.id,
      fields: {
        title: "Launch the client site",
        description: undefined,
        status: "not-started",
        progress: 0,
        targetAt: undefined,
        metric: undefined,
        targetValue: undefined,
        autoTrack: false,
      },
    }), true);
    assert.deepEqual(created.milestones.map(item => item.id), [created.milestone.id]);

    const secondResponse = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({
      action: "create",
      clientId: home.client.id,
      title: "Publish the launch report",
    })));
    assert.equal(secondResponse.status, 200);
    const second = await secondResponse.json() as { ok: true; milestone: ClientMilestone; milestones: ClientMilestone[] };
    assert.equal(isClientMilestoneWritePayload(second, {
      clientId: home.client.id,
      fields: { title: "Publish the launch report", status: "not-started", progress: 0 },
    }), true);
    assert.deepEqual(second.milestones.map(item => item.id), [created.milestone.id, second.milestone.id]);

    const updateResponse = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({
      action: "update",
      clientId: home.client.id,
      milestoneId: created.milestone.id,
      progress: 55,
      status: "in-progress",
    })));
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json() as { ok: true; milestone: ClientMilestone; milestones: ClientMilestone[] };
    assert.equal(isClientMilestoneWritePayload(updated, {
      clientId: home.client.id,
      milestoneId: created.milestone.id,
      fields: { progress: 55, status: "in-progress" },
    }), true);
    assert.equal(updated.milestone.progress, 55);
    assert.equal(updated.milestones[0]?.progress, 55);
    assert.deepEqual(updated.milestones.map(item => item.id), [created.milestone.id, second.milestone.id]);

    const deleteResponse = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({
      action: "delete",
      clientId: home.client.id,
      milestoneId: created.milestone.id,
    })));
    assert.equal(deleteResponse.status, 200);
    const deleted = await deleteResponse.json() as { ok: true; clientId: string; milestoneId: string; milestones: ClientMilestone[] };
    assert.deepEqual(Object.keys(deleted).sort(), ["clientId", "milestoneId", "milestones", "ok"]);
    assert.equal(isClientMilestoneDeletePayload(deleted, home.client.id, created.milestone.id), true);
    assert.deepEqual(deleted.milestones.map(item => item.id), [second.milestone.id]);
  });

  it("pins checked mutation, settled state and visible refusal handling in the client surface", () => {
    const source = readFileSync(join(process.cwd(), "src/app/portal/agency/performance/_PerformanceWorkspace.tsx"), "utf8");
    const rowStart = source.indexOf("function MilestoneRow(");
    const modalStart = source.indexOf("function NewMilestone(", rowStart);
    const modalEnd = source.indexOf("\nfunction score(", modalStart);
    assert.ok(rowStart >= 0 && modalStart > rowStart && modalEnd > modalStart);
    const row = source.slice(rowStart, modalStart);
    const modal = source.slice(modalStart, modalEnd);
    const clientPerformance = source.slice(source.indexOf("function ClientPerformance("), rowStart);

    assert.doesNotMatch(row, /\bfetch\s*\(/);
    assert.doesNotMatch(modal, /\bfetch\s*\(/);
    assert.ok((row.match(/checkedJsonMutation/g) ?? []).length >= 2);
    assert.match(modal, /checkedJsonMutation/);
    assert.ok((row.match(/finally/g) ?? []).length >= 2);
    assert.match(modal, /finally/);
    assert.match(row, /operationInFlight\.current/);
    assert.match(modal, /operationInFlight\.current/);
    assert.match(row, /onMilestones\(payload\.milestones, sequence\)/);
    assert.match(modal, /onCreated\(payload\.milestones, sequence\)/);
    assert.match(row, /const sequence = onMutationStart\(operationId\);\s*if \(sequence === null\) return;/);
    assert.match(modal, /const sequence = onMutationStart\(operationId\);\s*if \(sequence === null\)/);
    assert.match(modal, /\.trim\(\)\.slice\(0, 160\)\.trim\(\)/, "the title must trim after the cap like the server");
    assert.match(modal, /\.trim\(\)\.slice\(0, 1_000\)\.trim\(\)/, "the description must trim after the cap like the server");
    assert.match(clientPerformance, /function beginMilestoneMutation\(operationId: string\): number \| null \{[\s\S]{0,260}?return beginMilestoneSequence\(\);/);
    assert.match(clientPerformance, /onMilestones: \(items: ClientMilestone\[\], sequence: number\) => void/);
    assert.match(row, /disabled=\{mutationDisabled\}/);
    assert.match(modal, /disabled=\{busy\}/);
    assert.match(row, /role="alert"/);
    assert.match(modal, /role="alert"/);
    assert.match(row, /mutationErrorMessage/);
    assert.match(modal, /mutationErrorMessage/);
    assert.match(clientPerformance, /milestoneMutationInFlight/);
    assert.match(clientPerformance, /beginMilestoneMutation/);
    assert.match(clientPerformance, /finishMilestoneMutation/);
    assert.match(clientPerformance, /disabled=\{milestoneMutationId !== null\}/);
    assert.match(row, /onMutationStart\(operationId\)/);
    assert.match(row, /onMutationEnd\(operationId\)/);
    assert.match(row, /Saving milestone\.\.\./);
  });
});

describe("Performance milestone route validation and error classification", () => {
  it("answers every malformed field with a safe 400 before persistence and keeps the store unchanged", async () => {
    const home = await fixture();
    const post = (body: unknown) => withSession(home.token, () => milestonesRoute.POST(new Request("http://localhost/api/tenants/client-milestones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })));
    const refusal = async (body: unknown, error: string) => {
      const response = await post(body);
      assert.equal(response.status, 400, `${error}: expected 400, got ${response.status}`);
      assert.deepEqual(await response.json(), { ok: false, error });
    };
    const create = { action: "create", clientId: home.client.id, title: "Launch" };
    await refusal("not json", "clientId and a valid action are required");
    await refusal({ action: "create", clientId: 42, title: "Launch" }, "clientId and a valid action are required");
    await refusal({ action: "create", clientId: home.client.id }, "Milestone title required.");
    await refusal({ action: "create", clientId: home.client.id, title: "   " }, "Milestone title required.");
    await refusal({ ...create, title: 7 }, "Milestone title must be text.");
    await refusal({ ...create, description: ["x"] }, "Milestone description must be text.");
    await refusal({ ...create, status: "done" }, "Choose a valid milestone status.");
    await refusal({ ...create, progress: "55" }, "Progress must be a number between 0 and 100.");
    await refusal({ ...create, progress: 101 }, "Progress must be a number between 0 and 100.");
    await refusal({ ...create, targetAt: "2026-09-01" }, "Choose a valid target date.");
    await refusal({ ...create, metric: "revenue" }, "Choose a valid milestone metric.");
    await refusal({ ...create, targetValue: 0 }, "Target value must be a number above zero.");
    await refusal({ ...create, autoTrack: "yes" }, "autoTrack must be true or false.");
    await refusal({ action: "update", clientId: home.client.id, milestoneId: "", progress: 5 }, "milestoneId required");
    const list = await withSession(home.token, () => milestonesRoute.GET(new Request(`http://localhost/api/tenants/client-milestones?clientId=${home.client.id}`)));
    assert.deepEqual((await list.json() as { milestones: unknown[] }).milestones, [], "refused writes must not create milestones");

    const missing = await post({ action: "update", clientId: home.client.id, milestoneId: "mile_missing", progress: 5 });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { ok: false, error: "milestone not found" });
    const missingDelete = await post({ action: "delete", clientId: home.client.id, milestoneId: "mile_missing" });
    assert.equal(missingDelete.status, 404);
    assert.deepEqual(await missingDelete.json(), { ok: false, error: "milestone not found" });
    const unknownClient = await post({ action: "create", clientId: "cli_missing", title: "Launch" });
    assert.equal(unknownClient.status, 404);
    assert.deepEqual(await unknownClient.json(), { ok: false, error: "client not found" });
  });

  it("answers an unexpected failure with a generic 500 that carries no internal detail", async () => {
    const errors = await import("../src/lib/server/performance/performanceMutationErrors");
    const milestones = await import("../src/server/clientMilestones");
    const response = errors.performanceMutationErrorResponse(new Error("ENOSPC: no space left on device, write '/private/state.json'"), { fallback: "The milestone could not be updated." });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, error: "The milestone could not be updated." });
    const validation = errors.performanceMutationErrorResponse(new milestones.ClientMilestoneValidationError("Milestone title required."), { fallback: "The milestone could not be updated." });
    assert.equal(validation.status, 400);
    assert.deepEqual(await validation.json(), { ok: false, error: "Milestone title required." });
  });
});


describe("Performance milestone normalisation and authentication order", () => {
  it("stores a title cut at the cap on a space exactly as the dialog expects it", async () => {
    const home = await fixture();
    const raw = `${"L".repeat(159)} tail`.slice(0, 160);
    assert.notEqual(raw, raw.trim(), "fixture must end with a space at the cap");
    const title = raw.trim();
    const response = await withSession(home.token, () => milestonesRoute.POST(milestoneRequest({ action: "create", clientId: home.client.id, title })));
    assert.equal(response.status, 200);
    const created = await response.json();
    assert.equal(created.milestone.title, title);
    assert.equal(isClientMilestoneWritePayload(created, { clientId: home.client.id, fields: { title, description: undefined, status: "not-started", progress: 0, targetAt: undefined, metric: undefined, targetValue: undefined, autoTrack: false } }), true);
  });

  it("checks fields only after the caller is authenticated and permitted", async () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/tenants/client-milestones/route.ts"), "utf8");
    const post = source.slice(source.indexOf("export async function POST("));
    const targetAt = post.indexOf("parseMilestoneTarget(");
    const authAt = post.indexOf("requireRoleForClient(");
    const gateAt = post.indexOf("requireCurrentClientWorkspaceElementAccess(");
    const fieldsAt = post.indexOf("parseMilestoneFields(target)");
    assert.ok(targetAt >= 0 && authAt > targetAt && gateAt > authAt && fieldsAt > gateAt, "target → authenticate → permit → validate fields");
    // An anonymous caller with a malformed body learns nothing about field rules: it is refused as unauthenticated.
    const anonymous = await withRequestScope({}, () => milestonesRoute.POST(milestoneRequest({ action: "create", clientId: "cli_any", title: 7 })));
    assert.equal(anonymous.status, 401);
  });
});
