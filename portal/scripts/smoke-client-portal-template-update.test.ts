// The Update button: what changes, what conflicts, and legacy staying put.
//
// Ed's rule for the template system: "update button with changes and possible
// conflicts — in other words, in future as I update my services I can have
// legacy clients etc on older versions for whatever reason."
//
// Two halves, and the second is the one that matters:
//   • an update must be OFFERED with its consequences visible, never applied
//     silently — the existing `resetClientPortalFromTemplate` overwrites an
//     instance wholesale and is exactly what this replaces at the UI;
//   • a client sitting on an old version is a SUPPORTED STATE. Nothing here may
//     treat it as drift, and the planner mutates nothing at all.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type UpdateModule = typeof import("../src/server/clientPortalTemplateUpdate");
type Types = typeof import("../src/server/types");
type Design = import("../src/server/types").ClientPortalDesignDocument;
type TemplateRecord = import("../src/server/types").ClientPortalTemplateRecord;
type InstanceRecord = import("../src/server/types").ClientPortalInstanceRecord;

let updates: UpdateModule;

before(async () => {
  updates = await import("../src/server/clientPortalTemplateUpdate");
  void (null as unknown as Types);
});

/** A minimal but REAL design document shape. */
function design(overrides: Partial<Design> = {}): Design {
  return {
    schemaVersion: 1,
    theme: {
      accentColor: "#0aa",
      backgroundColor: "#fff",
      surfaceColor: "#f6f6f6",
      darkColor: "#111",
      heroColor: "#0aa",
    },
    chrome: {
      serviceLabel: "Your project",
      preparedForLabel: "Prepared for",
      currentStageLabel: "Current stage",
      privateHomeLabel: "Private home",
    },
    stages: {} as Design["stages"],
    pages: {} as Design["pages"],
    home: {
      welcomeBody: "Welcome.",
      nextMoveEyebrow: "Next",
      recentUpdatesEyebrow: "Updates",
      projectLogTitle: "Project log",
      careEyebrow: "Care",
      careTitle: "Looking after you",
      careBody: "We are here.",
      careButtonLabel: "Get help",
    },
    ...overrides,
  };
}

function template(input: {
  base: Design;
  published: Design;
  baseVersionId?: string;
  publishedVersionId?: string;
  keepHistory?: boolean;
}): TemplateRecord {
  const baseVersionId = input.baseVersionId ?? "v1";
  const publishedVersionId = input.publishedVersionId ?? "v2";
  const now = 1;
  return {
    id: "tmpl_website",
    agencyId: "agency",
    name: "Website · Portal template",
    slug: "website-portal",
    draft: input.published,
    published: input.published,
    publishedVersionId,
    versions: [
      { id: publishedVersionId, source: "publish", document: input.published, createdBy: "ed", createdAt: now },
      ...(input.keepHistory === false ? [] : [
        { id: baseVersionId, source: "publish" as const, document: input.base, createdBy: "ed", createdAt: now },
      ]),
    ],
    createdBy: "ed",
    updatedBy: "ed",
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  };
}

function instance(published: Design, templateVersionId = "v1"): InstanceRecord {
  return {
    id: "inst_bright",
    agencyId: "agency",
    clientId: "cli_bright",
    templateId: "tmpl_website",
    templateVersionId,
    draft: published,
    published,
    publishedVersionId: "iv1",
    versions: [],
    createdBy: "ed",
    updatedBy: "ed",
    createdAt: 1,
    updatedAt: 1,
    publishedAt: 1,
  };
}

