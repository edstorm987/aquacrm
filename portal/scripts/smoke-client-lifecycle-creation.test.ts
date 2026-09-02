process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";

import { ClientLifecycleService } from "../src/built-ins/modules/fulfillment/src/server/clients";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let phases: typeof import("../src/server/phases");
let installs: typeof import("../src/server/pluginInstalls");
let lifecycle: typeof import("../src/lib/server/clients/clientLifecycle");

before(async () => {
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  phases = await import("../src/server/phases");
  installs = await import("../src/server/pluginInstalls");
  lifecycle = await import("../src/lib/server/clients/clientLifecycle");
});

describe("canonical client lifecycle creation", () => {
  test("mounted creation surfaces all use the canonical agency lifecycle", () => {
    const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    const route = read("src/app/api/portal/fulfillment/clients/route.ts");
    const presets = read("src/app/api/portal/fulfillment/presets/route.ts");
    const modal = read("src/app/portal/agency/_NewClientButton.tsx");
    const linked = read("src/app/api/tenants/client-workspaces/route.ts");
    const leads = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");
    const person = read("src/app/api/portal/persons/[personId]/route.ts");

    assert.match(route, /export async function GET/);
    assert.match(route, /createClientWithLifecycleOperation/);
    assert.match(presets, /listAgencyLifecyclePhases/);
    assert.doesNotMatch(presets, /const PRESETS/);
    assert.doesNotMatch(modal, /FALLBACK_PRESETS/);
    assert.match(modal, /operationId: draftOperation\.operationId/);
    assert.match(modal, /checkedJsonMutation<FulfillmentClientCreationPayload>/);
    assert.match(modal, /createdAt: draftOperation\.contactTimestamp/);
    assert.match(modal, /updatedAt: draftOperation\.contactTimestamp/);
    assert.match(linked, /createClientWithLifecycleOperation/);
    assert.match(leads, /ensureClientLifecycleOperation/);
    assert.match(person, /createClientWithLifecycleOperation/);
  });

  test("default Epic Intro creates once, installs its editor, applies the real starter, and replays", async () => {
    const agency = tenants.createAgency({
      name: "Lifecycle operation",
      ownerEmail: "lifecycle@example.test",
    });
    const operationId = "new-client:lifecycle-smoke-one";
    const input = {
      agencyId: agency.id,
      actor: "lifecycle-smoke",
      operationId,
      createInput: {
        name: "Lifecycle Client",
        ownerEmail: "client@example.test",
        stage: "aqua-epic-intro" as const,
        metadata: { lifecycleStartReason: "Smoke proof" },
      },
    };

    const created = await lifecycle.createClientWithLifecycleOperation(input);
    assert.equal(created.ok, true);
    assert.equal(created.status, "complete");
    assert.equal(created.lifecycle?.complete, true);
    assert.equal(created.lifecycle?.phase.portalVariantId, "aqua-incubator");
    assert.deepEqual(created.lifecycle?.phase.pluginPreset, ["website-editor"]);
    assert.equal(created.lifecycle?.checklist.ok, true);
    assert.equal(
      installs.getInstall({ agencyId: agency.id, clientId: created.client.id }, "website-editor")?.enabled,
      true,
    );

    const replay = await lifecycle.createClientWithLifecycleOperation(input);
    assert.equal(replay.ok, true);
    assert.equal(replay.replayed, true);
    assert.equal(replay.client.id, created.client.id);
    assert.equal(tenants.listClients(agency.id).length, 1);

    await assert.rejects(
      lifecycle.createClientWithLifecycleOperation({
        ...input,
        createInput: { ...input.createInput, name: "Different client" },
      }),
      lifecycle.ClientLifecycleOperationConflictError,
    );
  });

  test("agency phases are authoritative and a deleted selection is rejected before a client exists", async () => {
    const agency = tenants.createAgency({
      name: "Custom lifecycle",
      ownerEmail: "custom-lifecycle@example.test",
    });
    const seeded = await lifecycle.listAgencyLifecyclePhases(agency.id);
    const epic = seeded.find(phase => phase.stage === "aqua-epic-intro");
    assert.ok(epic);

    phases.upsertPhase({
      ...epic,
      pluginPreset: [],
      portalVariantId: "starter-epic-intro",
    });
    const migrated = await lifecycle.listAgencyLifecyclePhases(agency.id);
    const repairedEpic = migrated.find(phase => phase.id === epic.id);
    assert.deepEqual(repairedEpic?.pluginPreset, ["website-editor"]);
    assert.equal(repairedEpic?.portalVariantId, "aqua-incubator");

    const custom = phases.upsertPhase({
      id: `phase_${agency.id}_custom`,
      agencyId: agency.id,
      stage: "custom-launch" as never,
      label: "Custom launch",
      description: "Agency-owned custom stage",
      order: 55,
      pluginPreset: [],
      checklist: [{ id: "custom-task", label: "Custom task", visibility: "internal" }],
    });
    assert.ok((await lifecycle.listAgencyLifecyclePhases(agency.id)).some(phase => phase.id === custom.id));
    phases.deletePhase(custom.id);

    const before = tenants.listClients(agency.id).length;
    await assert.rejects(
      lifecycle.createClientWithLifecycleOperation({
        agencyId: agency.id,
        actor: "lifecycle-smoke",
        operationId: "new-client:deleted-phase-smoke",
        createInput: {
          name: "Must not exist",
          stage: "custom-launch" as never,
        },
      }),
      lifecycle.ClientLifecyclePhaseNotFoundError,
    );
    assert.equal(tenants.listClients(agency.id).length, before);
  });

  test("an incomplete retry resumes only failed steps", async () => {
    const client = {
      id: "cli_resume",
      agencyId: "agency_resume",
      name: "Resume client",
      slug: "resume-client",
      brand: { primaryColor: "#000000" },
      stage: "aqua-traffic",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    };
    const phase = {
      id: "phase_resume",
      agencyId: client.agencyId,
      stage: client.stage,
      label: "Traffic",
      order: 10,
      pluginPreset: ["one", "two"],
      portalVariantId: "aqua-incubator",
      checklist: [{ id: "task", label: "Task", visibility: "internal" }],
    };
    const calls = { one: 0, two: 0, variant: 0, checklist: 0 };
    const service = new ClientLifecycleService(
      {
        getClientForAgency: () => client,
      } as never,
      {
        installPlugin: async ({ pluginId }: { pluginId: "one" | "two" }) => {
          calls[pluginId] += 1;
          if (pluginId === "two" && calls.two === 1) return { ok: false, error: "provider unavailable" };
          return { ok: true, install: { pluginId } };
        },
      } as never,
      { logActivity: async () => ({}) } as never,
      { emit: () => undefined } as never,
      {
        getPhaseForStage: async () => phase,
        listForAgency: async () => [phase],
      } as never,
      {
        initialiseFor: async () => { calls.checklist += 1; },
      } as never,
      {
        apply: async () => {
          calls.variant += 1;
          return { ok: true, variantId: "aqua-incubator" };
        },
      } as never,
    );

    const first = await service.materialiseExistingWithPhase({
      agencyId: client.agencyId,
      actor: "actor",
      client: client as never,
      stage: client.stage as never,
    });
    assert.equal(first.complete, false);
    assert.match(first.failures.join(" "), /provider unavailable/);

    const retry = await service.materialiseExistingWithPhase({
      agencyId: client.agencyId,
      actor: "actor",
      client: client as never,
      stage: client.stage as never,
      resume: first,
    });
    assert.equal(retry.complete, true);
    assert.deepEqual(calls, { one: 1, two: 2, variant: 1, checklist: 1 });
  });
});
