import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { phaseTransitionFailureMessage } from "../src/built-ins/modules/fulfillment/src/lib/transitionFeedback";
import { TransitionService } from "../src/built-ins/modules/fulfillment/src/server/transitions";

type Boundary = "enable" | "variant" | "disable" | "client" | "checklist" | "log";

const fromPhase = {
  id: "phase_from",
  agencyId: "agency_transition",
  stage: "aqua-blueprint",
  label: "Planning",
  order: 20,
  pluginPreset: ["old-plugin"],
  checklist: [],
};

const toPhase = {
  id: "phase_to",
  agencyId: "agency_transition",
  stage: "aqua-diagnostics",
  label: "Content & foundations",
  order: 30,
  pluginPreset: ["target-plugin"],
  portalVariantId: "diagnostic-starter",
  checklist: [{ id: "first", label: "First", visibility: "internal" }],
};

function world(boundary: Boundary) {
  let stage = fromPhase.stage;
  let failed = false;
  let checklistInitialisations = 0;
  const activityKeys = new Set<string>();
  const events: string[] = [];
  const installs = new Map<string, { pluginId: string; enabled: boolean }>([
    ["old-plugin", { pluginId: "old-plugin", enabled: true }],
  ]);
  const values = new Map<string, unknown>();

  function shouldFail(step: Boundary) {
    if (!failed && boundary === step) {
      failed = true;
      return true;
    }
    return false;
  }

  const storage = {
    async get<T>(key: string) {
      const value = values.get(key);
      return value == null ? undefined : structuredClone(value) as T;
    },
    async set<T>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async del(key: string) { values.delete(key); },
    async list() { return Array.from(values.keys()); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
  };

  function service() {
    return new TransitionService(
      {
        getClientForAgency: async () => ({ id: "client_transition", agencyId: "agency_transition", stage }),
        updateClient: async (_agencyId: string, _clientId: string, patch: { stage: string }) => {
          if (shouldFail("client")) return null;
          stage = patch.stage;
          return { id: "client_transition", agencyId: "agency_transition", stage };
        },
      } as never,
      {
        getInstall: async (_scope: unknown, pluginId: string) => installs.get(pluginId) ?? null,
      } as never,
      {
        installPlugin: async ({ pluginId }: { pluginId: string }) => {
          if (shouldFail("enable")) return { ok: false as const, error: "target install refused" };
          const install = { pluginId, enabled: true };
          installs.set(pluginId, install);
          return { ok: true as const, install };
        },
        setEnabled: async ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) => {
          if (!enabled && shouldFail("disable")) return { ok: false as const, error: "old disable refused" };
          const install = installs.get(pluginId);
          if (!install) return { ok: false as const, error: "install missing" };
          install.enabled = enabled;
          return { ok: true as const, install };
        },
      } as never,
      {
        logActivity: async ({ idempotencyKey }: { idempotencyKey?: string }) => {
          if (shouldFail("log")) throw new Error("activity unavailable");
          if (idempotencyKey) activityKeys.add(idempotencyKey);
          return {} as never;
        },
      } as never,
      { emit: (_scope: unknown, name: string) => { events.push(name); } } as never,
      {
        initialiseFor: async () => {
          if (shouldFail("checklist")) throw new Error("checklist unavailable");
          checklistInitialisations += 1;
        },
      } as never,
      {
        apply: async () => shouldFail("variant")
          ? { ok: false as const, error: "variant unavailable" }
          : { ok: true as const, variantId: "diagnostic-starter" },
      } as never,
      storage as never,
    );
  }

  return {
    service,
    storage,
    stage: () => stage,
    install: (pluginId: string) => installs.get(pluginId),
    checklistInitialisations: () => checklistInitialisations,
    activityCount: () => activityKeys.size,
    events,
  };
}

for (const boundary of ["enable", "variant", "disable", "client", "checklist", "log"] as const) {
  test(`phase transition resumes after a ${boundary} boundary failure`, async () => {
    const state = world(boundary);
    const args = {
      agencyId: "agency_transition",
      clientId: "client_transition",
      actor: "user_transition",
      fromPhase,
      toPhase,
      operationId: `phase_transition_${boundary}_0001`,
    } as never;

    const first = await state.service().advancePhase(args);
    assert.equal(first.ok, false);
    if (first.ok) return;
    assert.equal(first.status, "incomplete");
    assert.equal(first.step, boundary);
    assert.equal(first.retryable, true);
    assert.equal(first.requestOperationId, args.operationId);
    assert.match(phaseTransitionFailureMessage(first), /Retry continues the saved operation/);
    assert.equal(
      state.stage(),
      boundary === "log" ? toPhase.stage : fromPhase.stage,
      "the stage must reflect the durable checkpoint reached",
    );

    // Constructing a fresh service and generating a fresh UI operation id
    // simulates a reload. The request key recovers the older durable operation,
    // while the receipt still proves which new request received the response.
    const refreshedOperationId = `phase_transition_${boundary}_refresh_0002`;
    const retried = await state.service().advancePhase({
      ...args,
      operationId: refreshedOperationId,
    });
    assert.equal(retried.ok, true);
    if (!retried.ok) return;
    assert.equal(retried.status, "complete");
    assert.equal(retried.requestOperationId, refreshedOperationId);
    assert.equal(retried.operationId, args.operationId);
    assert.equal(retried.replayed, false);
    assert.equal(state.stage(), toPhase.stage);
    assert.equal(state.install("target-plugin")?.enabled, true);
    assert.equal(state.install("old-plugin")?.enabled, false);
    assert.equal(state.checklistInitialisations(), 1);
    assert.equal(state.activityCount(), 1);
    assert.equal(state.events.filter(name => name === "phase.advanced").length, 1);

    const replayed = await state.service().advancePhase(args);
    assert.equal(replayed.ok, true);
    if (!replayed.ok) return;
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.requestOperationId, args.operationId);
    assert.equal(replayed.operationId, args.operationId);
    assert.equal(state.checklistInitialisations(), 1);
    assert.equal(state.activityCount(), 1);
    assert.equal(state.events.filter(name => name === "phase.advanced").length, 1);
  });
}

test("all mounted transition controls surface saved incomplete outcomes", () => {
  const files = [
    "src/built-ins/modules/fulfillment/src/components/PhaseBoard.tsx",
    "src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx",
    "src/app/portal/clients/[clientId]/_OnboardingDashboardPanel.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /createPhaseTransitionOperationId/);
    assert.match(source, /operationId/);
    assert.match(source, /phaseTransitionFailureMessage/);
  }

  for (const file of files.slice(0, 2)) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /checkedJsonMutation/);
    assert.match(source, /isFulfillmentPhaseTransition/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
});
