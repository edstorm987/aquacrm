import assert from "node:assert/strict";
import test from "node:test";

import { ClientLifecycleService } from "../src/built-ins/modules/fulfillment/src/server/clients";
import { TransitionService } from "../src/built-ins/modules/fulfillment/src/server/transitions";

test("a client can jump directly to a later stage with an audit reason", async () => {
  const activity: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  let stage = "aqua-epic-intro";

  const service = new TransitionService(
    {
      updateClient: async (_agencyId: string, _clientId: string, patch: { stage: string }) => {
        stage = patch.stage;
        return { id: "client_friend", agencyId: "agency_milesymedia", stage } as never;
      },
    } as never,
    {} as never,
    {} as never,
    {
      logActivity: async (entry: { message: string; metadata?: Record<string, unknown> }) => {
        activity.push(entry);
        return entry as never;
      },
    } as never,
    {
      emit: (_scope: unknown, name: string, payload: Record<string, unknown>) => {
        events.push({ name, payload });
      },
    } as never,
    {
      initialiseFor: async () => undefined,
    } as never,
    {
      apply: async () => ({ skipped: true }),
    } as never,
  );

  const result = await service.advancePhase({
    agencyId: "agency_milesymedia",
    clientId: "client_friend",
    actor: "user_ed",
    fromPhase: {
      id: "phase_onboarding",
      agencyId: "agency_milesymedia",
      stage: "aqua-epic-intro",
      label: "Onboarding",
      order: 10,
      pluginPreset: [],
    } as never,
    toPhase: {
      id: "phase_live",
      agencyId: "agency_milesymedia",
      stage: "aqua-mastery",
      label: "Live care",
      order: 60,
      pluginPreset: [],
    } as never,
    reason: "Friend project; website already built.",
    directJump: true,
    skippedStageCount: 4,
  });

  assert.equal(result.ok, true);
  assert.equal(stage, "aqua-mastery");
  assert.equal(activity.length, 1);
  assert.match(activity[0].message, /Moved directly to Live care/);
  assert.match(activity[0].message, /Friend project/);
  assert.equal(activity[0].metadata?.directJump, true);
  assert.equal(activity[0].metadata?.skippedStageCount, 4);
  assert.equal(events[0]?.name, "phase.advanced");
  assert.equal(events[0]?.payload.directJump, true);
});

test("a new client can start midway through the lifecycle", async () => {
  const activity: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  const phases = [
    { id: "phase_intro", agencyId: "agency_milesymedia", stage: "aqua-epic-intro", label: "Onboarding", order: 10, pluginPreset: [] },
    { id: "phase_plan", agencyId: "agency_milesymedia", stage: "aqua-blueprint", label: "Planning", order: 20, pluginPreset: [] },
    { id: "phase_live", agencyId: "agency_milesymedia", stage: "aqua-mastery", label: "Live care", order: 60, pluginPreset: [] },
  ];

  const service = new ClientLifecycleService(
    {
      createClient: async (_agencyId: string, input: { name: string; stage: string }) => ({
        id: "client_friend",
        agencyId: "agency_milesymedia",
        ...input,
      }),
    } as never,
    {} as never,
    {
      logActivity: async (entry: { message: string; metadata?: Record<string, unknown> }) => {
        activity.push(entry);
        return entry as never;
      },
    } as never,
    { emit: () => undefined } as never,
    {
      getPhaseForStage: async (_agencyId: string, stage: string) => phases.find(phase => phase.stage === stage) ?? null,
      listForAgency: async () => phases,
    } as never,
    { initialiseFor: async () => undefined } as never,
    { apply: async () => ({ skipped: true }) } as never,
  );

  const result = await service.createWithPhase({
    agencyId: "agency_milesymedia",
    actor: "user_ed",
    name: "Friend Website",
    stage: "aqua-mastery",
    metadata: { lifecycleStartReason: "Website already built." },
  });

  assert.equal(result.client.stage, "aqua-mastery");
  assert.match(activity[0].message, /directly in Live care/);
  assert.match(activity[0].message, /Website already built/);
  assert.equal(activity[0].metadata?.directLifecycleStart, true);
  assert.equal(activity[0].metadata?.skippedStageCount, 2);
});
