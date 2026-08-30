// Finish setup — the requirements half of the plugin settings page.
//
// Item 3 of the plan asked for a renderer over `SetupStep[]` that collects
// answers and posts them through `installPlugin({ setupAnswers })`. This is the
// test for what got built INSTEAD, and the difference is the whole point:
//
//   • forwarding works, consumption does not — zero of the ten `onInstall`
//     implementations read `setupAnswers`, and `ecommerce` (the only module
//     declaring `setup`) names the parameter `_setupAnswers`;
//   • `ecommerce`'s three setup fields duplicate the `settings.stripe` group,
//     which already stores them via `secretVault` — the setup fields have no
//     vault binding at all.
//
// So a UI built to the letter of the plan would take a live Stripe secret key
// and drop it. `setup` is therefore read as a REQUIREMENTS declaration (it is
// the only place a field is marked `required`; `SettingsField` has no such
// flag), and the vault-backed settings surface stays the only writer.
//
// The last suite here is the one that matters most over time: it holds the two
// blocks of the REAL ecommerce manifest against each other, so a rename that
// silently makes a requirement uncollectable fails here rather than on screen.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  describeSetupCompletion,
  type SetupRequirementSource,
} from "../src/lib/plugins/pluginSetupStatus";
import type { PluginSettingsGroupView } from "../src/lib/server/plugins/pluginSettingsSurface";

function group(fields: { id: string; configured: boolean }[]): PluginSettingsGroupView {
  return {
    id: "stripe",
    label: "Stripe",
    fields: fields.map(f => ({
      id: f.id,
      label: f.id,
      type: "password" as const,
      value: null,
      secret: true,
      configured: f.configured,
      source: f.configured ? ("vault" as const) : null,
    })),
  };
}

const steps: SetupRequirementSource[] = [{
  id: "stripe-keys",
  title: "Stripe API keys",
  fields: [
    { id: "secret", label: "Stripe secret key", required: true, helpText: "From dashboard." },
    { id: "webhook", label: "Stripe webhook secret", required: true },
    { id: "publishable", label: "Stripe publishable key", required: false },
  ],
}];

describe("a module that declares no setup at all", () => {
  it("is complete, and contributes no banner", () => {
    const status = describeSetupCompletion(undefined, [group([])]);
    assert.equal(status.complete, true);
    assert.equal(status.required, 0);
    assert.deepEqual(status.missing, []);
  });

  it("treats an empty array the same as an absent one", () => {
    assert.equal(describeSetupCompletion([], [group([])]).complete, true);
  });
});

describe("required values", () => {
  it("counts only what is marked required — an optional field never blocks", () => {
    const status = describeSetupCompletion(steps, [group([
      { id: "secret", configured: true },
      { id: "webhook", configured: true },
      { id: "publishable", configured: false },
    ])]);
    assert.equal(status.required, 2, "publishable is required: false and must not be counted");
    assert.equal(status.satisfied, 2);
    assert.equal(status.complete, true, "an unset optional field must not hold setup open");
  });

  it("reports what is missing, with the step that explains why", () => {
    const status = describeSetupCompletion(steps, [group([
      { id: "secret", configured: true },
      { id: "webhook", configured: false },
      { id: "publishable", configured: false },
    ])]);
    assert.equal(status.complete, false);
    assert.equal(status.satisfied, 1);
    assert.equal(status.missing.length, 1);
    assert.equal(status.missing[0].fieldId, "webhook");
    assert.equal(status.missing[0].stepTitle, "Stripe API keys");
    assert.equal(status.missing[0].groupLabel, "Stripe", "the panel has to point at the group holding the input");
  });

  it("carries the field's own help text rather than inventing guidance", () => {
    const status = describeSetupCompletion(steps, [group([
      { id: "secret", configured: false },
      { id: "webhook", configured: true },
    ])]);
    assert.equal(status.missing[0].helpText, "From dashboard.");
  });

  it("accepts a secret inherited from the deployment environment", () => {
    // `configured` is true for a vault value OR an environment fallback. Setup
    // asks whether the module can WORK, not who owns the key — the settings
    // field beside it already draws that distinction via `source`.
    const inherited: PluginSettingsGroupView = {
      ...group([{ id: "secret", configured: true }, { id: "webhook", configured: true }]),
    };
    inherited.fields[0].source = "environment";
    assert.equal(describeSetupCompletion(steps, [inherited]).complete, true);
  });
});

