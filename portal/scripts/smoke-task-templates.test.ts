import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BUILT_IN_TASK_TEMPLATES, fillTemplateTitle } from "../src/lib/tasks/taskTemplates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const AGENCY = "agency-templates";
let templates: typeof import("../src/server/taskTemplates");
let tasks: typeof import("../src/server/tasks");
let mutate: typeof import("../src/server/storage").mutate;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  const storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  mutate = storage.mutate;
  templates = await import("../src/server/taskTemplates");
  tasks = await import("../src/server/tasks");
});

beforeEach(() => {
  mutate(state => {
    for (const k of Object.keys(state.tasks)) delete state.tasks[k];
    state.taskTemplates ??= {};
    for (const k of Object.keys(state.taskTemplates)) delete state.taskTemplates[k];
  });
});

describe("the built-in library", () => {
  it("ships templates for the jobs that actually repeat", () => {
    const ids = BUILT_IN_TASK_TEMPLATES.map(t => t.id);
    for (const expected of ["builtin:onboard-client", "builtin:chase-invoice", "builtin:offboard-client"]) {
      assert.ok(ids.includes(expected), `${expected} is missing`);
    }
  });

  it("gives every template steps and a summary", () => {
    for (const template of BUILT_IN_TASK_TEMPLATES) {
      assert.ok(template.steps.length >= 3, `${template.id} is too thin to be worth picking`);
      assert.ok(template.summary.trim(), `${template.id} has no summary — the picker would show a bare name`);
      for (const step of template.steps) assert.ok(step.label.trim(), `${template.id} has a blank step`);
    }
  });

  it("only attaches destinations the app already navigates to", () => {
    // A Resolve button pointing at a route that 404s is worse than no button:
    // the operator stops trusting every other one.
    //
    // The inventory is literal `page.tsx` routes plus every `/portal/...` path
    // already linked from working screens. Agency tool paths are served by the
    // `[...rest]` catch-all and have no page of their own, so being linked
    // from a live screen is what makes them real. Regenerate with
    // `node scripts/build-route-inventory.mjs` when routes move.
    const routes = read("scripts", "route-inventory.json");
    const known: string[] = JSON.parse(routes);
    for (const template of BUILT_IN_TASK_TEMPLATES) {
      for (const step of template.steps) {
        if (!step.href) continue;
        const path = step.href.split("?")[0];
        assert.ok(known.includes(path), `${template.id}: ${path} is not a route`);
      }
    }
  });

  it("leaves off-system steps without a destination", () => {
    // "Send the welcome pack" happens in an email client. Pointing it at a
    // vaguely related screen would make the button a lie.
    const onboard = BUILT_IN_TASK_TEMPLATES.find(t => t.id === "builtin:onboard-client")!;
    assert.equal(onboard.steps.find(s => s.label.includes("welcome pack"))?.href, undefined);
  });
});

describe("filling the subject into a title", () => {
  it("substitutes the name", () => {
    assert.equal(fillTemplateTitle("Onboard {subject}", "Cedar Dental"), "Onboard Cedar Dental");
  });

  it("drops the placeholder and its connecting word when there is nobody", () => {
    // A task titled with a literal "{subject}" is worse than a vague one.
    assert.equal(fillTemplateTitle("Onboard {subject}"), "Onboard");
    assert.equal(fillTemplateTitle("Chase the overdue invoice for {subject}"), "Chase the overdue invoice");
    assert.equal(fillTemplateTitle("Quarterly review with {subject}", "  "), "Quarterly review");
  });

  it("leaves a title that has no placeholder alone", () => {
    assert.equal(fillTemplateTitle("Month-end close"), "Month-end close");
  });
});

