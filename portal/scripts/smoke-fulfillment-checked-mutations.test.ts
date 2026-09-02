import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CheckedMutationError,
  checkedJsonMutation,
} from "../src/lib/client/checkedMutation";
import {
  isFulfillmentChecklistTick,
  isFulfillmentClientCreation,
  isFulfillmentPhaseDelete,
  isFulfillmentPhaseMutation,
  isFulfillmentPhaseTransition,
  isFulfillmentPhaseTransitionFailure,
  isFulfillmentPluginMutation,
  isFulfillmentPluginUninstall,
} from "../src/built-ins/modules/fulfillment/src/lib/mutationPayloads";
import { checklistViewAfterTick } from "../src/built-ins/modules/fulfillment/src/lib/checklistView";

const ROOT = process.cwd();
const COMPONENT_ROOT = "src/built-ins/modules/fulfillment/src/components";

const MUTATION_COMPONENTS = [
  "PhasesSettingsList.tsx",
  "NewClientModal.tsx",
  "ChecklistWidget.tsx",
  "PhaseBoard.tsx",
  "PluginCard.tsx",
] as const;

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function response(body: string, status = 200): typeof fetch {
  return async () => new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function functionSlice(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `Missing function marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing function end marker: ${end}`);
  return contents.slice(startIndex, endIndex);
}

