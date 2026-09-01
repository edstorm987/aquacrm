import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  completedActionDeleteOperationId,
  completedActionsFromDeletePayload,
  readCompletedActions,
} from "../src/lib/inbox/completedActionRead";
import {
  readFulfillmentPhasePresets,
  readFulfillmentPhases,
  resolveFulfillmentPhaseTarget,
} from "../src/lib/clients/fulfillmentPhaseRead";
import {
  canMutateKpiConfiguration,
  customKpiDefinitionsFromPayload,
  readCustomKpiDefinitions,
  readSharedKpiViews,
  sharedKpiViewsFromPayload,
} from "../src/lib/performance/kpiConfigurationRead";
import {
  createCustomKpi,
  CustomKpiOperationError,
  listCustomKpis,
} from "../src/engines/data/server/kpi/customKpis";
import {
  CompletedActionDeleteOperationError,
  deleteCompletedActionForOperation,
  recordCompletedAction,
} from "../src/server/completedActions";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

function response(input: { ok?: boolean; status?: number; payload?: unknown; reject?: boolean }) {
  return async () => {
    if (input.reject) throw new Error("provider refused");
    return {
      ok: input.ok ?? true,
      status: input.status ?? 200,
      json: async () => input.payload,
    };
  };
}

const definition = {
  id: "custom-1",
  label: "Leads per visit",
  numeratorId: "command:recent-leads",
  denominatorId: "command:traffic-7d",
  op: "rate" as const,
  createdAt: 123,
};

const sharedView = {
  id: "view-1",
  name: "Founder pulse",
  kpiIds: ["command:business-health"],
  mode: "plan" as const,
  range: "30d" as const,
  createdAt: 123,
};

const completed = {
  id: "done-1",
  agencyId: "agency-1",
  sourceId: "task-1",
  title: "Call the client",
  outcome: "resolved" as const,
  completedAt: 123,
};

const phase = {
  id: "phase-1",
  stage: "aqua-blueprint",
  label: "Planning",
  order: 2,
  pluginPreset: ["client-crm"],
};