describe("what the Update button would do", () => {
  it("reports a template change the client never touched as CLEAN", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(base),
    });

    assert.equal(plan.upToDate, false);
    assert.equal(plan.baseKnown, true);
    assert.deepEqual(plan.changes.map(change => change.path), ["chrome.serviceLabel"]);
    assert.equal(plan.clean.length, 1);
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.clean[0]?.current, "Your project");
    assert.equal(plan.clean[0]?.incoming, "Your website");
  });

  it("reports a change the client ALSO edited as a CONFLICT, not a silent overwrite", () => {
    const base = design();
    const moved = design({ theme: { ...base.theme, accentColor: "#111111" } });
    // The client picked their own brand colour after being seeded.
    const clientEdited = design({ theme: { ...base.theme, accentColor: "#ff6600" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(clientEdited),
    });

    assert.equal(plan.conflicts.length, 1, "their colour must not be quietly replaced");
    const conflict = plan.conflicts[0];
    assert.equal(conflict?.path, "theme.accentColor");
    assert.equal(conflict?.base, "#0aa", "what they were seeded with");
    assert.equal(conflict?.current, "#ff6600", "what they chose");
    assert.equal(conflict?.incoming, "#111111", "what the template now says");
    assert.equal(plan.clean.length, 0);
  });

  it("says nothing to do when the client already matches the new value", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      // They already made the same change themselves.
      instance: instance(moved),
    });

    assert.equal(plan.changes.length, 1);
    assert.equal(plan.changes[0]?.status, "already-matches");
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.clean.length, 0);
  });

  it("separates clean from conflicting in one plan", () => {
    const base = design();
    const moved = design({
      chrome: { ...base.chrome, serviceLabel: "Your website" },
      theme: { ...base.theme, accentColor: "#111111" },
    });
    const clientEdited = design({ theme: { ...base.theme, accentColor: "#ff6600" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(clientEdited),
    });

    assert.deepEqual(plan.clean.map(c => c.path), ["chrome.serviceLabel"]);
    assert.deepEqual(plan.conflicts.map(c => c.path), ["theme.accentColor"]);
    assert.match(
      updates.describeTemplateUpdate(plan),
      /2 changes available · 1 would overwrite this client's own edits\./,
    );
  });
});

describe("legacy clients are a supported state", () => {
  it("offers nothing and says nothing pejorative when already current", () => {
    const current = design();
    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base: current, published: current, baseVersionId: "v2" }),
      instance: instance(current, "v2"),
    });

    assert.equal(plan.upToDate, true);
    assert.deepEqual(plan.changes, []);
    assert.equal(updates.describeTemplateUpdate(plan), "On the current version.");
  });

  it("NEVER mutates either record — the plan is a description, not an action", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });
    const tmpl = template({ base, published: moved });
    const inst = instance(base);
    const templateBefore = JSON.stringify(tmpl);
    const instanceBefore = JSON.stringify(inst);

    updates.planClientPortalTemplateUpdate({ template: tmpl, instance: inst });

    assert.equal(JSON.stringify(tmpl), templateBefore, "the template is untouched");
    assert.equal(JSON.stringify(inst), instanceBefore, "and so is the client's live portal");
  });

  it("stays honest when the seeded version has fallen out of history", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });

    const plan = updates.planClientPortalTemplateUpdate({
      // The version this client was pinned to is no longer retained.
      template: template({ base, published: moved, keepHistory: false }),
      instance: instance(base),
    });

    assert.equal(plan.baseKnown, false);
    assert.equal(plan.clean.length, 0, "without a base we cannot claim anything is safe");
    assert.equal(plan.conflicts.length, plan.changes.length, "every difference needs a person");
    assert.match(updates.describeTemplateUpdate(plan), /no longer in history, so each one needs a decision/);
  });
});

describe("the diff is readable rather than exhaustive", () => {
  it("treats a whole array as one decision, not one per element", () => {
    const base = design({ home: { ...design().home, welcomeBody: "Welcome." } });
    const withBlocks = design({
      builder: { pages: [{ id: "a" }, { id: "b" }] } as never,
    });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: withBlocks }),
      instance: instance(base),
    });

    assert.deepEqual(plan.changes.map(c => c.path), ["builder"],
      "a reordered block list is one decision for a person, not twenty");
  });
});