describe("Fulfillment strict mutation payloads", () => {
  it("publishes a confirmed client checklist tick before transient optimism clears", () => {
    const view = {
      internal: [],
      client: [{ id: "client-task", label: "Approve", visibility: "client" as const, done: false }],
      internalDone: 0,
      internalTotal: 0,
      clientDone: 0,
      clientTotal: 1,
      allRequiredComplete: false,
    };
    const confirmed = checklistViewAfterTick(view, "client-task", true);
    assert.equal(confirmed.client[0]?.done, true);
    assert.equal(confirmed.clientDone, 1);
    assert.equal(confirmed.allRequiredComplete, true);
    assert.equal(view.client[0]?.done, false, "the original confirmed view remains immutable");
  });

  it("requires exact phase save and delete identities", () => {
    const saved = {
      ok: true,
      phase: {
        id: "phase_design",
        agencyId: "agency_a",
        stage: "design",
        label: "Design",
      },
    };
    assert.equal(isFulfillmentPhaseMutation(saved, {
      id: "phase_design",
      stage: "design",
      label: "Design",
    }), true);
    assert.equal(isFulfillmentPhaseMutation(saved, {
      id: "phase_other",
      stage: "design",
      label: "Design",
    }), false);
    assert.equal(isFulfillmentPhaseMutation({ ok: true, phase: [] }, {
      stage: "design",
      label: "Design",
    }), false);
    assert.equal(isFulfillmentPhaseDelete({ ok: true }, "phase_design"), false);
    assert.equal(isFulfillmentPhaseDelete({ ok: true, phaseId: "phase_other" }, "phase_design"), false);
    assert.equal(isFulfillmentPhaseDelete({ ok: true, phaseId: "phase_design" }, "phase_design"), true);
  });

  it("requires a complete created client in the exact selected phase", () => {
    const created = {
      ok: true,
      operationId: "new-client:operation_a",
      client: { id: "client_a", name: "Acme", slug: "acme" },
      lifecycle: {
        phase: { id: "phase_design", agencyId: "agency_a", stage: "design" },
        checklist: { ok: true },
        complete: true,
        failures: [],
      },
      replayed: false,
    };
    const expected = { operationId: "new-client:operation_a", name: "Acme", stage: "design" };
    assert.equal(isFulfillmentClientCreation(created, expected), true);
    assert.equal(isFulfillmentClientCreation({ ...created, operationId: "new-client:other" }, expected), false);
    assert.equal(isFulfillmentClientCreation({
      ...created,
      lifecycle: { ...created.lifecycle, complete: false },
    }, expected), false);
    assert.equal(isFulfillmentClientCreation({
      ...created,
      lifecycle: {
        ...created.lifecycle,
        phase: { id: "phase_other", agencyId: "agency_a", stage: "live" },
      },
    }, expected), false);
    assert.equal(isFulfillmentClientCreation({
      ...created,
      client: { id: "client_a", name: "Other", slug: "other" },
    }, expected), false);
  });

  it("requires the exact checklist cell and requested value", () => {
    const expected = {
      clientId: "client_a",
      phaseId: "phase_design",
      itemId: "task_a",
      done: true,
    };
    const ticked = {
      ok: true,
      progress: {
        clientId: "client_a",
        phaseId: "phase_design",
        updatedAt: 123,
        items: { task_a: { done: true } },
      },
    };
    assert.equal(isFulfillmentChecklistTick(ticked, expected), true);
    assert.equal(isFulfillmentChecklistTick({
      ...ticked,
      progress: { ...ticked.progress, clientId: "client_other" },
    }, expected), false);
    assert.equal(isFulfillmentChecklistTick({
      ...ticked,
      progress: { ...ticked.progress, items: { task_a: { done: false } } },
    }, expected), false);
    assert.equal(isFulfillmentChecklistTick({
      ...ticked,
      progress: { ...ticked.progress, items: {} },
    }, expected), false);
  });

  it("requires exact transition and plugin operation identities", () => {
    const transition = {
      ok: true,
      status: "complete",
      requestOperationId: "operation_a",
      operationId: "operation_a",
      retryable: false,
      replayed: false,
      client: { id: "client_a", stage: "live" },
    };
    const expectedTransition = { operationId: "operation_a", clientId: "client_a", stage: "live" };
    assert.equal(isFulfillmentPhaseTransition(transition, expectedTransition), true);
    assert.equal(isFulfillmentPhaseTransition({ ...transition, requestOperationId: "operation_other" }, expectedTransition), false);
    assert.equal(isFulfillmentPhaseTransition({ ...transition, operationId: "older_operation" }, expectedTransition), true);
    assert.equal(isFulfillmentPhaseTransition({ ...transition, status: "incomplete" }, expectedTransition), false);
    assert.equal(isFulfillmentPhaseTransitionFailure({
      ok: false,
      status: "incomplete",
      requestOperationId: "operation_a",
      error: "Plugin setup is incomplete.",
    }), true);
    assert.equal(isFulfillmentPhaseTransitionFailure({ ok: false, error: "Missing status." }), false);

    const pluginExpected = { clientId: "client_a", pluginId: "website-editor", enabled: true };
    const installed = {
      ok: true,
      install: {
        id: "agency_a|client_a|website-editor",
        clientId: "client_a",
        pluginId: "website-editor",
        enabled: true,
      },
    };
    assert.equal(isFulfillmentPluginMutation(installed, pluginExpected), true);
    assert.equal(isFulfillmentPluginMutation({
      ...installed,
      install: { ...installed.install, clientId: "client_other" },
    }, pluginExpected), false);
    assert.equal(isFulfillmentPluginMutation({
      ...installed,
      install: { ...installed.install, enabled: false },
    }, pluginExpected), false);
    assert.equal(isFulfillmentPluginUninstall({ ok: true }, pluginExpected), false);
    assert.equal(isFulfillmentPluginUninstall({
      ok: true,
      clientId: "client_a",
      pluginId: "website-editor",
    }, pluginExpected), true);
  });
});