describe("secondary portal reads distinguish empty from unavailable", () => {
  it("accepts confirmed KPI definitions and shared views", async () => {
    const definitions = await readCustomKpiDefinitions(response({ payload: { ok: true, definitions: [definition] } }));
    const views = await readSharedKpiViews(response({ payload: { ok: true, views: [sharedView] } }));

    assert.deepEqual(definitions, { available: true, data: [definition] });
    assert.deepEqual(views, { available: true, data: [sharedView] });
  });

  it("keeps KPI network, HTTP and malformed responses unavailable", async () => {
    const reads = await Promise.all([
      readCustomKpiDefinitions(response({ reject: true })),
      readCustomKpiDefinitions(response({ ok: false, status: 503, payload: { ok: false } })),
      readCustomKpiDefinitions(response({ payload: { ok: true, definitions: [{ id: "broken" }] } })),
      readSharedKpiViews(response({ payload: { ok: true, views: "not-a-list" } })),
    ]);

    for (const read of reads) {
      assert.equal(read.available, false);
      assert.deepEqual(read.data, []);
      assert.match(read.reason ?? "", /could not be read/i);
    }
  });

  it("validates mutation snapshots and locks ambiguous catalogues", () => {
    assert.deepEqual(
      customKpiDefinitionsFromPayload({ ok: true, definitions: [definition] }),
      [definition],
    );
    assert.equal(
      customKpiDefinitionsFromPayload({ ok: true, definitions: [{ ...definition, createdAt: "yesterday" }] }),
      null,
    );
    assert.deepEqual(
      sharedKpiViewsFromPayload({ ok: true, views: [sharedView] }),
      [sharedView],
    );
    assert.equal(
      sharedKpiViewsFromPayload({ ok: true, views: [{ ...sharedView, kpiIds: [42] }] }),
      null,
    );
    assert.equal(canMutateKpiConfiguration("ready"), true);
    assert.equal(canMutateKpiConfiguration("ready", true), false);
    assert.equal(canMutateKpiConfiguration("loading"), false);
    assert.equal(canMutateKpiConfiguration("error"), false);
  });

  it("checks completed history before accepting an empty or populated register", async () => {
    const populated = await readCompletedActions(response({ payload: { ok: true, completed: [completed] } }));
    const empty = await readCompletedActions(response({ payload: { ok: true, completed: [] } }));
    const malformed = await readCompletedActions(response({ payload: { ok: true, completed: [{ id: "broken" }] } }));

    assert.deepEqual(populated, { available: true, data: [completed] });
    assert.deepEqual(empty, { available: true, data: [] });
    assert.equal(malformed.available, false);
    assert.match(malformed.reason ?? "", /Retry before changing/i);
  });

  it("replays a completed-register delete with one stable identity", () => {
    const agencyId = `completed-delete-test-${Date.now()}-${Math.random()}`;
    const entry = recordCompletedAction(agencyId, {
      sourceId: "task-delete-test",
      title: "Delete this retained completion",
      outcome: "resolved",
    }, 123);
    const operationId = completedActionDeleteOperationId(entry.id);

    const first = deleteCompletedActionForOperation(agencyId, entry.id, operationId);
    const replay = deleteCompletedActionForOperation(agencyId, entry.id, operationId);

    assert.equal(first.replayed, false);
    assert.deepEqual(first.completed, []);
    assert.equal(replay.replayed, true, "a retry after a lost success must converge, not 404");
    assert.deepEqual(replay.completed, []);
    assert.deepEqual(
      completedActionsFromDeletePayload({ ok: true, ...replay }, operationId),
      [],
    );
    assert.equal(
      completedActionsFromDeletePayload({ ok: true, ...replay }, `${operationId}:stale`),
      null,
      "a response for another operation must not replace the mounted register",
    );
    assert.throws(
      () => deleteCompletedActionForOperation(agencyId, entry.id, "completed-delete:another-row"),
      CompletedActionDeleteOperationError,
    );
  });

  it("deduplicates an ambiguous custom-KPI create by operation identity", () => {
    const agencyId = `custom-kpi-test-${Date.now()}-${Math.random()}`;
    const operationId = "custom-kpi:test-create-retry";
    const input = {
      label: "Leads per visit",
      numeratorId: "command:recent-leads",
      denominatorId: "command:traffic-7d",
      op: "rate" as const,
    };

    const first = createCustomKpi(agencyId, input, {
      actorUserId: "user-1",
      operationId,
      now: 123,
    });
    const replay = createCustomKpi(agencyId, input, {
      actorUserId: "user-1",
      operationId,
      now: 456,
    });

    assert.equal(replay.id, first.id);
    assert.equal(replay.createdAt, 123, "a replay must return the original row");
    assert.deepEqual(listCustomKpis(agencyId).map(item => item.id), [first.id]);
    assert.throws(
      () => createCustomKpi(agencyId, { ...input, label: "A different intent" }, {
        actorUserId: "user-1",
        operationId,
      }),
      (error: unknown) => error instanceof CustomKpiOperationError && error.status === 409,
    );
    assert.equal(listCustomKpis(agencyId).length, 1);
  });

  it("checks both lifecycle catalogues and retains failures as unavailable", async () => {
    const phases = await readFulfillmentPhases(response({ payload: { ok: true, phases: [phase] } }));
    const presets = await readFulfillmentPhasePresets(response({ payload: { ok: true, presets: [phase] } }));
    const failed = await readFulfillmentPhases(response({ reject: true }));
    const malformed = await readFulfillmentPhasePresets(response({ payload: { ok: true, presets: [{ stage: "broken" }] } }));

    assert.deepEqual(phases, { available: true, data: [phase] });
    assert.deepEqual(presets, { available: true, data: [phase] });
    assert.equal(failed.available, false);
    assert.equal(malformed.available, false);
  });

  it("re-resolves a selected phase through the latest confirmed catalogue", () => {
    const original = { ...phase, label: "Planning", pluginPreset: ["client-crm"] };
    const refreshed = { ...phase, label: "Blueprint", pluginPreset: ["client-crm", "website-editor"] };

    assert.equal(resolveFulfillmentPhaseTarget([original], original.id), original);
    assert.equal(resolveFulfillmentPhaseTarget([refreshed], original.id), refreshed);
    assert.equal(resolveFulfillmentPhaseTarget([], original.id), null);
    assert.equal(resolveFulfillmentPhaseTarget([refreshed], null), null);
  });
});

