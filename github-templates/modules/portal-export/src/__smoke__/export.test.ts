// Portal-export plugin smoke. node:test via tsx --test.
// Covers the five cases enumerated in R11:
//   1. Materialize a small fixture client with `skincare-brand` preset
//      → written `clients/<slug>/` matches expected structure.
//   2. Idempotent re-export (no operator edits) is a no-op.
//   3. Idempotent re-export (with mocked operator edit) preserves the edit.
//   4. Each preset's manifest validates against PortalPreset shape.
//   5. Brand-kit override beats preset default.

import { describe, test, before } from "node:test";
import { strict as assert } from "node:assert";

import type {
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  FilesystemPort,
  PluginInstallStorePort,
  TenantPort,
  WebsiteEditorReaderPort,
} from "../server/ports";
import type { PortalPreset } from "../lib/domain";
import { containerWithDeps } from "../server/foundationAdapter";
import { PresetService } from "../server/presets";

const AGENCY_ID: AgencyId = "agency_export_smoke";
const CLIENT_ID: ClientId = "client_export_smoke";
const ACTOR: UserId = "user_admin";

interface World {
  storage: PluginStorage;
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  filesystem: FilesystemPort;
  websiteEditor?: WebsiteEditorReaderPort;
  inspect: {
    activityLog: ActivityEntry[];
    events: { name: string; payload: unknown }[];
    fs: Map<string, string>;
  };
}

function buildWorld(opts?: { withEditor?: boolean }): World {
  const client: Client = {
    id: CLIENT_ID,
    agencyId: AGENCY_ID,
    name: "Smoke Skincare",
    slug: "smoke-skincare",
    brand: {
      primaryColor: "#FF7733",
      secondaryColor: "#FFEEDD",
      fontHeading: "Playfair Display",
      fontBody: "system-ui",
      borderRadius: "10px",
    },
    stage: "live",
    status: "active",
    websiteUrl: "https://smoke-skincare.test",
    tagline: "test-only",
    createdAt: 0, updatedAt: 0,
  };

  const data = new Map<string, unknown>();
  const activityLog: ActivityEntry[] = [];
  const events: { name: string; payload: unknown }[] = [];
  const fs = new Map<string, string>();

  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
  const tenant: TenantPort = {
    getClient: id => (id === CLIENT_ID ? client : null),
  };
  let actSeq = 1;
  const activity: ActivityLogPort = {
    logActivity(input) {
      const entry: ActivityEntry = {
        id: `act_${String(actSeq++).padStart(4, "0")}`,
        ts: Date.now(),
        agencyId: input.agencyId, clientId: input.clientId,
        actorUserId: input.actorUserId, actorEmail: input.actorEmail,
        category: input.category, action: input.action, message: input.message,
        metadata: input.metadata,
      };
      activityLog.push(entry);
      return entry;
    },
    listActivity(filter) { return activityLog.filter(e => e.agencyId === filter.agencyId); },
  };
  const eventBus: EventBusPort = { emit(_scope, name, payload) { events.push({ name, payload }); } };
  const pluginInstalls: PluginInstallStorePort = {
    listInstalls(scope: PluginInstallScope): PluginInstall[] {
      if (scope.agencyId !== AGENCY_ID || scope.clientId !== CLIENT_ID) return [];
      const ts = 0;
      const mk = (id: string): PluginInstall => ({
        id: `${AGENCY_ID}|${scope.clientId ?? "_agency"}|${id}`,
        pluginId: id,
        agencyId: AGENCY_ID,
        clientId: scope.clientId,
        enabled: true,
        config: {},
        features: {},
        installedAt: ts,
      });
      return [mk("website-editor"), mk("ecommerce")];
    },
  };

  // In-memory filesystem keyed by absolute path. resolveRoot returns
  // "/test/<rel>" so paths look real. listFiles + exists scan the map.
  const filesystem: FilesystemPort = {
    resolveRoot(rel) { return `/test/${rel}`; },
    async readFile(path) { return fs.get(path); },
    async writeFile(path, content) { fs.set(path, content); },
    async exists(path) { return fs.has(path); },
    async listFiles(dir) {
      const prefix = `/test/${dir}/`;
      return [...fs.keys()].filter(k => k.startsWith(prefix));
    },
  };

  const websiteEditor: WebsiteEditorReaderPort | undefined = opts?.withEditor
    ? {
        async getActivePortalVariant({ role }) {
          if (role === "login") {
            return {
              variantId: "smoke-login-v1",
              tree: { pageId: "login", title: "Login", rootBlocks: [{ id: "form", type: "login-form", props: {} }] },
            };
          }
          if (role === "account") {
            return {
              variantId: "smoke-account-v1",
              tree: { pageId: "account", title: "Account", rootBlocks: [{ id: "panel", type: "account-panel", props: {} }] },
            };
          }
          return null;
        },
        async getCustomContent() {
          return {
            "site.name": "Smoke Skincare",
            "site.tagline": "Built by the smoke test",
            "hero.headline1": "Smoke.",
            "hero.headline2": "Test.",
          };
        },
        async getThemeTokens() {
          return { "--brand-primary": "#FF7733" };
        },
      }
    : undefined;

  return {
    storage, tenant, activity, events: eventBus, pluginInstalls, filesystem,
    websiteEditor,
    inspect: { activityLog, events, fs },
  };
}

