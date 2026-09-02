import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const page = readFileSync(join(ROOT, "src", "app", "portal", "agency", "actions", "_ActionsPage.tsx"), "utf-8");
const workspace = readFileSync(join(ROOT, "src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx"), "utf-8");

describe("needs-attention alerts reach the Actions queue", () => {
  // They used to arrive only through buildBusinessRecommendedActions, which
  // drops every `notice` alert and caps the result at five — so the bulk of
  // the inbox, including the classify-enquiry and company questions (both
  // `notice` by design), could never appear in Actions at all.

  it("the recommender cannot be the only path, because it drops notice alerts", () => {
    // Documents WHY the direct path is needed. The classify-enquiry and
    // company-membership alerts are `notice` by design, so a recommender that
    // skips notices could never surface them.
    const recommender = readFileSync(
      join(ROOT, "src", "lib", "intelligence", "businessRecommendedActions.ts"), "utf-8",
    );
    assert.match(recommender, /severity === "notice"\) continue/,
      "if this filter is ever removed, revisit the dedupe in _ActionsPage");
  });

  it("Actions pushes alerts into the queue directly", () => {
    assert.match(page, /for \(const alert of operationalAlerts\)/,
      "alerts must be added to the queue, not only fed to the recommender");
    assert.match(page, /attention:\$\{alert\.id\}/, "queue items must be keyed by alert id");
  });

  it("does not show the same job twice", () => {
    assert.match(page, /recommendedAlertIds\.has\(alert\.id\)/,
      "an alert already surfaced as a recommendation must be skipped");
    assert.match(page, /acceptedSourceIds\.has\(`attention:\$\{alert\.id\}`\)/,
      "an alert already accepted as a task must be skipped");
  });

  it("tags them with the inbox origin so the row badge stays truthful", () => {
    assert.match(page, /origin: "inbox"/, "alerts must carry their own origin");
  });

  it("shows them in CRM rather than a tab of their own", () => {
    // Both are "things Aqua noticed that you have not accepted yet"; two tabs
    // meant checking twice for the same job. The row badge keeps provenance.
    assert.doesNotMatch(workspace, /id: "inbox", label: "Needs attention"/,
      "there should be no separate Needs attention tab");
    assert.match(workspace, /source === "crm" \? <CrmIntake actions=\{crmIntake\}/,
      "CRM must show the whole intake, inbox work included");
  });

  it("folds them into the All count rather than double-counting", () => {
    assert.match(workspace, /counts\.all = counts\.radar \+ counts\.advisor \+ counts\.manual \+ counts\.crm;/);
  });

  it("preserves provenance when an alert is accepted as a task", () => {
    assert.match(workspace, /origin: action\.origin \?\? "crm"/,
      "an accepted alert must record where it came from, not claim to be CRM work");
  });

  it("keeps alerts approval-gated rather than auto-creating tasks", () => {
    // They enter as generated actions, which require an explicit accept.
    assert.ok(!/createAgencyTask\(/.test(page), "the Actions page must not create tasks on sight");
  });
});

describe("every action in the queue can be acted on", () => {
  it("offers only mutations backed by the generated action's real store", () => {
    assert.match(workspace, /Only operational inbox alerts can be parked or dismissed/);
    assert.ok(
      (workspace.match(/action\.origin === "inbox" \? <AttentionControls/g) ?? []).length >= 2,
      "provider-backed controls were not limited consistently to inbox alerts",
    );
    assert.match(workspace, /Open source <ArrowUpRight/,
      "pipeline signals lost their truthful source action");
    assert.match(workspace, /disabled=\{accepting \|\| Boolean\(attentionBusyAction\)\}/,
      "pipeline signals lost their approval action or share a misleading busy state");
  });

  it("never opens an empty evidence panel on a pipeline signal", () => {
    // Pipeline signals are generated from leads and invoices, not the alert
    // list, so a lookup by id finds nothing — the row's own detail fills in.
    assert.match(workspace, /fallback=\{\{ title: action\.title, detail: action\.detail/);
  });

  it("still withholds Resolve where nothing can be resolved on a screen", () => {
    const controls = readFileSync(join(ROOT, "src", "components", "attention", "AttentionControls.tsx"), "utf-8");
    assert.match(controls, /const canResolve = kind === "in-app"/);
  });
});
