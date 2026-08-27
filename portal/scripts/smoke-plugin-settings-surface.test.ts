// The generic plugin settings surface.
//
// Finding 2026-08-22 "Stripe can never be configured": agency-finance declared
// `stripeSecretKey` and `stripeWebhookSecret` as password fields in its
// manifest, and NO component anywhere rendered a plugin's `settings.groups`.
// The only `patchInstall` caller in `src/app` wrote four hardcoded finance
// keys. So `stripeConfigured()` was permanently false, `invoices/checkout` and
// `payments/refund` were unreachable by construction, and `closeDeal.ts` plus
// `stripe.ts` both told the operator to "Set up Stripe in Finance settings" —
// a control that had never been built.
//
// The contract the finding asked for, verbatim: **every field id declared in a
// manifest's `settings.groups` must be writable through a real settings write
// path.** That test was red for both stripe fields; it is the first case below
// and it now runs over EVERY registered plugin, not just finance.
//
// The rest pin the part that is easy to get wrong once a form exists: a secret
// must never come back out. Not in the describe payload, not on the install
// record that page props hand to the browser, not in the activity log.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.PORTAL_BACKEND ??= "memory";

import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { listPlugins, getPlugin } from "../src/built-ins/runtime/_registry";
import { validatePlugin } from "../src/built-ins/runtime/_validate";
import {
  PluginSettingsError,
  describePluginSettings,
  writePluginSettings,
} from "../src/lib/server/plugins/pluginSettingsSurface";
import { installConfigWithSecrets } from "../src/lib/server/plugins/pluginSecretConfig";
import { stripeConfigured, readStripeKeysFromInstall } from "../src/built-ins/modules/agency-finance/src/lib/stripe";

const SECRET = "sk_test_do_not_echo_me_0001";
const WEBHOOK = "whsec_do_not_echo_me_0002";

let seq = 0;
async function agencyWith(pluginId: string, config: Record<string, unknown> = {}) {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Settings Co", slug: `settings-co-${Date.now()}-${seq}` });
  upsertInstall({ pluginId, scope: { agencyId: agency.id }, enabled: true, config, features: {} });
  return agency;
}

/** A plausible value for a field, by declared type. */
function sampleFor(field: { id: string; type: string; options?: { value: string }[] }): unknown {
  switch (field.type) {
    case "number": return 7;
    case "boolean": return true;
    case "select": return field.options?.[0]?.value ?? "";
    case "password": return `secret-for-${field.id}`;
    case "email": return "someone@example.test";
    case "url": return "https://example.test";
    case "color": return "#112233";
    default: return `value-for-${field.id}`;
  }
}

// ─── 1. The contract the finding named ────────────────────────────────────

describe("every declared settings field is writable through a real write path", () => {
  for (const plugin of listPlugins()) {
    const fields = plugin.settings.groups.flatMap(group => group.fields);
    if (!fields.length) continue;
    it(`${plugin.id}: all ${fields.length} declared fields accept a write`, async () => {
      const agency = await agencyWith(plugin.id);
      const written = new Set<string>();

      // Secrets are written per PROVIDER, not per field: the integrations
      // catalogue can mark companions required (Stripe needs both the secret
      // key and the webhook signing secret), and a connection saved without one
      // would verify no events. Batching by provider is what the settings panel
      // does too — it posts every field the operator touched in one request.
      const byProvider = new Map<string, typeof fields>();
      for (const field of fields) {
        if (field.type !== "password") continue;
        const provider = field.secretVault?.provider ?? "";
        byProvider.set(provider, [...(byProvider.get(provider) ?? []), field]);
      }
      for (const [provider, group] of byProvider) {
        const result = writePluginSettings({
          pluginId: plugin.id,
          scope: { agencyId: agency.id },
          values: Object.fromEntries(group.map(field => [field.id, sampleFor(field)])),
          actorUserId: "user_settings_test",
        });
        for (const field of group) {
          assert.ok(
            result.secretFields.includes(field.id),
            `${plugin.id}.${field.id} (secret → ${provider}) was declared but nothing wrote it`,
          );
          written.add(field.id);
        }
      }

      // Ordinary fields one at a time, so a failure names the field.
      for (const field of fields) {
        if (field.type === "password") continue;
        const result = writePluginSettings({
          pluginId: plugin.id,
          scope: { agencyId: agency.id },
          values: { [field.id]: sampleFor(field) },
          actorUserId: "user_settings_test",
        });
        assert.ok(
          result.configFields.includes(field.id),
          `${plugin.id}.${field.id} (${field.type}) was declared but nothing wrote it`,
        );
        written.add(field.id);
      }

      assert.deepEqual(
        fields.map(field => field.id).filter(id => !written.has(id)),
        [],
        "declared but unwritable",
      );
    });
  }
});

