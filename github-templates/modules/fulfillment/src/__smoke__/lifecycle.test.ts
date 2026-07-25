// Phase-lifecycle smoke test.
//
// Walks one fresh client from creation through every phase advance —
// discovery → design → development → onboarding → live — and asserts
// at each step that the fulfillment plugin's services produce the
// expected portal state:
//
//   1. Agency-level seeding (`seedDefaultPhases`) emits the six default
//      `PhaseDefinition` rows.
//   2. `ClientLifecycleService.createWithPhase` creates a fresh client at
//      the given phase, installs the phase's plugin preset, applies the
//      starter portal variant, and initialises the checklist.
//   3. `ChecklistService.tickItem` flips internal + client items to done
//      and emits `phase.checklist_item_completed` events.
//   4. `TransitionService.advancePhase` disables old-phase plugins
//      (config preserved), enables new-phase plugins, applies the new
//      portal variant, updates `client.stage`, re-initialises the
//      checklist, logs activity, emits `phase.advanced`.
//
// Runs as a self-contained `node:test` module — every foundation port is
// implemented in-memory below so the smoke test needs no DB, no HTTP,
// no Next.js process. Wire it into the foundation's integration suite
// later by passing real adapters into the same shape.
//
// Invocation (from `04-the-final-portal/plugins/fulfillment/`):
//
//   npm run smoke                                     # equivalent to:
//   npx tsx --test src/__smoke__/lifecycle.test.ts    # any Node ≥20
//
// Why tsx and not native `--experimental-strip-types`: the rest of the
// plugin source uses extensionless TypeScript imports (`./checklist`,
// not `./checklist.ts`) — Next.js + the `bundler` moduleResolution
// resolve those, but Node's native ESM resolver requires the full
// extension. tsx handles both, so the smoke test runs against the same
// source the foundation imports without modification.
//
// Companion chapter: `01 development/context/prior research/04-phase-lifecycle-smoke.md`.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  AgencyId,
  ClientId,
  Client,
  ClientStage,
  PhaseDefinition,
  PluginInstall,
  PluginInstallScope,
  UserId,
  ActivityEntry,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  ClientStorePort,
  CreateClientInput,
  EventBusPort,
  EventName,
  ListActivityFilter,
  LogActivityInput,
  PhaseStorePort,
  PluginInstallPatch,
  PluginInstallStorePort,
  PluginRegistryEntry,
  PluginRegistryPort,
  PluginRuntimePort,
  PortalVariantPort,
  UpdateClientPatch,
  UpsertPluginInstallInput,
} from "../server/ports";
import { buildFulfillmentContainer } from "../server/index";
import { DEFAULT_PHASE_PRESETS } from "../server/presets";

// ─── Test fixtures: id helpers + clock ────────────────────────────────────

let nextId = 1;
const fixedNow = 1714824000000;
const stableId = (prefix: string) => `${prefix}_${String(nextId++).padStart(4, "0")}`;

// ─── In-memory ports ──────────────────────────────────────────────────────

interface SmokeWorld {
  agencyId: AgencyId;
  actor: UserId;
  clients: ClientStorePort;
  installs: PluginInstallStorePort;
  runtime: PluginRuntimePort;
  registry: PluginRegistryPort;
  phases: PhaseStorePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  variants: PortalVariantPort;
  storage: PluginStorage;
  // Inspection handles.
  state: {
    clients: Map<ClientId, Client>;
    installs: Map<string, PluginInstall>;
    phases: Map<string, PhaseDefinition>;
    activityLog: ActivityEntry[];
    pluginData: Map<string, Record<string, unknown>>;
    emittedEvents: { name: EventName; scope: PluginInstallScope; payload: unknown }[];
    variantApplies: { clientId: ClientId; variantId: string; role: string }[];
  };
}

