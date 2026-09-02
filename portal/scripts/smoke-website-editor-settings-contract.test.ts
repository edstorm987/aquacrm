import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { getPlugin } from "../src/built-ins/runtime/_registry";
import { handleCreatePage } from "../src/built-ins/modules/website-editor/src/api/handlers/pages";
import { handleCreateTheme } from "../src/built-ins/modules/website-editor/src/api/handlers/themes";
import { appearanceToColorSchemeCss } from "../src/built-ins/modules/website-editor/src/components/themeCss";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/website-editor/src/lib/aquaPluginTypes";
import {
  describePluginSettings,
  PluginSettingsError,
  writePluginSettings,
} from "../src/lib/server/plugins/pluginSettingsSurface";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function memoryStorage(): PluginStorage {
  const values = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string) { return values.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
}

describe("Website Editor settings manifest and mount", () => {
  it("retains only settings with runtime consumers", () => {
    const plugin = getPlugin("website-editor");
    assert.ok(plugin);
    const fields = plugin.settings.groups.flatMap(group => group.fields.map(field => field.id));
    assert.deepEqual(fields, ["defaultThemeVariant", "defaultStarterId"]);
    assert.ok(!fields.includes("githubRepo"), "the unimplemented GitHub repository control returned");
    assert.ok(!fields.includes("githubBranch"), "the unimplemented GitHub branch control returned");
  });

  it("mounts the canonical settings panel at the reachable customise route", () => {
    const manifest = source("src/built-ins/modules/website-editor/index.ts");
    assert.match(
      manifest,
      /path: "\/portal\/clients\/\[clientId\]\/customise"[\s\S]{0,180}component: \(\) => import\("\.\/src\/pages\/CustomiseRoutePage"\)/,
    );
    const route = source("src/built-ins/modules/website-editor/src/pages/CustomiseRoutePage.tsx");
    assert.match(route, /describePluginSettings\(props\.install\.pluginId/);
    assert.match(route, /clientId: props\.clientId/);
    assert.match(route, /canEditPluginSettings\(\)/);
    const client = source("src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx");
    assert.match(client, /<PluginSettingsPanel initial=\{settings\} clientId=\{clientId\} canEdit=\{canEdit\} \/>/);
  });
});
describe("Website Editor settings save, reload, and behavior", () => {
  it("saved defaults change new themes and new login portal variants", async () => {
    await ensureHydrated();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const agency = createAgency({ name: "Website settings contract", slug: `website-settings-${suffix}` });
    const client = createClient(agency.id, { name: "Website settings client", slug: `website-client-${suffix}` });
    upsertInstall({
      pluginId: "website-editor",
      scope: { agencyId: agency.id, clientId: client.id },
      enabled: true,
      config: {},
      features: {},
    });

    const saved = writePluginSettings({
      pluginId: "website-editor",
      scope: { agencyId: agency.id, clientId: client.id },
      values: {
        defaultThemeVariant: "dark",
        defaultStarterId: "login-onboarding",
      },
      actorUserId: "user_website_settings",
    });
    assert.deepEqual(saved.configFields, ["defaultThemeVariant", "defaultStarterId"]);

    const reloaded = describePluginSettings("website-editor", {
      agencyId: agency.id,
      clientId: client.id,
    });
    assert.ok(reloaded);
    const values = Object.fromEntries(
      reloaded.groups.flatMap(group => group.fields).map(field => [field.id, field.value]),
    );
    assert.equal(values.defaultThemeVariant, "dark");
    assert.equal(values.defaultStarterId, "login-onboarding");

    const install = getInstall({ agencyId: agency.id, clientId: client.id }, "website-editor");
    assert.ok(install);
    const context: PluginCtx = {
      agencyId: agency.id,
      clientId: client.id,
      install: install as PluginCtx["install"],
      storage: memoryStorage(),
      actor: "user_website_settings",
      services: {} as PluginCtx["services"],
    };

    const themeResponse = await handleCreateTheme(new Request("http://localhost/themes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: "site_settings_contract", name: "Settings theme" }),
    }), context);
    assert.equal(themeResponse.status, 201);
    const themePayload = await themeResponse.json() as {
      theme: { appearance?: "light" | "dark" | "auto" };
    };
    assert.equal(themePayload.theme.appearance, "dark", "new theme ignored the saved default appearance");
    assert.equal(
      appearanceToColorSchemeCss(themePayload.theme.appearance),
      ":root { color-scheme: dark; }",
      "the saved appearance did not change rendered browser color-scheme behavior",
    );

    const pageResponse = await handleCreatePage(new Request("http://localhost/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteId: "site_settings_contract",
        title: "Configured login",
        slug: "/portal/login/configured",
        portalRole: "login",
      }),
    }), context);
    assert.equal(pageResponse.status, 201);
    const pagePayload = await pageResponse.json() as {
      page: { variantId?: string; blocks: Array<{ children?: Array<{ type: string }> }> };
    };
    assert.equal(pagePayload.page.variantId, "login-onboarding");
    assert.ok(
      pagePayload.page.blocks[0]?.children?.some(block => block.type === "hero"),
      "new login variant did not receive the configured onboarding starter tree",
    );
  });

  it("removed GitHub fields cannot silently persist through the generic writer", async () => {
    await ensureHydrated();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const agency = createAgency({ name: "Website settings removed fields", slug: `website-removed-${suffix}` });
    const client = createClient(agency.id, { name: "Website removed client", slug: `website-removed-client-${suffix}` });
    upsertInstall({
      pluginId: "website-editor",
      scope: { agencyId: agency.id, clientId: client.id },
      enabled: true,
      config: {},
      features: {},
    });

    assert.throws(
      () => writePluginSettings({
        pluginId: "website-editor",
        scope: { agencyId: agency.id, clientId: client.id },
        values: { githubRepo: "owner/repo" },
        actorUserId: "user_website_settings",
      }),
      (error: unknown) => error instanceof PluginSettingsError && error.message === "unknown_field:githubRepo",
    );
  });
});