// ─── 2. Stripe, end to end ────────────────────────────────────────────────

describe("agency-finance Stripe can now actually be configured", () => {
  it("saving both keys flips stripeConfigured, and neither key touches install.config", async () => {
    const agency = await agencyWith("agency-finance");
    assert.equal(
      stripeConfigured(installConfigWithSecrets("agency-finance", { agencyId: agency.id }, {})),
      false,
      "the fixture must start unconfigured or the assertion below proves nothing",
    );

    writePluginSettings({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      values: { stripeSecretKey: SECRET, stripeWebhookSecret: WEBHOOK },
      actorUserId: "user_settings_test",
    });

    const install = getInstall({ agencyId: agency.id }, "agency-finance");
    assert.ok(install);
    // `install.config` is handed to page props. A secret on it is a secret in
    // the browser — check the whole record, not just the two known keys.
    const serialisedInstall = JSON.stringify(install);
    assert.ok(!serialisedInstall.includes(SECRET), "the secret key landed on the install record");
    assert.ok(!serialisedInstall.includes(WEBHOOK), "the webhook secret landed on the install record");

    const effective = installConfigWithSecrets("agency-finance", { agencyId: agency.id }, install.config);
    assert.equal(stripeConfigured(effective), true, "stripe is still 'not configured' after saving keys");
    const keys = readStripeKeysFromInstall(effective);
    assert.equal(keys.secretKey, SECRET);
    assert.equal(keys.webhookSecret, WEBHOOK);
  });

  it("describePluginSettings never returns a secret value, only whether one is stored", async () => {
    const agency = await agencyWith("agency-finance");
    writePluginSettings({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      values: { stripeSecretKey: SECRET, stripeWebhookSecret: WEBHOOK },
      actorUserId: "user_settings_test",
    });

    const view = describePluginSettings("agency-finance", { agencyId: agency.id });
    assert.ok(view);
    assert.ok(!JSON.stringify(view).includes(SECRET), "the describe payload carried the secret");
    assert.ok(!JSON.stringify(view).includes(WEBHOOK), "the describe payload carried the webhook secret");

    const field = view.groups.flatMap(group => group.fields).find(f => f.id === "stripeSecretKey");
    assert.ok(field);
    assert.equal(field.secret, true);
    assert.equal(field.value, null);
    assert.equal(field.configured, true);
    assert.equal(field.source, "vault", "a key this workspace saved must not read as the deployment's");
  });

  it("a blank secret leaves the stored one alone (saving the currency must not wipe the key)", async () => {
    const agency = await agencyWith("agency-finance");
    writePluginSettings({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      values: { stripeSecretKey: SECRET, stripeWebhookSecret: WEBHOOK },
      actorUserId: "user_settings_test",
    });
    const result = writePluginSettings({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      values: { stripeSecretKey: "", defaultCurrency: "eur" },
      actorUserId: "user_settings_test",
    });
    assert.deepEqual(result.secretFields, [], "a blank password field must not be treated as a value");
    assert.deepEqual(result.configFields, ["defaultCurrency"]);

    const install = getInstall({ agencyId: agency.id }, "agency-finance");
    assert.equal(install?.config.defaultCurrency, "eur");
    const effective = installConfigWithSecrets("agency-finance", { agencyId: agency.id }, install?.config ?? {});
    assert.equal(readStripeKeysFromInstall(effective).secretKey, SECRET, "the stored key was wiped by a blank field");
  });

  it("nothing but declared fields can be written", async () => {
    const agency = await agencyWith("agency-finance");
    assert.throws(
      () => writePluginSettings({
        pluginId: "agency-finance",
        scope: { agencyId: agency.id },
        values: { enabled: false, somethingElse: "x" },
        actorUserId: "user_settings_test",
      }),
      (error: unknown) => error instanceof PluginSettingsError && /unknown_field:/.test(error.message),
    );
  });

  it("a select only accepts its own options, and a number must be one", async () => {
    const agency = await agencyWith("agency-finance");
    assert.throws(
      () => writePluginSettings({
        pluginId: "agency-finance", scope: { agencyId: agency.id },
        values: { defaultCurrency: "doubloons" }, actorUserId: "user_settings_test",
      }),
      (error: unknown) => error instanceof PluginSettingsError && error.message === "not_an_option:defaultCurrency",
    );
    assert.throws(
      () => writePluginSettings({
        pluginId: "agency-finance", scope: { agencyId: agency.id },
        values: { taxReserveRate: "soon" }, actorUserId: "user_settings_test",
      }),
      (error: unknown) => error instanceof PluginSettingsError && error.message === "not_a_number:taxReserveRate",
    );
  });

  it("a half-filled provider is refused by name, not saved half-connected", async () => {
    // Stripe's catalogue entry marks BOTH keys required: a connection with the
    // secret key and no webhook signing secret cannot verify incoming events,
    // so it would reconcile nothing while looking configured. The refusal names
    // the missing field, and the panel turns it into a sentence.
    const agency = await agencyWith("agency-finance");
    assert.throws(
      () => writePluginSettings({
        pluginId: "agency-finance", scope: { agencyId: agency.id },
        values: { stripeSecretKey: SECRET }, actorUserId: "user_settings_test",
      }),
      (error: unknown) => error instanceof PluginSettingsError && error.message.startsWith("missing_field:"),
    );
    const view = describePluginSettings("agency-finance", { agencyId: agency.id });
    const field = view?.groups.flatMap(group => group.fields).find(f => f.id === "stripeSecretKey");
    assert.equal(field?.configured, false, "a refused save must not leave a half-written connection");
  });

  it("no secret reaches the activity log", async () => {
    const agency = await agencyWith("agency-finance");
    writePluginSettings({
      pluginId: "agency-finance",
      scope: { agencyId: agency.id },
      values: { stripeSecretKey: SECRET, stripeWebhookSecret: WEBHOOK },
      actorUserId: "user_settings_test",
    });
    const log = JSON.stringify(getState().activity.filter(entry => entry.agencyId === agency.id));
    assert.ok(!log.includes(SECRET), "the vault's own activity entry carried the secret value");
    assert.ok(!log.includes(WEBHOOK), "the vault's own activity entry carried the webhook secret");
  });
});