function buildSmokeWorld(agencyId: AgencyId, actor: UserId, registryIds: string[]): SmokeWorld {
  const clients = new Map<ClientId, Client>();
  const installs = new Map<string, PluginInstall>();
  const phases = new Map<string, PhaseDefinition>();
  const activityLog: ActivityEntry[] = [];
  const pluginData = new Map<string, Record<string, unknown>>();
  const emittedEvents: { name: EventName; scope: PluginInstallScope; payload: unknown }[] = [];
  const variantApplies: { clientId: ClientId; variantId: string; role: string }[] = [];

  const installKey = (scope: PluginInstallScope, pluginId: string): string =>
    `${scope.agencyId}|${scope.clientId ?? "_agency"}|${pluginId}`;

  const clientStore: ClientStorePort = {
    createClient(agency, input: CreateClientInput): Client {
      const id = stableId("cli");
      const client: Client = {
        id,
        agencyId: agency,
        name: input.name,
        slug: input.slug ?? id,
        brand: { primaryColor: "#000000", ...(input.brand ?? {}) },
        stage: input.stage ?? "discovery",
        ownerEmail: input.ownerEmail,
        websiteUrl: input.websiteUrl,
        status: "active",
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };
      clients.set(id, client);
      return client;
    },
    getClient(id: ClientId): Client | null {
      return clients.get(id) ?? null;
    },
    getClientForAgency(agency, id: ClientId): Client | null {
      const c = clients.get(id);
      return c && c.agencyId === agency ? c : null;
    },
    listClients(agency): Client[] {
      return [...clients.values()].filter(c => c.agencyId === agency);
    },
    updateClient(agency, id: ClientId, patch: UpdateClientPatch): Client | null {
      const existing = clients.get(id);
      if (!existing || existing.agencyId !== agency) return null;
      const next: Client = {
        ...existing,
        ...patch,
        brand: { ...existing.brand, ...(patch.brand ?? {}) },
        updatedAt: fixedNow,
      };
      clients.set(id, next);
      return next;
    },
  };

  const installStore: PluginInstallStorePort = {
    getInstall(scope, pluginId): PluginInstall | null {
      return installs.get(installKey(scope, pluginId)) ?? null;
    },
    listInstalledFor(scope): PluginInstall[] {
      return [...installs.values()].filter(
        i => i.agencyId === scope.agencyId && i.clientId === scope.clientId,
      );
    },
    listInstalledForClientOnly(scope): PluginInstall[] {
      return [...installs.values()].filter(
        i => i.agencyId === scope.agencyId && i.clientId === scope.clientId && i.clientId,
      );
    },
    upsertInstall(input: UpsertPluginInstallInput): PluginInstall {
      const key = installKey(input.scope, input.pluginId);
      const existing = installs.get(key);
      const id = existing?.id ?? key;
      const install: PluginInstall = {
        id,
        pluginId: input.pluginId,
        agencyId: input.scope.agencyId,
        clientId: input.scope.clientId,
        enabled: input.enabled,
        config: input.config,
        features: input.features,
        setupAnswers: input.setupAnswers,
        installedAt: existing?.installedAt ?? fixedNow,
        installedBy: existing?.installedBy ?? input.installedBy,
      };
      installs.set(key, install);
      return install;
    },
    patchInstall(scope, pluginId, patch: PluginInstallPatch): PluginInstall | null {
      const key = installKey(scope, pluginId);
      const existing = installs.get(key);
      if (!existing) return null;
      const next: PluginInstall = {
        ...existing,
        enabled: patch.enabled ?? existing.enabled,
        config: patch.config ?? existing.config,
        features: patch.features ?? existing.features,
        setupAnswers: patch.setupAnswers ?? existing.setupAnswers,
      };
      installs.set(key, next);
      return next;
    },
    deleteInstall(scope, pluginId): boolean {
      const key = installKey(scope, pluginId);
      const had = installs.has(key);
      installs.delete(key);
      pluginData.delete(key);
      return had;
    },
  };

  // Runtime mock — wraps install/setEnabled/uninstall on the install store.
  // Mirrors the foundation's `_runtime.ts` semantics: registry-validated
  // installs only; setEnabled flips the bit; uninstall drops the row +
  // plugin data slice (config NOT preserved on uninstall, only on disable).
  const runtime: PluginRuntimePort = {
    async installPlugin(args) {
      if (!registryIds.includes(args.pluginId)) {
        return { ok: false, error: `plugin ${args.pluginId} not in registry` };
      }
      const existing = await installStore.getInstall(args.scope, args.pluginId);
      if (existing) {
        // Already installed — re-enable + return existing (idempotent).
        const re = await installStore.patchInstall(args.scope, args.pluginId, { enabled: true });
        return re ? { ok: true, install: re } : { ok: false, error: "patch failed" };
      }
      const install = await installStore.upsertInstall({
        pluginId: args.pluginId,
        scope: args.scope,
        enabled: true,
        config: args.configOverrides ?? {},
        features: args.featureOverrides ?? {},
        setupAnswers: args.setupAnswers,
        installedBy: args.installedBy,
      });
      return { ok: true, install };
    },
    async setEnabled(args) {
      const re = await installStore.patchInstall(args.scope, args.pluginId, { enabled: args.enabled });
      return re ? { ok: true, install: re } : { ok: false, error: `not installed: ${args.pluginId}` };
    },
    async uninstallPlugin(args) {
      const had = await installStore.deleteInstall(args.scope, args.pluginId);
      return had ? { ok: true } : { ok: false, error: `not installed: ${args.pluginId}` };
    },
  };

  const registryEntries: PluginRegistryEntry[] = registryIds.map(id => ({
    id,
    name: id,
    version: "0.0.0",
    status: "stable",
    category: "core",
    tagline: `${id} (smoke stub)`,
    description: `${id} placeholder plugin for the lifecycle smoke test.`,
  }));

  const registry: PluginRegistryPort = {
    listPlugins: () => [...registryEntries],
    listInstallablePlugins: () => [...registryEntries],
    getPlugin: id => registryEntries.find(p => p.id === id) ?? null,
  };

  const phaseStore: PhaseStorePort = {
    listPhasesForAgency(agency): PhaseDefinition[] {
      return [...phases.values()].filter(p => p.agencyId === agency).sort((a, b) => a.order - b.order);
    },
    getPhase(id): PhaseDefinition | null {
      return phases.get(id) ?? null;
    },
    upsertPhase(p: PhaseDefinition): PhaseDefinition {
      phases.set(p.id, p);
      return p;
    },
    deletePhase(id): boolean {
      return phases.delete(id);
    },
  };

  const activity: ActivityLogPort = {
    logActivity(input: LogActivityInput): ActivityEntry {
      const entry: ActivityEntry = {
        id: stableId("act"),
        ts: fixedNow,
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
    listActivity(filter: ListActivityFilter): ActivityEntry[] {
      let entries = activityLog.filter(e => e.agencyId === filter.agencyId);
      if (filter.clientId) entries = entries.filter(e => e.clientId === filter.clientId);
      const limit = filter.limit ?? entries.length;
      return entries.slice(-limit).reverse();
    },
  };

  const events: EventBusPort = {
    emit(scope, name, payload) {
      emittedEvents.push({ name, scope, payload });
    },
  };

  // The variant port records every apply call so we can verify the right
  // variant got swapped in at each phase. The foundation's real adapter
  // delegates to T3's `applyStarterVariant`; we don't need T3 at smoke time.
  const variants: PortalVariantPort = {
    async applyStarterVariant(args) {
      variantApplies.push({
        clientId: args.clientId,
        variantId: args.variantId,
        role: args.role,
      });
      return { ok: true, variantId: args.variantId };
    },
  };

  // Plugin storage — used by ChecklistService to persist progress per
  // (clientId, phaseId). Namespaced under the fulfillment plugin's
  // install id; for the smoke test we use a single in-memory map.
  const fulfillmentInstallId = installKey({ agencyId, clientId: undefined }, "fulfillment");
  pluginData.set(fulfillmentInstallId, {});
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const slice = pluginData.get(fulfillmentInstallId) ?? {};
      return slice[key] as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      const slice = pluginData.get(fulfillmentInstallId) ?? {};
      slice[key] = value;
      pluginData.set(fulfillmentInstallId, slice);
    },
    async del(key: string): Promise<void> {
      const slice = pluginData.get(fulfillmentInstallId) ?? {};
      delete slice[key];
      pluginData.set(fulfillmentInstallId, slice);
    },
    async list(prefix?: string): Promise<string[]> {
      const slice = pluginData.get(fulfillmentInstallId) ?? {};
      const keys = Object.keys(slice);
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };

  return {
    agencyId,
    actor,
    clients: clientStore,
    installs: installStore,
    runtime,
    registry,
    phases: phaseStore,
    activity,
    events,
    variants,
    storage,
    state: { clients, installs, phases, activityLog, pluginData, emittedEvents, variantApplies },
  };
}

// ─── Test data ────────────────────────────────────────────────────────────

const AGENCY_ID = "agency_smoke" as const;
const ACTOR = "user_smoke_actor" as const;

// All plugin ids referenced by the six default phase presets — registered
// as placeholders so the runtime accepts the installs. The smoke test
// asserts the lifecycle mechanic; in production the foundation's real
// registry holds the actual manifests.
const ALL_PRESET_PLUGINS = Array.from(
  new Set(DEFAULT_PHASE_PRESETS.flatMap(p => p.pluginPreset)),
);

// ─── Walkthrough ──────────────────────────────────────────────────────────

describe("phase lifecycle smoke", () => {
  let world: SmokeWorld;
  let services: ReturnType<typeof buildFulfillmentContainer>;
  let clientId: ClientId;

  before(() => {
    world = buildSmokeWorld(AGENCY_ID, ACTOR, ALL_PRESET_PLUGINS);
    services = buildFulfillmentContainer({
      clients: world.clients,
      pluginInstalls: world.installs,
      pluginRuntime: world.runtime,
      registry: world.registry,
      phases: world.phases,
      activity: world.activity,
      events: world.events,
      variants: world.variants,
      storage: world.storage,
    });
  });

  test("step 0: agency seeds default phases", async () => {
    const result = await services.phaseService.seedDefaultPhases(AGENCY_ID);
    assert.equal(result.seeded, true);
    assert.equal(result.phases.length, 6, "six default phases per architecture §7");
    const stages = result.phases.map(p => p.stage);
    assert.deepEqual(
      stages,
      ["discovery", "design", "development", "onboarding", "live", "churned"],
      "default phases ordered discovery → churned",
    );

    // Re-seed is idempotent.
    const second = await services.phaseService.seedDefaultPhases(AGENCY_ID);
    assert.equal(second.seeded, false, "re-seed skips when phases already exist");
  });

  test("step 1: create fresh client at discovery phase", async () => {
    const result = await services.clientLifecycleService.createWithPhase({
      agencyId: AGENCY_ID,
      actor: ACTOR,
      name: "Smoke Test Co",
      ownerEmail: "owner@smoke.test",
      stage: "discovery",
    });
    clientId = result.client.id;

    // Client persisted at discovery.
    assert.equal(result.client.stage, "discovery");
    assert.equal(world.state.clients.get(clientId)?.stage, "discovery");

    // Discovery preset = ['brand', 'forms']; both should be installed for client.
    assert.equal(result.phase.stage, "discovery");
    assert.deepEqual(
      result.installs.filter(i => i.ok).map(i => i.pluginId).sort(),
      [...result.phase.pluginPreset].sort(),
      "all preset plugins installed for the new client",
    );
    for (const pid of result.phase.pluginPreset) {
      const inst = await world.installs.getInstall({ agencyId: AGENCY_ID, clientId }, pid);
      assert.ok(inst, `plugin ${pid} install row exists`);
      assert.equal(inst?.enabled, true, `plugin ${pid} enabled at install`);
    }

    // Variant apply recorded.
    if (result.phase.portalVariantId) {
      assert.equal(world.state.variantApplies.length, 1, "one variant apply on creation");
      const last = world.state.variantApplies.at(-1);
      assert.equal(last?.variantId, result.phase.portalVariantId);
      assert.equal(last?.role, "login", "starter variant defaults to 'login' surface");
    }

    // Checklist initialised in storage.
    const view = await services.checklistService.viewFor({
      agencyId: AGENCY_ID,
      clientId,
      phase: result.phase,
    });
    assert.equal(view.internalDone, 0);
    assert.equal(view.clientDone, 0);
    assert.equal(view.internalTotal + view.clientTotal, result.phase.checklist.length);

    // client.created activity logged.
    const created = world.state.activityLog.filter(e => e.action === "client.created");
    assert.equal(created.length, 1);
    assert.equal(created[0]?.clientId, clientId);
  });

  test("step 2: tick all checklist items in the discovery phase", async () => {
    const phase = (await services.phaseService.getPhaseForStage(AGENCY_ID, "discovery"))!;
    for (const item of phase.checklist) {
      await services.checklistService.tickItem({
        agencyId: AGENCY_ID,
        clientId,
        phase,
        itemId: item.id,
        done: true,
        actor: ACTOR,
      });
    }
    const view = await services.checklistService.viewFor({ agencyId: AGENCY_ID, clientId, phase });
    assert.equal(view.allRequiredComplete, true, "phase advance gate opens after every tick");
    const completedEvents = world.state.emittedEvents.filter(
      e => e.name === "phase.checklist_item_completed",
    );
    assert.equal(completedEvents.length, phase.checklist.length, "tick fires one event per item");
  });

  // The four real phase advances. Each row = (from, to) plus expected
  // disable / enable diffs (computed live against the preset arrays so
  // the test stays in sync if presets change).
  const PHASE_HOPS: { from: ClientStage; to: ClientStage }[] = [
    { from: "discovery", to: "design" },
    { from: "design", to: "development" },
    { from: "development", to: "onboarding" },
    { from: "onboarding", to: "live" },
  ];

  for (const hop of PHASE_HOPS) {
    test(`step 3.${hop.from}→${hop.to}: advancePhase`, async () => {
      const before = await services.phaseService.getPhaseForStage(AGENCY_ID, hop.from);
      const after = await services.phaseService.getPhaseForStage(AGENCY_ID, hop.to);
      assert.ok(before && after);

      // Pre-tick: complete the previous phase's checklist (idempotent if
      // it's the first phase since step 2 already ticked everything).
      for (const item of before.checklist) {
        await services.checklistService.tickItem({
          agencyId: AGENCY_ID,
          clientId,
          phase: before,
          itemId: item.id,
          done: true,
          actor: ACTOR,
        });
      }

      const variantBefore = world.state.variantApplies.length;
      const eventsBefore = world.state.emittedEvents.length;
      const activityBefore = world.state.activityLog.length;

      const result = await services.transitionService.advancePhase({
        agencyId: AGENCY_ID,
        clientId,
        fromPhase: before,
        toPhase: after,
        actor: ACTOR,
      });

      assert.equal(result.ok, true, `advance ${hop.from}→${hop.to} succeeds`);
      if (!result.ok) return;

      // Plugin diff: anything in `before.pluginPreset` not in `after`
      // should be disabled (config preserved). Anything in `after`
      // gets enabled / installed.
      const newSet = new Set(after.pluginPreset);
      const expectedDisabled = before.pluginPreset.filter(p => !newSet.has(p)).sort();
      assert.deepEqual([...result.disabled].sort(), expectedDisabled, "old-only plugins disabled");
      assert.deepEqual([...result.enabled].sort(), [...after.pluginPreset].sort(), "new-phase plugins enabled");

      // Disable means enabled=false, install row preserved.
      for (const pid of expectedDisabled) {
        const inst = await world.installs.getInstall({ agencyId: AGENCY_ID, clientId }, pid);
        assert.ok(inst, `disabled plugin ${pid} install row preserved`);
        assert.equal(inst?.enabled, false, `disabled plugin ${pid} enabled=false`);
      }
      // Enable means enabled=true.
      for (const pid of after.pluginPreset) {
        const inst = await world.installs.getInstall({ agencyId: AGENCY_ID, clientId }, pid);
        assert.ok(inst, `new-phase plugin ${pid} installed for client`);
        assert.equal(inst?.enabled, true, `new-phase plugin ${pid} enabled=true`);
      }

      // Client stage updated.
      assert.equal(result.client.stage, hop.to);
      assert.equal(world.state.clients.get(clientId)?.stage, hop.to);

      // Variant applied (every default phase has a portalVariantId).
      if (after.portalVariantId) {
        assert.equal(
          world.state.variantApplies.length,
          variantBefore + 1,
          "exactly one new variant apply per phase advance",
        );
        const last = world.state.variantApplies.at(-1);
        assert.equal(last?.variantId, after.portalVariantId);
      }

      // phase.advanced event emitted.
      const newEvents = world.state.emittedEvents.slice(eventsBefore);
      const advanced = newEvents.filter(e => e.name === "phase.advanced");
      assert.equal(advanced.length, 1, "exactly one phase.advanced event");

      // Activity log entry.
      const newActivity = world.state.activityLog.slice(activityBefore);
      const advancedLog = newActivity.find(e => e.action === "phase.advanced");
      assert.ok(advancedLog, "phase.advanced activity logged");
      assert.equal(advancedLog?.metadata?.toStage, hop.to);
    });
  }

  test("step 4: final state is live with the live preset", async () => {
    const c = world.state.clients.get(clientId);
    assert.equal(c?.stage, "live");
    const livePhase = await services.phaseService.getPhaseForStage(AGENCY_ID, "live");
    assert.ok(livePhase);

    // Every plugin in the live preset is installed AND enabled.
    for (const pid of livePhase!.pluginPreset) {
      const inst = await world.installs.getInstall({ agencyId: AGENCY_ID, clientId }, pid);
      assert.equal(inst?.enabled, true, `live preset plugin ${pid} enabled`);
    }

    // Plugins from earlier phases that aren't in live's preset are
    // disabled but their install rows are preserved (config is recoverable).
    const allInstalls = await world.installs.listInstalledFor({ agencyId: AGENCY_ID, clientId });
    const liveSet = new Set(livePhase!.pluginPreset);
    for (const inst of allInstalls) {
      if (!liveSet.has(inst.pluginId)) {
        assert.equal(inst.enabled, false, `non-live plugin ${inst.pluginId} disabled (config preserved)`);
      }
    }

    // Variant trail: 1 (creation) + 4 (advances) = 5 applies, each
    // pointing at the corresponding phase's starter variant.
    assert.equal(world.state.variantApplies.length, 5, "one variant apply per lifecycle step");
    const variantTrail = world.state.variantApplies.map(v => v.variantId);
    assert.deepEqual(variantTrail, [
      "starter-discovery",
      "starter-design",
      "starter-development",
      "starter-onboarding",
      "starter-live",
    ], "variant trail follows the phase sequence");
  });

  test("step 5: marketplace + activity surfaces reflect the journey", async () => {
    // Marketplace can list installable plugins for the live client and
    // mark which are installed + enabled (sanity check on the path the
    // client portal uses).
    const list = await services.marketplaceService.listForClient({
      agencyId: AGENCY_ID,
      clientId,
    });
    assert.ok(list.cards.length > 0, "marketplace returns cards");
    for (const card of list.cards) {
      const inst = await world.installs.getInstall({ agencyId: AGENCY_ID, clientId }, card.id);
      assert.equal(card.installed, !!inst, "card.installed matches install store");
      assert.equal(card.enabled, inst?.enabled ?? false, "card.enabled matches install state");
    }

    // Activity log: client.created + 4 × phase.advanced minimum.
    const log = await world.activity.listActivity({ agencyId: AGENCY_ID, clientId, limit: 100 });
    assert.ok(log.find(e => e.action === "client.created"), "client.created in log");
    const advanced = log.filter(e => e.action === "phase.advanced");
    assert.equal(advanced.length, 4, "four phase.advanced log entries");
  });
});

// ─── R7 — per-phase install-set + soft-fail assertions ───────────────────
//
// Two things to prove:
//   1. The R7 catalogue mapping is reflected in DEFAULT_PHASE_PRESETS:
//      Discovery → [website-editor]
//      Design → [website-editor]
//      Development → [website-editor, ecommerce]
//      Onboarding → [website-editor, ecommerce, memberships]
//      Live → [website-editor, ecommerce, memberships, affiliates]
//      Churned → []
//   2. Soft-fail: when the registry doesn't carry a preset id, the phase
//      advance still succeeds — the missing plugin lands in
//      `result.skipped`, an activity entry + `phase.preset_plugin_skipped`
//      event fires, and the rest of the preset still installs.

describe("R7 — phase preset catalogue + soft-fail", () => {
  test("catalogue: each phase preset matches the R7 plan", () => {
    const byStage = new Map(DEFAULT_PHASE_PRESETS.map(p => [p.stage, p.pluginPreset]));
    assert.deepEqual(byStage.get("discovery"), ["website-editor"]);
    assert.deepEqual(byStage.get("design"), ["website-editor"]);
    assert.deepEqual(byStage.get("development"), ["website-editor", "ecommerce"]);
    assert.deepEqual(
      byStage.get("onboarding"),
      ["website-editor", "ecommerce", "memberships"],
    );
    assert.deepEqual(
      byStage.get("live"),
      ["website-editor", "ecommerce", "memberships", "affiliates"],
    );
    assert.deepEqual(byStage.get("churned"), []);
  });

  test("soft-fail: unregistered preset id is skipped, phase still advances", async () => {
    // Registry only knows website-editor + ecommerce. Onboarding's
    // preset references memberships — that id should land in `skipped`,
    // not abort the advance.
    const REGISTRY = ["website-editor", "ecommerce"];
    const w = buildSmokeWorld("agency_softfail", "user_softfail", REGISTRY);
    const services = buildFulfillmentContainer({
      clients: w.clients,
      pluginInstalls: w.installs,
      pluginRuntime: w.runtime,
      registry: w.registry,
      phases: w.phases,
      activity: w.activity,
      events: w.events,
      variants: w.variants,
      storage: w.storage,
    });
    await services.phaseService.seedDefaultPhases("agency_softfail");
    const created = await services.clientLifecycleService.createWithPhase({
      agencyId: "agency_softfail",
      actor: "user_softfail",
      name: "Soft-fail Co",
      stage: "discovery",
    });
    const cid = created.client.id;

    // Walk discovery → development (registers website-editor + ecommerce
    // — both known). Tick checklist + advance.
    let current = created.phase;
    for (const targetStage of ["design", "development"] as const) {
      for (const item of current.checklist) {
        await services.checklistService.tickItem({
          agencyId: "agency_softfail",
          clientId: cid,
          phase: current,
          itemId: item.id,
          done: true,
          actor: "user_softfail",
        });
      }
      const target = (await services.phaseService.getPhaseForStage("agency_softfail", targetStage))!;
      const r = await services.transitionService.advancePhase({
        agencyId: "agency_softfail",
        clientId: cid,
        fromPhase: current,
        toPhase: target,
        actor: "user_softfail",
      });
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.deepEqual(r.skipped, [], "no skips expected through development (registry has website-editor + ecommerce)");
      current = target;
    }

    // Now hop to onboarding — preset includes memberships (not in registry).
    for (const item of current.checklist) {
      await services.checklistService.tickItem({
        agencyId: "agency_softfail",
        clientId: cid,
        phase: current,
        itemId: item.id,
        done: true,
        actor: "user_softfail",
      });
    }
    const onboarding = (await services.phaseService.getPhaseForStage("agency_softfail", "onboarding"))!;
    const result = await services.transitionService.advancePhase({
      agencyId: "agency_softfail",
      clientId: cid,
      fromPhase: current,
      toPhase: onboarding,
      actor: "user_softfail",
    });
    assert.equal(result.ok, true, "onboarding advance succeeds despite missing memberships");
    if (!result.ok) return;

    // memberships skipped; website-editor + ecommerce enabled.
    assert.deepEqual(result.skipped.map(s => s.pluginId), ["memberships"]);
    assert.deepEqual([...result.enabled].sort(), ["ecommerce", "website-editor"]);

    // Skip-event fired. (Cast: `phase.preset_plugin_skipped` isn't yet
    // in the canonical EventName union — same `as never` cast the
    // service uses on emit. T1 extends the union when wiring the
    // route in their next round.)
    const skippedEvents = w.state.emittedEvents.filter(
      e => (e.name as string) === "phase.preset_plugin_skipped",
    );
    assert.equal(skippedEvents.length, 1);

    // Skip-activity entry written.
    const skippedActivity = w.state.activityLog.filter(e => e.action === "phase.preset_plugin_skipped");
    assert.equal(skippedActivity.length, 1);

    // Client stage still moved.
    assert.equal(w.state.clients.get(cid)?.stage, "onboarding");

    // Live hop: preset includes memberships AND affiliates (both unregistered).
    for (const item of onboarding.checklist) {
      await services.checklistService.tickItem({
        agencyId: "agency_softfail",
        clientId: cid,
        phase: onboarding,
        itemId: item.id,
        done: true,
        actor: "user_softfail",
      });
    }
    const live = (await services.phaseService.getPhaseForStage("agency_softfail", "live"))!;
    const liveResult = await services.transitionService.advancePhase({
      agencyId: "agency_softfail",
      clientId: cid,
      fromPhase: onboarding,
      toPhase: live,
      actor: "user_softfail",
    });
    assert.equal(liveResult.ok, true);
    if (!liveResult.ok) return;
    assert.deepEqual(
      liveResult.skipped.map(s => s.pluginId).sort(),
      ["affiliates", "memberships"],
    );
    assert.equal(w.state.clients.get(cid)?.stage, "live");
  });
});

// ─── Programmatic entry point ─────────────────────────────────────────────
//
// Lets a future foundation-side smoke runner invoke this whole flow
// without going through `node:test`. Returns a structured report so the
// caller can assert + render it however it likes.

export interface LifecycleSmokeReport {
  ok: boolean;
  phasesSeeded: number;
  finalStage: ClientStage;
  variantTrail: string[];
  enabledAtLive: string[];
  disabledAtLive: string[];
  activityCount: number;
  emittedEvents: { name: EventName; payload: unknown }[];
}

export async function runLifecycleSmoke(): Promise<LifecycleSmokeReport> {
  nextId = 1;
  const world = buildSmokeWorld(AGENCY_ID, ACTOR, ALL_PRESET_PLUGINS);
  const services = buildFulfillmentContainer({
    clients: world.clients,
    pluginInstalls: world.installs,
    pluginRuntime: world.runtime,
    registry: world.registry,
    phases: world.phases,
    activity: world.activity,
    events: world.events,
    variants: world.variants,
    storage: world.storage,
  });

  const seed = await services.phaseService.seedDefaultPhases(AGENCY_ID);
  const created = await services.clientLifecycleService.createWithPhase({
    agencyId: AGENCY_ID,
    actor: ACTOR,
    name: "Smoke Test Co (programmatic)",
    stage: "discovery",
  });

  const HOP_ORDER: ClientStage[] = ["design", "development", "onboarding", "live"];
  let current: PhaseDefinition = created.phase;
  for (const next of HOP_ORDER) {
    for (const item of current.checklist) {
      await services.checklistService.tickItem({
        agencyId: AGENCY_ID,
        clientId: created.client.id,
        phase: current,
        itemId: item.id,
        done: true,
        actor: ACTOR,
      });
    }
    const target = (await services.phaseService.getPhaseForStage(AGENCY_ID, next))!;
    const advance = await services.transitionService.advancePhase({
      agencyId: AGENCY_ID,
      clientId: created.client.id,
      fromPhase: current,
      toPhase: target,
      actor: ACTOR,
    });
    if (!advance.ok) {
      return {
        ok: false,
        phasesSeeded: seed.phases.length,
        finalStage: current.stage,
        variantTrail: world.state.variantApplies.map(v => v.variantId),
        enabledAtLive: [],
        disabledAtLive: [],
        activityCount: world.state.activityLog.length,
        emittedEvents: world.state.emittedEvents.map(e => ({ name: e.name, payload: e.payload })),
      };
    }
    current = target;
  }

  const allInstalls = await world.installs.listInstalledFor({ agencyId: AGENCY_ID, clientId: created.client.id });
  return {
    ok: true,
    phasesSeeded: seed.phases.length,
    finalStage: current.stage,
    variantTrail: world.state.variantApplies.map(v => v.variantId),
    enabledAtLive: allInstalls.filter(i => i.enabled).map(i => i.pluginId),
    disabledAtLive: allInstalls.filter(i => !i.enabled).map(i => i.pluginId),
    activityCount: world.state.activityLog.length,
    emittedEvents: world.state.emittedEvents.map(e => ({ name: e.name, payload: e.payload })),
  };
}