describe("a requirement with no field behind it", () => {
  const orphan: SetupRequirementSource[] = [{
    id: "s", title: "Keys",
    fields: [{ id: "secret", label: "Secret", required: true }, { id: "ghost", label: "Ghost key", required: true }],
  }];
  const status = describeSetupCompletion(orphan, [group([{ id: "secret", configured: true }])]);

  it("is reported, not silently dropped", () => {
    assert.deepEqual(status.unmapped.map(u => u.fieldId), ["ghost"]);
  });

  it("is excluded from the count, so the panel can still reach done", () => {
    // Counting it would leave "1 of 2" on screen with no field to act on.
    assert.equal(status.required, 1);
    assert.equal(status.satisfied, 1);
  });

  it("does not hold `complete` false forever", () => {
    assert.equal(status.complete, true,
      "a banner nobody can dismiss by acting is noise; the gap is reported separately");
  });
});

describe("a manifest that declares one id in two groups", () => {
  it("resolves against the first, so group order cannot change the answer", () => {
    const a: PluginSettingsGroupView = { ...group([{ id: "secret", configured: true }]), id: "a", label: "A" };
    const b: PluginSettingsGroupView = { ...group([{ id: "secret", configured: false }]), id: "b", label: "B" };
    const one: SetupRequirementSource[] = [{ id: "s", title: "T", fields: [{ id: "secret", label: "S", required: true }] }];
    assert.equal(describeSetupCompletion(one, [a, b]).complete, true);
    assert.equal(describeSetupCompletion(one, [a, b]).missing.length, 0);
  });
});

describe("the real ecommerce manifest", () => {
  const source = readFileSync("src/built-ins/modules/ecommerce/index.ts", "utf8");

  it("still routes its secrets to the vault, not to setupAnswers", () => {
    // The reason this whole surface avoids the `onInstall` path. If a future
    // edit removes the vault binding, secrets would land in `install.config`,
    // which is handed to page props and therefore to the browser.
    assert.match(source, /secretVault: \{ provider: "stripe", field: "secretKey" \}/);
    assert.match(source, /secretVault: \{ provider: "stripe", field: "webhookSecret" \}/);
  });

  it("has an onInstall that still ignores its answers — the premise this was built on", () => {
    // If this ever stops being true, the plan's original design becomes viable
    // and this test should be revisited rather than deleted.
    assert.match(source, /async onInstall\(ctx: PluginCtx, _setupAnswers: Record<string, string>\)/,
      "the underscore is the evidence that answers are discarded");
  });

  it("declares every REQUIRED setup id as a settings field, so each is collectable", () => {
    // The regression this suite exists for: rename one id in either block and
    // the Finish-setup panel starts naming a requirement the page cannot take.
    const setupBlock = /\n  setup: \[([\s\S]*?)\n  \],\n/.exec(source)?.[1] ?? "";
    assert.notEqual(setupBlock, "", "the setup block must still be findable");
    const settingsBlock = /\n  settings: \{([\s\S]*?)\n  \},\n/.exec(source)?.[1] ?? "";
    assert.notEqual(settingsBlock, "", "the settings block must still be findable");

    // Ids in `setup` that are marked required, by reading each field object.
    const required = [...setupBlock.matchAll(/id:\s*"([^"]+)"[\s\S]{0,220}?required:\s*true/g)].map(m => m[1]);
    assert.ok(required.length >= 2, `expected at least two required setup fields, found ${required.length}`);

    const settingsIds = new Set([...settingsBlock.matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]));
    for (const id of required) {
      assert.ok(settingsIds.has(id), `required setup field "${id}" has no settings field to collect it`);
    }
  });
});

describe("the panel", () => {
  const panel = readFileSync("src/components/workspaces/PluginSettingsPanel.tsx", "utf8");

  it("shows the banner only while something is outstanding", () => {
    assert.match(panel, /if \(!missing\.length && !unmapped\.length\) return null;/);
  });

  it("never becomes a second place to type a secret", () => {
    const banner = /function SetupBanner\(\{[\s\S]*?\n\}\n/.exec(panel)?.[0] ?? "";
    assert.notEqual(banner, "", "SetupBanner must exist");
    assert.doesNotMatch(banner, /<input|onChange|useState/,
      "the banner is a signpost — the vault-backed field below stays the only input");
  });

  it("does not reach for the discarding install path", () => {
    // Comments stripped first: this file's own prose explains WHY `setupAnswers`
    // is avoided, and an assertion that cannot tell an explanation from a call
    // would forbid documenting the decision.
    const code = panel
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .split("\n")
      .filter(line => !line.trim().startsWith("//"))
      .join("\n");
    assert.doesNotMatch(code, /setupAnswers/,
      "no code path here may post answers to the install route");
  });
});
