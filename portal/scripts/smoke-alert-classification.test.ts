import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearanceFor, resolutionKindOf } from "../src/lib/inbox/resolutionExplain";
import { withResolutionContexts } from "../src/lib/inbox/resolutionFocus";
import type { OperationalAlert } from "../src/lib/intelligence/operationalAttention";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

function alert(over: Partial<OperationalAlert> = {}): OperationalAlert {
  return {
    id: "task:t1", severity: "notice", category: "task",
    title: "t", detail: "d", href: "/portal/agency/actions", occurredAt: 1,
    ...over,
  };
}

describe("an alert is classified when it is created, not when it is drawn", () => {
  // Inferring kind from the id at render time broke the moment the same radar
  // item started arriving under three id forms. A check knows what it is.
  it("every alert leaves the stamper with a kind and a focus", () => {
    const [stamped] = withResolutionContexts([alert()]);
    assert.ok(stamped.kind, "kind must be populated");
    assert.ok(stamped.focus, "focus must be populated");
  });

  it("a check's own declaration wins over the id table", () => {
    // The id says in-app; the check says judgement. The check is right.
    const declared = alert({ id: "task:t1", kind: "judgement" });
    assert.equal(clearanceFor(declared.id).kind, "in-app");
    assert.equal(resolutionKindOf(declared).kind, "judgement");
  });

  it("keeps a declared focus instead of overwriting it", () => {
    const [stamped] = withResolutionContexts([alert({ focus: "payment" })]);
    assert.equal(stamped.focus, "payment");
  });

  it("still classifies an id the table does not recognise", () => {
    // A new check that forgets to declare must not end up unclassified — and
    // the safe direction is judgement, not in-app. Defaulting to in-app put a
    // Resolve button on work nobody had classified, promising a fix in a
    // screen that may not exist. Judgement promises only that somebody has to
    // look, which is true of anything undeclared.
    const [stamped] = withResolutionContexts([alert({ id: "brand-new:x" })]);
    assert.equal(stamped.kind, "judgement");
  });

  it("carries a declared clearance condition through", () => {
    const declared = alert({ kind: "off-system", clearsWhen: "The supplier confirms delivery." });
    assert.equal(resolutionKindOf(declared).clearsWhen, "The supplier confirms delivery.");
  });

  it("does not re-stamp an alert that already carries context", () => {
    const stamped = withResolutionContexts([alert({ href: "/x?resolve=already" })]);
    assert.equal(stamped[0].href, "/x?resolve=already");
    assert.ok(stamped[0].kind, "but it is still classified");
  });
});

describe("the classification reaches the controls", () => {
  it("Actions carries the declared kind onto the row", () => {
    const page = read("src", "app", "portal", "agency", "actions", "_ActionsPage.tsx");
    assert.match(page, /resolutionKind: alert\.kind/);
  });

  it("the row uses it rather than re-deriving from the id", () => {
    const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");
    assert.match(workspace, /kind=\{action\.resolutionKind \?\? "in-app"\}/);
    assert.doesNotMatch(workspace, /kind=\{clearanceFor\(/, "no render-time re-derivation");
  });

  it("keeps the classification separate from the badge label", () => {
    // GeneratedAction.kind is already the badge ("Needs attention"); conflating
    // the two would silently mislabel every row.
    const workspace = read("src", "app", "portal", "agency", "actions", "_ActionsWorkspace.tsx");
    assert.match(workspace, /resolutionKind\?: ResolutionKind/);
  });
});