describe("Fulfillment checked mutation failure boundary", () => {
  const expectedPhase = { id: "phase_design", stage: "design", label: "Design" };
  const validPhase = JSON.stringify({
    ok: true,
    phase: { ...expectedPhase, agencyId: "agency_a" },
  });

  const cases: Array<{
    name: string;
    fetcher: typeof fetch;
    kind: CheckedMutationError["kind"];
  }> = [
    {
      name: "transport failure",
      fetcher: async () => { throw new TypeError("offline"); },
      kind: "transport",
    },
    { name: "malformed JSON", fetcher: response("not-json"), kind: "response" },
    { name: "HTTP failure", fetcher: response(JSON.stringify({ ok: false }), 503), kind: "http" },
    {
      name: "2xx domain refusal",
      fetcher: response(JSON.stringify({ ok: false, error: "Phase changed." })),
      kind: "domain",
    },
    {
      name: "malformed 2xx success",
      fetcher: response(JSON.stringify({ ok: true, phase: { id: "phase_design" } })),
      kind: "domain",
    },
  ];

  for (const scenario of cases) {
    it(`preserves visible state and leaves retry available after ${scenario.name}`, async () => {
      let visiblePhase = "phase_design";
      let reloads = 0;
      let retryAvailable = false;

      try {
        await checkedJsonMutation<unknown>("/api/portal/fulfillment/phases", { method: "POST" }, {
          fallback: "Could not save phase.",
          fetcher: scenario.fetcher,
          validate: payload => isFulfillmentPhaseMutation(payload, expectedPhase),
        });
        visiblePhase = "replaced";
        reloads += 1;
      } catch (reason) {
        retryAvailable = reason instanceof CheckedMutationError && reason.kind === scenario.kind;
      }

      assert.equal(visiblePhase, "phase_design");
      assert.equal(reloads, 0);
      assert.equal(retryAvailable, true);
    });
  }

  it("permits continuation after a strictly matching retry", async () => {
    let reloads = 0;
    await checkedJsonMutation<unknown>("/api/portal/fulfillment/phases", { method: "POST" }, {
      fallback: "Could not save phase.",
      fetcher: response(validPhase),
      validate: payload => isFulfillmentPhaseMutation(payload, expectedPhase),
    });
    reloads += 1;
    assert.equal(reloads, 1);
  });
});