// ─── 3. The class ─────────────────────────────────────────────────────────

describe("declared secrets must say where they are stored", () => {
  it("every password field in every registered manifest routes to the vault", () => {
    const offenders: string[] = [];
    for (const plugin of listPlugins()) {
      for (const group of plugin.settings.groups) {
        for (const field of group.fields) {
          if (field.type !== "password") continue;
          if (!field.secretVault?.provider || !field.secretVault.field) {
            offenders.push(`${plugin.id}.${group.id}.${field.id}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `password fields with nowhere safe to store the value:\n  ${offenders.join("\n  ")}`);
  });

  it("the registry validator refuses one that does not (mutation check)", () => {
    const finance = getPlugin("agency-finance");
    assert.ok(finance);
    // A COPY with the vault target stripped off the secret key. The validator
    // must reject it — otherwise the guard above is the only thing standing
    // between a plugin author and a key in the browser.
    const broken = {
      ...finance,
      settings: {
        ...finance.settings,
        groups: finance.settings.groups.map(group => ({
          ...group,
          fields: group.fields.map(field =>
            field.id === "stripeSecretKey" ? { ...field, secretVault: undefined } : field),
        })),
      },
    };
    const result = validatePlugin(broken);
    assert.equal(result.ok, false);
    assert.ok(
      result.errors.some(error => error.includes("secretVault")),
      `expected a secretVault error, got: ${result.errors.join(" | ")}`,
    );
    // …and the real manifest passes.
    assert.equal(validatePlugin(finance).ok, true, validatePlugin(finance).errors.join(" | "));
  });
});
