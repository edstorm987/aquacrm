import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";

import { getPlugin } from "../src/built-ins/runtime/_registry";
import { createCampaignHandler } from "../src/built-ins/modules/agency-marketing/src/api/handlers";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes";
import type {
  ActivityEntry,
  Agency as MarketingAgency,
  PluginInstall as MarketingInstall,
} from "../src/built-ins/modules/agency-marketing/src/lib/tenancy";
import {
  clearAgencyMarketingFoundation,
  registerAgencyMarketingFoundation,
} from "../src/built-ins/modules/agency-marketing/src/server/foundationAdapter";
import {
  describePluginSettings,
  writePluginSettings,
} from "../src/lib/server/plugins/pluginSettingsSurface";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";

after(() => clearAgencyMarketingFoundation());

describe("Agency Marketing settings contract", () => {
  it("mounts the canonical settings editor on the module's own Settings page", () => {
    const page = readFileSync(
      new URL("../src/built-ins/modules/agency-marketing/src/pages/SettingsPage.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /import \{ PluginSettingsPanel \} from "@\/components\/workspaces\/PluginSettingsPanel"/);
    assert.match(page, /describePluginSettings\(props\.install\.pluginId, \{ agencyId: props\.agencyId \}\)/);
    assert.match(page, /<PluginSettingsPanel initial=\{settings\} \/>/);
  });

  it("declares only the setting that campaign creation consumes", () => {
    const plugin = getPlugin("agency-marketing");
    assert.ok(plugin);
    const fields = plugin.settings.groups.flatMap(group => group.fields.map(field => field.id));
    assert.deepEqual(fields, ["defaultCurrency"]);
  });

  it("save -> reload -> campaign creation uses the changed currency", async () => {
    await ensureHydrated();
    const agency = createAgency({
      name: "Marketing settings contract",
      slug: `marketing-settings-${Date.now()}`,
    });
    upsertInstall({
      pluginId: "agency-marketing",
      scope: { agencyId: agency.id },
      enabled: true,
      config: {},
      features: {},
    });

    const saved = writePluginSettings({
      pluginId: "agency-marketing",
      scope: { agencyId: agency.id },
      values: { defaultCurrency: "gbp" },
      actorUserId: "user_marketing_settings",
    });
    assert.deepEqual(saved.configFields, ["defaultCurrency"]);

    const reloaded = describePluginSettings("agency-marketing", { agencyId: agency.id });
    const currency = reloaded?.groups
      .flatMap(group => group.fields)
      .find(field => field.id === "defaultCurrency");
    assert.equal(currency?.value, "gbp", "the saved value did not reload through the settings surface");

    const install = getInstall({ agencyId: agency.id }, "agency-marketing");
    assert.ok(install);

    const values = new Map<string, unknown>();
    const storage: PluginStorage = {
      async get<T = unknown>(key: string) { return values.get(key) as T | undefined; },
      async set<T = unknown>(key: string, value: T) { values.set(key, structuredClone(value)); },
      async del(key: string) { values.delete(key); },
      async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
    };
    const marketingAgency: MarketingAgency = {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      brand: agency.brand,
      ownerEmail: agency.ownerEmail,
      status: agency.status,
      createdAt: agency.createdAt,
      updatedAt: agency.updatedAt,
    };
    registerAgencyMarketingFoundation({
      tenant: { getAgency: id => id === agency.id ? marketingAgency : null },
      user: { getUser: () => null },
      activity: {
        logActivity: input => ({ id: "activity_marketing_settings", ts: Date.now(), ...input } as ActivityEntry),
        listActivity: () => [],
      },
      events: { emit: () => undefined },
      pluginInstalls: {
        getInstall: (scope, pluginId) => getInstall(scope, pluginId) as MarketingInstall | null,
      },
    });

    const context: PluginCtx = {
      agencyId: agency.id,
      actor: "user_marketing_settings",
      install: install as MarketingInstall,
      storage,
      services: {} as PluginCtx["services"],
    };
    const response = await createCampaignHandler(new Request("http://localhost/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Settings-driven campaign", channel: "email" }),
    }), context);
    assert.equal(response.status, 201);
    const payload = await response.json() as { campaign: { currency: string } };
    assert.equal(payload.campaign.currency, "gbp", "campaign creation ignored the saved setting");
  });
});