describe("Fulfillment mutation component wiring", () => {
  it("keeps every networked component on the shared checked boundary", () => {
    for (const file of MUTATION_COMPONENTS) {
      const contents = source(`${COMPONENT_ROOT}/${file}`);
      assert.match(contents, /checkedJsonMutation/, `${file} must use checkedJsonMutation`);
      assert.doesNotMatch(contents, /\bfetch\s*\(/, `${file} must not bypass checkedJsonMutation`);
      assert.match(contents, /isFulfillment[A-Z]/, `${file} must validate its domain payload`);
    }
  });

  it("keeps phase drafts and client input mounted until exact success", () => {
    const phases = source(`${COMPONENT_ROOT}/PhasesSettingsList.tsx`);
    const deleteFlow = functionSlice(phases, "async function deletePhase", "\n\n  return (");
    const saveFlow = functionSlice(phases, "async function save", "\n\n  return (");
    assert.ok(deleteFlow.indexOf("await checkedJsonMutation") < deleteFlow.indexOf("window.location.reload"));
    assert.match(deleteFlow, /catch \(reason\)[\s\S]*setError[\s\S]*finally[\s\S]*setDeletingId\(null\)/);
    assert.ok(saveFlow.indexOf("await checkedJsonMutation") < saveFlow.indexOf("window.location.reload"));
    assert.match(saveFlow, /catch \(reason\)[\s\S]*setError[\s\S]*finally[\s\S]*setBusy\(false\)/);

    const client = source(`${COMPONENT_ROOT}/NewClientModal.tsx`);
    const createFlow = functionSlice(client, "async function submit", "\n\n  return (");
    const boundary = createFlow.indexOf("await checkedJsonMutation");
    assert.ok(boundary >= 0);
    assert.ok(createFlow.indexOf("onCreated?.()") > boundary);
    assert.ok(createFlow.indexOf("onClose()") > boundary);
    assert.match(createFlow, /catch \(reason\)[\s\S]*setError[\s\S]*finally[\s\S]*setBusy\(false\)/);
    assert.match(createFlow, /pendingOperationRef\.current\?\.fingerprint !== fingerprint/);
    assert.match(createFlow, /operationId: requestOperationId/);
  });

  it("commits checklist and transition UI only after exact receipts", () => {
    const board = source(`${COMPONENT_ROOT}/PhaseBoard.tsx`);
    const tickFlow = functionSlice(board, "async function tickInternal", "\n\n  async function advance");
    const tickBoundary = tickFlow.indexOf("await checkedJsonMutation");
    assert.ok(tickBoundary >= 0);
    assert.ok(tickFlow.indexOf("setCurrentView") > tickBoundary);

    const advanceFlow = functionSlice(board, "async function advance", "\n\n  return (");
    const advanceBoundary = advanceFlow.indexOf("await checkedJsonMutation");
    assert.ok(advanceBoundary >= 0);
    assert.ok(advanceFlow.indexOf("operationIdRef.current = null") > advanceBoundary);
    assert.ok(advanceFlow.indexOf("window.location.reload") > advanceBoundary);
    assert.match(advanceFlow, /catch \(reason\)[\s\S]*setError/);
    assert.doesNotMatch(advanceFlow, /finally[\s\S]*setConfirmAdvance\(false\)/);

    const column = source(`${COMPONENT_ROOT}/ChecklistColumn.tsx`);
    assert.match(column, /setOptimistic[\s\S]*await onTick[\s\S]*finally[\s\S]*delete copy\[task\.id\]/);
    assert.match(column, /busy=\{busyId !== null\}/);
    assert.match(column, /if \(!onTick \|\| busyId !== null\) return/);
    assert.match(column, /role="alert"/);
    assert.match(column, /previous checklist state is still shown; try again/i);

    const widget = source(`${COMPONENT_ROOT}/ChecklistWidget.tsx`);
    assert.match(widget, /const \[currentView, setCurrentView\] = useState\(view\)/);
    assert.match(widget, /await checkedJsonMutation[\s\S]*setCurrentView\(current => checklistViewAfterTick/);
    assert.match(widget, /items=\{currentView\.client\}/);
  });

  it("runs plugin callbacks and reload only after an identity-checked receipt", () => {
    const plugin = source(`${COMPONENT_ROOT}/PluginCard.tsx`);
    const flow = functionSlice(plugin, "async function call", "\n\n  return (");
    const boundary = flow.indexOf("await checkedJsonMutation");
    assert.ok(boundary >= 0);
    assert.ok(flow.indexOf("onChanged?.()") > boundary);
    assert.ok(flow.indexOf("window.location.reload") > boundary);
    assert.match(flow, /isFulfillmentPluginUninstall/);
    assert.match(flow, /isFulfillmentPluginMutation/);
    assert.match(flow, /finally[\s\S]*setBusy\(null\)/);
  });

  it("returns exact delete and uninstall receipts from the API", () => {
    const handlers = source("src/built-ins/modules/fulfillment/src/api/handlers.ts");
    const deleteFlow = functionSlice(handlers, "export async function deletePhaseHandler", "\n\n// ─── Marketplace");
    assert.match(deleteFlow, /phaseId: id/);
    const uninstallFlow = functionSlice(handlers, "export async function marketplaceUninstallHandler", "\n\n// ─── Activity");
    assert.match(uninstallFlow, /clientId: body\.clientId, pluginId: body\.pluginId/);
  });

  it("keeps the mounted client and transition controls on concrete checked contracts", () => {
    const client = source("src/app/portal/agency/_NewClientButton.tsx");
    assert.match(client, /checkedJsonMutation<FulfillmentClientCreationPayload>/);
    assert.match(client, /isFulfillmentClientCreation/);
    assert.doesNotMatch(client, /\bfetch\s*\(/);
    assert.match(client, /contactTimestamp: number/);
    assert.match(client, /createdAt: draftOperation\.contactTimestamp/);
    assert.match(client, /updatedAt: draftOperation\.contactTimestamp/);
    assert.match(client, /draftOperation\.fingerprint !== requestFingerprint/);

    const transition = source("src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx");
    assert.match(transition, /checkedJsonMutation/);
    assert.match(transition, /isFulfillmentPhaseTransition/);
    assert.doesNotMatch(transition, /\bfetch\s*\(/);

    const route = source("src/app/api/portal/fulfillment/clients/route.ts");
    assert.match(route, /getInstall\(\{ agencyId \}, "fulfillment"\)/);
    assert.match(route, /fulfillmentInstall\?\.config\.defaultStage/);
    assert.ok((route.match(/operationId,/g) ?? []).length >= 6);
  });
});