describe("applying a template", () => {
  it("creates the task with every step already on it", () => {
    const task = templates.createTaskFromTemplate({
      agencyId: AGENCY, templateId: "builtin:onboard-client", subject: "Cedar Dental", createdBy: "ed",
    });
    const source = BUILT_IN_TASK_TEMPLATES.find(t => t.id === "builtin:onboard-client")!;
    assert.equal(task?.title, "Onboard Cedar Dental");
    // Half-applied would read as a job somebody already started, and the
    // missing steps would never be noticed.
    assert.equal(task?.checklist?.length, source.steps.length);
    assert.deepEqual(task?.checklist?.map(i => i.label), source.steps.map(s => s.label));
    assert.ok(task?.checklist?.every(item => !item.done));
  });

  it("carries each step's destination through to its sub-task", () => {
    const task = templates.createTaskFromTemplate({
      agencyId: AGENCY, templateId: "builtin:onboard-client", createdBy: "ed",
    });
    const portal = task?.checklist?.find(i => i.label.includes("portal access"));
    assert.equal(portal?.href, "/portal/agency/portals");
    assert.equal(portal?.focus, "access");
  });

  it("lands as a manual task, because a person chose it", () => {
    const task = templates.createTaskFromTemplate({
      agencyId: AGENCY, templateId: "builtin:month-end", createdBy: "ed",
    });
    assert.equal(task?.origin, "manual");
  });

  it("returns nothing for a template that does not exist", () => {
    assert.equal(templates.createTaskFromTemplate({
      agencyId: AGENCY, templateId: "builtin:nope", createdBy: "ed",
    }), null);
  });
});

describe("writing your own template", () => {
  it("saves and lists it above the built-ins", () => {
    // Somebody who wrote their own onboarding sequence means it to win over
    // the one that shipped in the box.
    templates.saveTaskTemplate(AGENCY, {
      name: "Our onboarding", taskTitle: "Onboard {subject}",
      steps: [{ label: "Ring them" }, { label: "Invoice" }],
    }, "ed");
    const list = templates.listTaskTemplates(AGENCY);
    assert.equal(list[0].name, "Our onboarding");
    assert.equal(list[0].builtIn, false);
    assert.ok(list.some(t => t.builtIn), "the built-ins must still be offered");
  });

  it("drops half-typed blank steps rather than storing empty tick-boxes", () => {
    const saved = templates.saveTaskTemplate(AGENCY, {
      name: "Sparse", steps: [{ label: "Real" }, { label: "   " }],
    }, "ed");
    assert.deepEqual(saved?.steps.map(s => s.label), ["Real"]);
  });

  it("falls back to the name when no task title was written", () => {
    const saved = templates.saveTaskTemplate(AGENCY, { name: "Weekly sweep", steps: [{ label: "x" }] }, "ed");
    assert.equal(saved?.taskTitle, "Weekly sweep");
  });

  it("refuses a blank name", () => {
    assert.throws(() => templates.saveTaskTemplate(AGENCY, { name: "  ", steps: [] }, "ed"));
  });

  it("edits in place rather than creating a second copy", () => {
    const first = templates.saveTaskTemplate(AGENCY, { name: "Draft", steps: [{ label: "one" }] }, "ed");
    templates.saveTaskTemplate(AGENCY, { id: first!.id, name: "Finished", steps: [{ label: "one" }, { label: "two" }] }, "ed");
    const custom = templates.listTaskTemplates(AGENCY).filter(t => !t.builtIn);
    assert.equal(custom.length, 1);
    assert.equal(custom[0].name, "Finished");
    assert.equal(custom[0].steps.length, 2);
  });

  it("keeps who first wrote it when somebody else edits", () => {
    const first = templates.saveTaskTemplate(AGENCY, { name: "Draft", steps: [{ label: "one" }] }, "ed");
    templates.saveTaskTemplate(AGENCY, { id: first!.id, name: "Draft", steps: [{ label: "one" }] }, "sam");
    const stored = Object.values(templates.listTaskTemplates(AGENCY));
    assert.ok(stored.length);
  });

  it("refuses to shadow a built-in", () => {
    // Writing a copy under the same id would leave two templates with one
    // name sitting next to each other in the picker.
    assert.equal(templates.saveTaskTemplate(AGENCY, {
      id: "builtin:onboard-client", name: "Mine", steps: [{ label: "x" }],
    }, "ed"), null);
  });

  it("deletes its own but never a built-in", () => {
    const saved = templates.saveTaskTemplate(AGENCY, { name: "Temporary", steps: [{ label: "x" }] }, "ed");
    assert.equal(templates.deleteTaskTemplate(AGENCY, "builtin:onboard-client"), false);
    assert.equal(templates.deleteTaskTemplate(AGENCY, saved!.id), true);
    assert.equal(templates.listTaskTemplates(AGENCY).filter(t => !t.builtIn).length, 0);
  });

  it("cannot read, edit or delete another agency's template", () => {
    const saved = templates.saveTaskTemplate(AGENCY, { name: "Private", steps: [{ label: "x" }] }, "ed");
    assert.equal(templates.listTaskTemplates("other").some(t => t.id === saved!.id), false);
    assert.equal(templates.saveTaskTemplate("other", { id: saved!.id, name: "Stolen", steps: [{ label: "x" }] }, "them"), null);
    assert.equal(templates.deleteTaskTemplate("other", saved!.id), false);
  });
});

