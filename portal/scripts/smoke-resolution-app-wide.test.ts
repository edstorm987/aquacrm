import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  RESOLUTION_PARAM,
  RESOLUTION_FOCUS_PARAM,
  resolutionProgress,
  type ResolutionPlan,
} from "../src/lib/inbox/resolutionContext";
import { inferResolutionFocus, withResolutionContexts } from "../src/lib/inbox/resolutionFocus";
import type { OperationalAlert } from "../src/lib/operationalAttention";

function alert(id: string, href: string): OperationalAlert {
  return {
    id, href, severity: "notice", category: "client",
    title: "t", detail: "d", occurredAt: 1,
  };
}

describe("every alert carries resolution context", () => {
  // Stamped centrally rather than at each of the 44 push sites — editing
  // those individually guarantees the 45th silently loses its context.
  it("stamps an alert that has none", () => {
    const [stamped] = withResolutionContexts([alert("invoice:cli_1:INV-9", "/portal/agency/agency-finance/invoices")]);
    const url = new URL(stamped.href, "https://aquacrm.local");
    assert.equal(url.searchParams.get(RESOLUTION_PARAM), "invoice:cli_1:INV-9");
    assert.equal(url.searchParams.get(RESOLUTION_FOCUS_PARAM), "payment");
  });

  it("leaves an alert that already carries bespoke context alone", () => {
    const bespoke = alert("enquiry-classification:e1", "/portal/agency/contacts/p1?resolve=custom&focus=company");
    const [stamped] = withResolutionContexts([bespoke]);
    assert.equal(stamped.href, bespoke.href, "must not double-stamp or override a deliberate focus");
  });

  it("preserves the destination's own query and hash", () => {
    const [stamped] = withResolutionContexts([alert("task:t1", "/portal/agency/actions?view=all#task-t1")]);
    assert.match(stamped.href, /^\/portal\/agency\/actions\?/);
    assert.match(stamped.href, /#task-t1$/);
    assert.match(stamped.href, /view=all/);
  });

  it("still stamps an alert whose type has no known focus", () => {
    // The bar must explain itself even where no highlight exists.
    const [stamped] = withResolutionContexts([alert("brand-new-alert-type:x", "/portal/agency")]);
    const url = new URL(stamped.href, "https://aquacrm.local");
    assert.equal(url.searchParams.get(RESOLUTION_PARAM), "brand-new-alert-type:x");
    assert.equal(url.searchParams.has(RESOLUTION_FOCUS_PARAM), false,
      "no focus is better than a ring pointing at the wrong control");
  });

  it("maps the real alert families to sensible focuses", () => {
    const cases: Array<[string, string | undefined]> = [
      ["enquiry-classification:e", "classification"],
      ["person-organisation:o", "company"],
      ["invoice:c:INV", "payment"],
      ["payment-plan:c:p:m", "payment"],
      ["finance:budget-over:pot", "budget"],
      ["contract-awaiting:c:k", "contract"],
      ["compliance-expired:d", "evidence"],
      ["external-proposal:p", "approval"],
      ["meeting:l", "meeting"],
      ["portal-access:c", "access"],
      ["task:t", "task"],
      ["unknown:z", undefined],
    ];
    for (const [id, expected] of cases) {
      assert.equal(inferResolutionFocus(id), expected, `focus for ${id}`);
    }
  });
});

describe("multi-step progress", () => {
  const plan = (done: boolean[]): ResolutionPlan => ({
    alertId: "a",
    title: "Job",
    steps: done.map((d, i) => ({ id: `s${i}`, label: `Step ${i}`, href: "/x", done: d })),
  });

  it("points at the first unfinished step", () => {
    const progress = resolutionProgress(plan([true, false, false]));
    assert.equal(progress.current?.id, "s1");
    assert.equal(progress.completed, 1);
    assert.equal(progress.total, 3);
    assert.equal(progress.allDone, false);
  });

  it("does not strand the sequence when a step is done out of order", () => {
    // Ticking step 3 first must still send you to step 1, not to nothing.
    const progress = resolutionProgress(plan([false, false, true]));
    assert.equal(progress.current?.id, "s0");
    assert.equal(progress.completed, 1);
  });

  it("reports done only when every step is", () => {
    assert.equal(resolutionProgress(plan([true, true])).allDone, true);
    assert.equal(resolutionProgress(plan([true, false])).allDone, false);
  });

  it("treats a missing plan as no checklist rather than an error", () => {
    const progress = resolutionProgress(null);
    assert.equal(progress.total, 0);
    assert.equal(progress.current, null);
    assert.equal(progress.allDone, false, "an empty plan must not read as finished");
  });
});