describe("portal-export smoke", () => {
  let world: World;
  let services: ReturnType<typeof containerWithDeps>;

  before(() => {
    world = buildWorld({ withEditor: true });
    services = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: world.storage,
      tenant: world.tenant,
      activity: world.activity,
      events: world.events,
      pluginInstalls: world.pluginInstalls,
      filesystem: world.filesystem,
      websiteEditor: world.websiteEditor,
    });
  });

  test("step 1: materialize fixture with skincare-brand preset", async () => {
    const record = await services.exports.export(
      CLIENT_ID,
      { presetId: "skincare-brand" },
      ACTOR,
    );
    assert.equal(record.status, "ok");
    assert.ok(record.filesWritten >= 8, `${record.filesWritten} files written`);
    // Check a few canonical paths exist.
    const fs = world.inspect.fs;
    assert.ok(fs.has("/test/clients/smoke-skincare/package.json"), "package.json written");
    assert.ok(fs.has("/test/clients/smoke-skincare/next.config.ts"), "next.config.ts written");
    assert.ok(fs.has("/test/clients/smoke-skincare/tsconfig.json"), "tsconfig.json written");
    assert.ok(fs.has("/test/clients/smoke-skincare/src/app/layout.tsx"), "layout.tsx written");
    assert.ok(fs.has("/test/clients/smoke-skincare/src/app/page.tsx"), "page.tsx written");
    assert.ok(fs.has("/test/clients/smoke-skincare/portal-config.json"), "portal-config.json written");

    // package.json carries plugin workspace deps for installed + preset
    // plugins (union, sorted).
    const pkg = JSON.parse(fs.get("/test/clients/smoke-skincare/package.json")!) as { dependencies: Record<string, string> };
    assert.ok(pkg.dependencies["@aqua/plugin-website-editor"]);
    assert.ok(pkg.dependencies["@aqua/plugin-ecommerce"]);
    assert.ok(pkg.dependencies["@aqua/plugin-memberships"]);    // from preset
    assert.ok(pkg.dependencies["@aqua/plugin-affiliates"]);     // from preset
    assert.ok(pkg.dependencies["@aqua/plugin-client-crm"]);     // from preset

    // portal-config carries the brand kit + installed plugins + variants.
    const cfg = JSON.parse(fs.get("/test/clients/smoke-skincare/portal-config.json")!) as {
      client: { slug: string };
      brand: { primaryColor: string };
      installedPlugins: { id: string }[];
      portalVariants: Record<string, string>;
      _generatedFingerprints: Record<string, string>;
    };
    assert.equal(cfg.client.slug, "smoke-skincare");
    assert.equal(cfg.brand.primaryColor, "#FF7733");
    // Editor-supplied variants override preset where they overlap.
    assert.equal(cfg.portalVariants.login, "smoke-login-v1");
    assert.equal(cfg.portalVariants.account, "smoke-account-v1");
    // Preset-only variants survive.
    assert.equal(cfg.portalVariants.affiliates, "skincare-affiliates-v1");
    // Fingerprint ledger is populated.
    assert.ok(Object.keys(cfg._generatedFingerprints).length >= 8);

    const completed = world.inspect.events.filter(e => e.name === "export.completed");
    assert.equal(completed.length, 1);
  });

  test("step 2: idempotent re-export (no operator edits) is no-op", async () => {
    const before = world.inspect.fs.size;
    const record = await services.exports.export(
      CLIENT_ID,
      { presetId: "skincare-brand" },
      ACTOR,
    );
    assert.equal(record.status, "ok");
    assert.equal(record.filesWritten, 0, "no files written on clean re-export");
    assert.equal(world.inspect.fs.size, before, "filesystem size unchanged");
  });

  test("step 3: idempotent re-export preserves operator hand-edits", async () => {
    // Operator hand-edits package.json.
    const path = "/test/clients/smoke-skincare/package.json";
    const original = world.inspect.fs.get(path)!;
    const handEdited = original.replace(`"name": "smoke-skincare-portal"`, `"name": "smoke-skincare-portal-RENAMED"`);
    assert.notEqual(handEdited, original, "operator edit applied to fixture");
    world.inspect.fs.set(path, handEdited);

    const record = await services.exports.export(
      CLIENT_ID,
      { presetId: "skincare-brand" },
      ACTOR,
    );
    assert.equal(record.status, "ok");
    assert.ok(record.filesPreserved >= 1, "at least one file preserved");
    // Operator edit survives.
    assert.equal(world.inspect.fs.get(path), handEdited, "operator edit not overwritten");
  });

  test("step 4: every shipped preset validates against PortalPreset shape", () => {
    const presets = services.presets.list();
    assert.equal(presets.length, 4);
    assert.deepEqual(
      presets.map(p => p.id).sort(),
      ["affiliate-only", "membership-only", "service-portal", "skincare-brand"],
    );
    for (const p of presets) {
      const result = PresetService.validate(p);
      assert.equal(result.ok, true, `preset ${p.id} validation: ${(result as { error?: string }).error ?? "OK"}`);
    }
    // Negative — a malformed preset is rejected.
    const bad: PortalPreset = {
      id: "bad", label: "Bad", description: "missing primaryColor",
      installedPlugins: [],
      portalVariants: {},
      starterContent: { pages: [] },
      defaultBrand: { primaryColor: "" },
      recommendedPhase: "live",
    };
    const reject = PresetService.validate(bad);
    assert.equal(reject.ok, false);
  });

  test("step 5: brand-kit override beats preset default", async () => {
    // Build a fresh world so we don't fight the prior test's fingerprints.
    const w = buildWorld({ withEditor: true });
    const c = containerWithDeps({
      agencyId: AGENCY_ID,
      storage: w.storage,
      tenant: w.tenant,
      activity: w.activity,
      events: w.events,
      pluginInstalls: w.pluginInstalls,
      filesystem: w.filesystem,
      websiteEditor: w.websiteEditor,
    });
    const plan = await c.exports.plan(CLIENT_ID, {
      presetId: "skincare-brand",
      brandOverride: { primaryColor: "#000000" },
    });
    assert.ok(plan, "plan produced");
    // The portal-config.json file inside the plan should carry the
    // override, not the preset's #F97316.
    const cfgFile = plan!.files.find(f => f.path === "portal-config.json")!;
    const cfg = JSON.parse(cfgFile.content) as { brand: { primaryColor: string } };
    assert.equal(cfg.brand.primaryColor, "#000000");
    // The Tailwind config also reflects the override.
    const tailwindFile = plan!.files.find(f => f.path === "tailwind.config.ts")!;
    assert.match(tailwindFile.content, /"#000000"/);
  });
});