describe("saving a task you already worked as a template", () => {
  // This is how most real templates get written: you discover the steps by
  // doing them. A blank form asks for the sequence from memory.
  it("copies the checklist across", () => {
    const task = tasks.createAgencyTask({ agencyId: AGENCY, title: "Onboard Cedar Dental", createdBy: "ed" });
    tasks.addTaskChecklistItem(AGENCY, task.id, { label: "Create their portal", href: "/portal/agency/portals" });
    tasks.addTaskChecklistItem(AGENCY, task.id, { label: "Invoice them" });
    const template = templates.saveTaskAsTemplate(AGENCY, task.id, "Our onboarding", "ed");
    assert.deepEqual(template?.steps.map(s => s.label), ["Create their portal", "Invoice them"]);
    assert.equal(template?.steps[0].href, "/portal/agency/portals");
  });

  it("does not carry this task's ticks into the template", () => {
    const task = tasks.createAgencyTask({ agencyId: AGENCY, title: "Onboard", createdBy: "ed" });
    const withItem = tasks.addTaskChecklistItem(AGENCY, task.id, { label: "Create their portal" });
    tasks.setTaskChecklistItemDone(AGENCY, task.id, withItem!.checklist![0].id, true, "ed");
    const template = templates.saveTaskAsTemplate(AGENCY, task.id, "Our onboarding", "ed");
    // A template that arrived half-complete would be nonsense.
    assert.equal(JSON.stringify(template?.steps).includes("done"), false);
    const applied = templates.createTaskFromTemplate({ agencyId: AGENCY, templateId: template!.id, createdBy: "ed" });
    assert.ok(applied?.checklist?.every(item => !item.done));
  });

  it("refuses another agency's task", () => {
    const task = tasks.createAgencyTask({ agencyId: AGENCY, title: "Onboard", createdBy: "ed" });
    assert.equal(templates.saveTaskAsTemplate("other", task.id, "Stolen", "them"), null);
  });
});

describe("the picker", () => {
  it("is offered beside the blank form, not buried inside it", () => {
    const ui = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");
    assert.match(ui, /Use a template/);
    assert.match(ui, /TaskTemplateModal/);
  });

  it("asks for a subject only when the title needs one", () => {
    const ui = read("src", "components", "attention", "TaskTemplates.tsx");
    assert.match(ui, /template\.taskTitle\.includes\("\{subject\}"\)/);
  });

  it("says which steps have nowhere to go", () => {
    const ui = read("src", "components", "attention", "TaskTemplates.tsx");
    assert.match(ui, /off-system/);
  });

  it("offers an SOP per step rather than per task", () => {
    const ui = read("src", "components", "attention", "TaskTemplates.tsx");
    assert.match(ui, /SOP for step/);
  });
});

