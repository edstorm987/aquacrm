// Which of a module's REQUIRED first-install answers are still missing.
//
// ── Why this is not the wizard the plan described ─────────────────────────
//
// `04-DEVELOPMENT-PLANS.md` item 3 called for a renderer over `SetupStep[]`,
// collecting answers and handing them to `installPlugin({ setupAnswers })`. The
// forwarding is real — `_runtime.ts` passes them to `onInstall` — but a sweep on
// 2026-08-29 found the other end of that pipe is not connected:
//
//   • **Zero of the ten `onInstall` implementations read `setupAnswers`.**
//     `ecommerce`, the only module that declares `setup` at all, signs it
//     `_setupAnswers` — the underscore is deliberate, and the body only seeds
//     an empty `collections` list.
//   • `ecommerce`'s three `setup` fields are the SAME three the `settings.stripe`
//     group already collects — except the settings fields carry
//     `secretVault: { provider: "stripe" }` and the setup fields carry nothing.
//
// So a UI built to the plan would take a live Stripe secret key and a webhook
// secret, hand them to a function that drops them, and sit beside a form that
// stores the same two values correctly in the encrypted vault. That is the
// "declared, never consumed" defect this codebase keeps finding, except this
// time it would be holding credentials.
//
// ── What `setup` is actually good for ─────────────────────────────────────
//
// One thing, and it is genuinely missing elsewhere: `SettingsField` has **no
// `required` flag**. `SetupStep.fields[].required` is the only place in the
// system that says which values a module cannot work without. So `setup` is
// read here as a REQUIREMENTS DECLARATION, and the vault-backed settings
// surface stays the only thing that ever stores a value. Nothing new touches a
// secret; the write path is still `writePluginSettings`.
//
// Matching is by field id, which is how the two blocks already line up in
// `ecommerce`. A required id with no settings field behind it is reported as
// `unmapped` rather than quietly dropped — a "Finish setup" panel listing a
// requirement the page cannot collect would be unfinishable, and telling
// somebody to complete an impossible form is worse than saying nothing.

import type { PluginSettingsGroupView } from "@/lib/server/plugins/pluginSettingsSurface";

/** The subset of `SetupStep` this reads. Structural, so a plugin's vendored
 *  copy of the manifest types satisfies it without importing ours. */
export interface SetupRequirementSource {
  id: string;
  title: string;
  fields: { id: string; label: string; required?: boolean; helpText?: string }[];
}

export interface MissingRequirement {
  fieldId: string;
  label: string;
  helpText?: string;
  /** Which step declared it — the only context explaining WHY it is needed. */
  stepId: string;
  stepTitle: string;
  /** The settings group holding the input, so the panel can point at it. */
  groupId: string;
  groupLabel: string;
}

export interface PluginSetupStatus {
  /** Required fields this page can actually collect. */
  required: number;
  satisfied: number;
  complete: boolean;
  missing: MissingRequirement[];
  /**
   * Required by `setup`, with no settings field of that id behind it.
   *
   * Not counted in `required`: it cannot be satisfied here, so counting it
   * would leave a panel permanently reading "1 of 3" with no way to move.
   * Surfaced so the gap is visible instead of silent.
   */
  unmapped: { fieldId: string; label: string; stepTitle: string }[];
}

/** Every configured-state in the settings view, indexed by field id. */
function indexFields(groups: PluginSettingsGroupView[]) {
  const byId = new Map<string, { configured: boolean; groupId: string; groupLabel: string }>();
  for (const group of groups) {
    for (const field of group.fields) {
      // First declaration wins. Two groups claiming one id is a manifest bug,
      // and picking the later one would make the panel's answer depend on
      // group order.
      if (!byId.has(field.id)) {
        byId.set(field.id, { configured: field.configured, groupId: group.id, groupLabel: group.label });
      }
    }
  }
  return byId;
}

/**
 * Compare what a module says it needs against what its settings actually hold.
 *
 * Pure, and deliberately takes the settings VIEW rather than a scope: the view
 * has already resolved the vault (`configured` is true for a secret held in
 * this workspace's vault *or* inherited from the deployment environment), so
 * this never has to know how a secret is stored — or be able to read one.
 */
export function describeSetupCompletion(
  steps: SetupRequirementSource[] | undefined,
  groups: PluginSettingsGroupView[],
): PluginSetupStatus {
  const empty: PluginSetupStatus = { required: 0, satisfied: 0, complete: true, missing: [], unmapped: [] };
  if (!steps?.length) return empty;

  const byId = indexFields(groups);
  const missing: MissingRequirement[] = [];
  const unmapped: PluginSetupStatus["unmapped"] = [];
  let required = 0;
  let satisfied = 0;

  for (const step of steps) {
    for (const field of step.fields) {
      // `required` is opt-in. An optional first-install field is a convenience,
      // and blocking a "Finish setup" panel on one would be an invented rule.
      if (!field.required) continue;
      const settings = byId.get(field.id);
      if (!settings) {
        unmapped.push({ fieldId: field.id, label: field.label, stepTitle: step.title });
        continue;
      }
      required += 1;
      if (settings.configured) {
        satisfied += 1;
        continue;
      }
      missing.push({
        fieldId: field.id,
        label: field.label,
        ...(field.helpText ? { helpText: field.helpText } : {}),
        stepId: step.id,
        stepTitle: step.title,
        groupId: settings.groupId,
        groupLabel: settings.groupLabel,
      });
    }
  }

  return {
    required,
    satisfied,
    // Complete means nothing collectable is outstanding. An `unmapped`
    // requirement does NOT hold this false forever — the panel reports it
    // separately, because a banner nobody can dismiss by acting is noise.
    complete: missing.length === 0,
    missing,
    unmapped,
  };
}