describe("mounted consumers preserve snapshots, expose retry and lock writes", () => {
  it("KPI definitions and shared views adopt only confirmed reads", () => {
    const workspace = source("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx");
    const customRoute = source("src/app/api/portal/kpi-registry/custom/route.ts");
    assert.match(workspace, /readCustomKpiDefinitions/);
    assert.match(workspace, /readSharedKpiViews/);
    assert.match(workspace, /if \(read\.available\) \{\s*setCustomDefinitions\(read\.data\)/);
    assert.match(workspace, /if \(read\.available\) \{\s*setSharedViews\(read\.data\)/);
    assert.match(workspace, /Retry definitions/);
    assert.match(workspace, /Retry shared views/);
    assert.match(workspace, /canMutateKpiConfiguration\(customReadState, customMutationPending\)/);
    assert.match(workspace, /canMutateKpiConfiguration\(sharedReadState, sharedMutationPending\)/);
    assert.match(workspace, /setCustomReadState\("error"\)/);
    assert.match(workspace, /setSharedReadState\("error"\)/);
    assert.match(workspace, /customCreateOperationRef/);
    assert.match(workspace, /JSON\.stringify\(\{ operationId,/);
    assert.match(workspace, /customMutationInFlightRef\.current/);
    assert.match(workspace, /onChange=\{event => updateCustomForm/);
    assert.match(customRoute, /createCustomKpi\([\s\S]*\{ actorUserId: session\.userId, operationId \}/);
    assert.match(customRoute, /await flushPendingWrites\(\);/);
    assert.doesNotMatch(workspace, /kpi-registry\/custom"\)\.then\([^;]+\.catch\(\(\) => \{\}\)/s);
  });

  it("the completed register retains confirmed history and locks deletion", () => {
    const register = source("src/components/attention/CompletedRegister.tsx");
    const completedRoute = source("src/app/api/portal/attention/completed/route.ts");
    assert.match(register, /if \(read\.available\) \{\s*setEntries\(read\.data\)/);
    assert.match(register, /last confirmed entries remain below and may be stale/i);
    assert.match(register, /Retry history/);
    assert.match(register, /completedActionDeleteOperationId/);
    assert.match(register, /completedActionsFromDeletePayload/);
    assert.match(register, /Retry removal/);
    assert.match(register, /removeInFlightRef\.current/);
    assert.match(register, /disabled=\{state !== "ready" \|\| removing !== null\}/);
    assert.match(completedRoute, /deleteCompletedActionForOperation\(session\.agencyId, id, operationId\)/);
    assert.match(completedRoute, /await flushPendingWrites\(\);/);
  });

  it("client creation and transition controls retain then lock a stale phase catalogue", () => {
    const create = source("src/app/portal/agency/_NewClientButton.tsx");
    const transition = source("src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx");

    assert.match(create, /readFulfillmentPhasePresets/);
    assert.match(create, /if \(!read\.available\) \{[\s\S]*setPresetReadState\("error"\)/);
    assert.match(create, /Retry phases/);
    assert.match(create, /disabled=\{busy \|\| presetReadState !== "ready" \|\| presets\.length === 0\}/);
    assert.match(transition, /readFulfillmentPhases/);
    assert.match(transition, /Last confirmed stages remain visible but locked/);
    assert.match(transition, /Retry stages/);
    assert.match(transition, /if \(phaseReadState !== "ready" \|\| !current \|\| !target\) return/);
  });
});

describe("deep attention builders propagate provider unavailability", () => {
  it("does not turn failed website-enquiry or Radar reads into empty/null evidence", () => {
    const alerts = source("src/lib/server/inbox/operationalAlerts.ts");
    const plans = source("src/lib/server/resolutionPlans.ts");

    assert.doesNotMatch(alerts, /getRequestWebsiteEnquiries\(agencyId\)\.catch\(\(\) => \[\]\)/);
    assert.match(alerts, /readOrUnavailable\([\s\S]*getRequestWebsiteEnquiries\(agencyId\)/);
    assert.match(alerts, /source-unavailable:website-enquiries/);
    assert.doesNotMatch(plans, /getCachedBusinessIssueRadar\(agencyId\)\.catch\(\(\) => null\)/);
    assert.doesNotMatch(plans, /getRequestWebsiteEnquiries\(agencyId\)\.catch\(\(\) => \[\]\)/);
    assert.match(plans, /const radar = await getCachedBusinessIssueRadar\(agencyId\);/);
    assert.match(plans, /const enquiries = await getRequestWebsiteEnquiries\(agencyId\);/);
    assert.match(plans, /websiteEnquiryForResolutionAlert\(enquiries, alertId\)/);
    assert.match(plans, /websiteEnquiryIdsForResolutionLead\(alertId, lead\)/);
    assert.match(plans, /listOperationalAlertsForResolution\(agencyId, alertId, now\)/);
  });
});