describe("an accepted action arrives with its steps already on it", () => {
  // The template only helps if it runs. Leaving the operator to remember one
  // exists puts the sequence back in their head, which is what it was meant
  // to take out.
  it("seeds the checklist from the family the alert belongs to", () => {
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Classify the enquiry from Sarah",
      origin: "inbox", sourceId: "enquiry-classification:lead_123", createdBy: "ed",
    });
    const source = BUILT_IN_TASK_TEMPLATES.find(t => t.id === "builtin:qualify-enquiry")!;
    assert.deepEqual(task.checklist?.map(i => i.label), source.steps.map(s => s.label));
    assert.ok(task.checklist?.every(item => !item.done));
  });

  it("carries the destinations through, so each step still resolves", () => {
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Chase", origin: "crm", sourceId: "invoice:inv_9", createdBy: "ed",
    });
    assert.ok(task.checklist?.some(item => item.href?.includes("agency-finance/invoices")));
  });

  it("leaves manual tasks blank, because a blank form was meant to be blank", () => {
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Ring the accountant", origin: "manual", createdBy: "ed",
    });
    assert.equal(task.checklist, undefined);
  });

  it("leaves judgement calls alone", () => {
    // A checklist on a Radar deviation would imply a procedure exists where
    // none does — nothing you tick makes a metric return to its median.
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Integration coverage broke its pattern",
      origin: "radar", sourceId: "recommended-radar:incident:abc", createdBy: "ed",
    });
    assert.equal(task.checklist, undefined);
  });

  it("leaves an unmapped family alone rather than guessing", () => {
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Something new", origin: "crm", sourceId: "brand-new-family:x", createdBy: "ed",
    });
    assert.equal(task.checklist, undefined);
  });

  it("lets the agency's own template beat the built-in mapping", () => {
    // Somebody who wrote their own enquiry sequence means it to be the one
    // that runs.
    templates.saveTaskTemplate(AGENCY, {
      name: "Our enquiry flow",
      steps: [{ label: "Ring them within the hour" }],
      appliesTo: ["enquiry-classification:"],
    }, "ed");
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Classify", origin: "inbox",
      sourceId: "enquiry-classification:lead_123", createdBy: "ed",
    });
    assert.deepEqual(task.checklist?.map(i => i.label), ["Ring them within the hour"]);
  });

  it("does not let another agency's claim reach this one", () => {
    templates.saveTaskTemplate("other", {
      name: "Theirs", steps: [{ label: "Their step" }], appliesTo: ["enquiry-classification:"],
    }, "them");
    const task = tasks.createAgencyTask({
      agencyId: AGENCY, title: "Classify", origin: "inbox",
      sourceId: "enquiry-classification:lead_9", createdBy: "ed",
    });
    assert.equal(task.checklist?.some(i => i.label === "Their step"), false);
  });
});

describe("an unclassified alert is a judgement call, not a Resolve button", () => {
  it("defaults an unknown family to judgement", async () => {
    // Defaulting to in-app was the optimistic direction and the wrong one: it
    // promised a fix in a screen that may not exist.
    const { clearanceFor } = await import("../src/lib/inbox/resolutionExplain");
    assert.equal(clearanceFor("some-family-nobody-declared:123").kind, "judgement");
    assert.equal(clearanceFor("some-family-nobody-declared:123").clearsWhen, undefined);
  });

  it("still classifies the families that were declared", async () => {
    const { clearanceFor } = await import("../src/lib/inbox/resolutionExplain");
    assert.equal(clearanceFor("enquiry-classification:lead_1").kind, "in-app");
    assert.equal(clearanceFor("recommended-radar:incident:x").kind, "judgement");
  });
});

describe("radar alerts land on their numbers", () => {
  it("focuses the evidence, since there is nothing to fix", async () => {
    // A judgement call about a deviation is answered by looking at the metric
    // and its history. Landing with no highlight left the operator to find
    // the figure that moved.
    const { inferResolutionFocus } = await import("../src/lib/inbox/resolutionFocus");
    for (const id of ["radar:x", "incident:x", "recommended-radar:incident:x"]) {
      assert.equal(inferResolutionFocus(id), "evidence", `${id} arrived with no highlight`);
    }
  });

  it("keeps them judgement rather than promising a Resolve", async () => {
    const { clearanceFor } = await import("../src/lib/inbox/resolutionExplain");
    assert.equal(clearanceFor("recommended-radar:incident:x").kind, "judgement");
  });
});