describe("applying the decisions", () => {
  it("takes an accepted change and leaves a declined conflict alone", () => {
    const base = design();
    const moved = design({
      chrome: { ...base.chrome, serviceLabel: "Your website" },
      theme: { ...base.theme, accentColor: "#111111" },
    });
    // The client chose their own accent after seeding.
    const clientEdited = design({ theme: { ...base.theme, accentColor: "#ff6600" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(clientEdited),
    });
    // Take the safe copy change; keep our own colour.
    const result = updates.applyClientPortalTemplateUpdate({
      plan,
      current: clientEdited,
      accept: ["chrome.serviceLabel"],
    });

    assert.equal(result.document.chrome.serviceLabel, "Your website", "the accepted change landed");
    assert.equal(result.document.theme.accentColor, "#ff6600", "the client's own colour survived");
    assert.deepEqual(result.accepted.map(c => c.path), ["chrome.serviceLabel"]);
    assert.deepEqual(result.declined.map(c => c.path), ["theme.accentColor"]);
    assert.equal(result.fullyApplied, false);
    assert.equal(result.advanceVersionPin, true, "a partial merge is still a resolution");
  });

  it("accepting everything reports fullyApplied so the caller can advance the pin", () => {
    const base = design();
    const moved = design({
      chrome: { ...base.chrome, serviceLabel: "Your website" },
      theme: { ...base.theme, accentColor: "#111111" },
    });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(base),
    });
    const result = updates.applyClientPortalTemplateUpdate({
      plan,
      current: base,
      accept: plan.changes.map(change => change.path),
    });

    assert.equal(result.fullyApplied, true);
    assert.equal(result.advanceVersionPin, true);
    assert.equal(result.document.chrome.serviceLabel, "Your website");
    assert.equal(result.document.theme.accentColor, "#111111");
  });

  it("accepting NOTHING changes nothing and leaves the client legacy on purpose", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(base),
    });
    const result = updates.applyClientPortalTemplateUpdate({ plan, current: base, accept: [] });

    assert.deepEqual(result.document, base, "the portal is untouched");
    assert.equal(result.fullyApplied, false);
    assert.equal(
      result.advanceVersionPin,
      false,
      "declining everything must not silently mark them as caught up",
    );
    assert.equal(result.declined.length, 1, "and the offer still stands next time");
  });

  it("does not mutate the document it was given", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });
    const current = design();
    const before = JSON.stringify(current);

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(current),
    });
    updates.applyClientPortalTemplateUpdate({
      plan,
      current,
      accept: ["chrome.serviceLabel"],
    });

    assert.equal(JSON.stringify(current), before, "the live document is never edited in place");
  });

  it("ignores a path that was not on offer — the caller cannot smuggle an edit through", () => {
    const base = design();
    const moved = design({ chrome: { ...base.chrome, serviceLabel: "Your website" } });

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(base),
    });
    const result = updates.applyClientPortalTemplateUpdate({
      plan,
      current: base,
      accept: ["chrome.serviceLabel", "theme.accentColor", "home.welcomeBody"],
    });

    assert.deepEqual(result.accepted.map(c => c.path), ["chrome.serviceLabel"]);
    assert.equal(result.document.theme.accentColor, base.theme.accentColor, "untouched");
    assert.equal(result.document.home.welcomeBody, base.home.welcomeBody, "untouched");
  });

  it("removes a field the template dropped, when that removal is accepted", () => {
    const base = design({ customCode: { enabled: true } as never });
    const moved = design();

    const plan = updates.planClientPortalTemplateUpdate({
      template: template({ base, published: moved }),
      instance: instance(base),
    });
    assert.deepEqual(plan.changes.map(c => c.path), ["customCode"]);

    const result = updates.applyClientPortalTemplateUpdate({
      plan,
      current: base,
      accept: ["customCode"],
    });
    assert.ok(!("customCode" in result.document), "the dropped field is gone, not left as undefined");
  });
});