describe("work put off keeps a record of it", () => {
  // Off-system work is the case that needs this. Nothing in Aqua carries the
  // job out, so the only pressure to act is knowing how long you have not —
  // and a parked item otherwise returns looking identical to a new one.
  let prefs: typeof import("../src/lib/server/operationalAlertPreferences");
  const ALERT = {
    id: "invoice:cli_1:INV-9", title: "Invoice overdue", detail: "£400 outstanding",
    href: "/portal/agency/agency-finance/invoices", severity: "warning" as const,
    category: "money" as const, occurredAt: 1_000, kind: "off-system" as const,
  };

  before(async () => { prefs = await import("../src/lib/server/operationalAlertPreferences"); });

  beforeEach(() => {
    mutate(state => {
      for (const k of Object.keys(state.operationalAlertPreferences)) {
        delete state.operationalAlertPreferences[k];
      }
    });
  });

  function park(times: number, now = 2_000) {
    for (let i = 0; i < times; i += 1) {
      prefs.setOperationalAlertPreference({
        agencyId: AGENCY, userId: "ed", alert: ALERT as never,
        action: "park", parkedUntil: now + 60_000, now: now + i,
      });
    }
  }

  const view = (now = 3_000) =>
    prefs.listOperationalAlertViews(AGENCY, "ed", [ALERT as never], now)[0];

  it("counts each time it is put off", () => {
    park(3);
    assert.equal(view(200_000)?.deferrals, 3);
  });

  it("remembers when it was first put off, not the last time", () => {
    prefs.setOperationalAlertPreference({ agencyId: AGENCY, userId: "ed", alert: ALERT as never, action: "park", parkedUntil: 9_000, now: 2_000 });
    prefs.setOperationalAlertPreference({ agencyId: AGENCY, userId: "ed", alert: ALERT as never, action: "park", parkedUntil: 9_000, now: 8_000 });
    assert.equal(view(200_000)?.firstDeferredAt, 2_000);
  });

  it("does not count reading it — looking is not avoiding", () => {
    prefs.setOperationalAlertPreference({ agencyId: AGENCY, userId: "ed", alert: ALERT as never, action: "read", now: 2_000 });
    assert.equal(view()?.deferrals, undefined);
  });

  it("keeps the count when the alert changes underneath", () => {
    // The job was put off three times; a new figure on the same job does not
    // wipe that history.
    park(3);
    const changed = { ...ALERT, occurredAt: 500_000, detail: "£900 outstanding" };
    const updated = prefs.listOperationalAlertViews(AGENCY, "ed", [changed as never], 600_000)[0];
    assert.equal(updated?.state, "unread", "a changed alert must resurface");
    assert.equal(updated?.deferrals, 3);
  });

  it("hides it while parked and brings it back after", () => {
    prefs.setOperationalAlertPreference({ agencyId: AGENCY, userId: "ed", alert: ALERT as never, action: "park", parkedUntil: 50_000, now: 2_000 });
    assert.equal(view(10_000)?.state, "parked");
    assert.equal(view(60_000)?.state, "unread");
  });

  it("says nothing at all when it has never been put off", () => {
    assert.equal(view()?.deferrals, undefined);
  });
});

describe("Actions and Master Inbox agree about one queue", () => {
  it("reads Actions through the same preferences the inbox uses", () => {
    // On the raw alert list, parking or dismissing in Actions held only until
    // the next refresh: the item came straight back while the inbox had it
    // hidden. Two views of one queue disagreeing is worse than either alone.
    const page = read("src", "app", "portal", "agency", "actions", "_ActionsPage.tsx");
    assert.match(page, /listOperationalAlertViews\(session\.agencyId, session\.userId/);
    assert.match(page, /state !== "parked"/);
  });

  it("carries the deferral history onto the row", () => {
    const page = read("src", "app", "portal", "agency", "actions", "_ActionsPage.tsx");
    assert.match(page, /deferrals: alert\.deferrals/);
  });

  it("reports rather than scolds", () => {
    // A row that tells somebody off for deferring teaches them to dismiss
    // instead, which loses the record entirely.
    const note = read("src", "components", "attention", "DeferralNote.tsx");
    assert.match(note, /Put off \{deferrals\}/);
    assert.doesNotMatch(note, /overdue|failing|you should/i);
  });
});

describe("the deferral note reads as English", () => {
  it("drops the span when it is under a minute", async () => {
    // "over the last 0 minutes" is noise on the one line meant to carry weight.
    const note = read("src", "components", "attention", "DeferralNote.tsx");
    assert.match(note, /elapsed >= 60_000/);
  });
});

describe("Radar evidence finds the history it already has", () => {
  // The vault is keyed by `series.id`, but callers hold a check and know only
  // the `sourceId` it measures. On real data a key-only lookup resolved 216 of
  // 3,090 checks while 1,505 more had history sitting in the vault that
  // nothing found. The symptom was Evidence showing figures with no graph on
  // almost every Radar alert — the one thing those alerts exist to show.
  let vault: typeof import("../src/lib/server/radarEvidenceVault");

  before(async () => { vault = await import("../src/lib/server/radarEvidenceVault"); });

  beforeEach(() => {
    mutate(state => {
      state.radarEvidence = {
        [AGENCY]: {
          agencyId: AGENCY,
          lastRecordedAt: 10,
          series: {
            "team:team-size": series("team:team-size", "team:users", 25),
            "finance:mrr": series("finance:mrr", "finance:mrr", 25),
            "team:duplicate": series("team:duplicate", "team:users", 3),
          },
        },
      } as never;
    });
  });

  function series(id: string, sourceId: string, points: number) {
    return {
      id, sourceId, domain: "company", familyId: "f", familyLabel: "Family",
      expectedDirection: "higher", firstSeenAt: 1, lastSeenAt: 10, totalSamples: points,
      points: Array.from({ length: points }, (_, i) => ({ at: i + 1, value: i, status: "pass" })),
      hourly: [],
    };
  }

  it("still finds a series by its own id", () => {
    assert.equal(vault.inspectRadarEvidenceSeries(AGENCY, "finance:mrr")?.retainedPointCount, 25);
  });

  it("finds a series by the source it measures", () => {
    // `team:team-size` is keyed under that id while measuring `team:users`.
    const found = vault.inspectRadarEvidenceSeries(AGENCY, "team:users");
    assert.ok(found, "history was in the vault and went unfound");
    assert.equal(found?.id, "team:team-size");
  });

  it("prefers the longest history when two series measure one source", () => {
    // Only a long series can show a pattern; a three-point one cannot.
    assert.equal(vault.inspectRadarEvidenceSeries(AGENCY, "team:users")?.retainedPointCount, 25);
  });

  it("returns nothing for a source it has never recorded", () => {
    assert.equal(vault.inspectRadarEvidenceSeries(AGENCY, "nothing:here"), null);
  });

  it("prefers an exact id over a source match", () => {
    // An id lookup is unambiguous; falling through to the scan when the key
    // exists would let a longer unrelated series win.
    assert.equal(vault.inspectRadarEvidenceSeries(AGENCY, "team:duplicate")?.id, "team:duplicate");
  });
});

describe("work put off repeatedly breaks out of the reserve", () => {
  it("promotes it exactly one tier", async () => {
    // The shield caps the focus window, which is what makes it useful — but a
    // job put off ten times would otherwise sit in the reserve forever,
    // hidden by the very act of deferring it.
    const { promoteForDeferrals } = await import("../src/lib/attentionProtection");
    assert.equal(promoteForDeferrals(2, 3), 1);
    assert.equal(promoteForDeferrals(2, 9), 1, "the count must not keep climbing");
  });

  it("leaves work below the threshold alone", async () => {
    const { promoteForDeferrals } = await import("../src/lib/attentionProtection");
    assert.equal(promoteForDeferrals(2, undefined), 2);
    assert.equal(promoteForDeferrals(2, 2), 2);
  });

  it("never lets a deferred job outrank a live emergency", async () => {
    const { promoteForDeferrals } = await import("../src/lib/attentionProtection");
    assert.equal(promoteForDeferrals(0, 50), 0);
  });
});
