// The privacy notice must describe what the code actually does.
//
// ── The unresolved contradiction this pins ───────────────────────────────
//
// `public/aquacrm-site/privacy/index.html` says:
//
//     "Form field values are never included in telemetry."
//
// `src/lib/integrations/aquaTagSource.ts` reads `field.value` (and a select's
// option text) and sends it. Both statements are currently true, and together
// they are a factual error in a published privacy notice.
//
// ── Why a test rather than a fix ─────────────────────────────────────────
//
// Fixing it means choosing, and the choice is Ed's:
//
//   • GATE it — add `permitted("analytics")` to the capture path, matching
//     every other event. Cheapest, and costs enrichment from visitors who
//     decline.
//   • NARROW it — capture field NAMES and labels but not values. Keeps "which
//     form, how far they got", drops the contents.
//   • JUSTIFY it — keep the behaviour, state the lawful basis, and rewrite both
//     notices to describe it accurately.
//
// Silently gating it could break enquiry enrichment he relies on; silently
// rewriting the notice means asserting a lawful basis, which is a solicitor's
// call. So the behaviour is unchanged and the decision stays open — see
// `docs/development/plans/launch-order-and-blockers.md`.
//
// ── What this test is for ────────────────────────────────────────────────
//
// An open decision with nothing holding it is a decision that gets forgotten.
// This pins BOTH SIDES so they cannot drift apart any further, and so that
// resolving one without the other fails loudly:
//
//   • narrow or gate the capture → `tagSendsFieldValues` goes false → this test
//     fails and tells you the notice sentence can now be made true;
//   • edit the notice → the claim assertion fails and asks whether the
//     behaviour changed with it.
//
// It is the same treatment given to the embed-token scope in
// `smoke-route-auth-coverage`: pin the shape of an open decision so it has to
// be re-made deliberately rather than drifting.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("privacy notice vs. Aqua Tag behaviour", () => {
  it("still says form field values are never sent", () => {
    const notice = read("public/aquacrm-site/privacy/index.html");
    assert.match(
      notice,
      /Form field values are never included in telemetry\./,
      "The notice sentence changed. If the Aqua Tag was narrowed or gated to make it TRUE, update this test. "
      + "If the sentence was reworded while the behaviour stayed the same, check the new wording is accurate.",
    );
  });

  it("and the Aqua Tag still sends them, which is the contradiction", () => {
    const tag = read("src/lib/integrations/aquaTagSource.ts");

    // The value readers. If these go, the capture has been narrowed to names
    // and labels and the notice's sentence becomes true.
    assert.match(tag, /typeof field\.value === "string" \? field\.value : ""/, "the text-input value reader");
    assert.match(tag, /Array\.from\(field\.selectedOptions\)/, "the select value reader");

    // And it is NOT behind a consent gate, unlike every other event the Tag
    // sends — which is what makes "gate it" the cheapest of the three options.
    const capture = /function readFieldValue[\s\S]{0,1200}/.exec(tag);
    if (capture) {
      assert.doesNotMatch(
        capture[0],
        /permitted\(\s*["']analytics["']\s*\)/,
        "The capture path is now consent-gated. That is option 1 from the plan — "
        + "confirm the notice was updated to match, then update this test.",
      );
    }
  });

  it("names the decision, so it cannot be quietly dropped", () => {
    // The plan is where the three options and the reasoning live. If it stops
    // describing this, the open decision has lost its home.
    const plan = read("docs/development/plans/launch-order-and-blockers.md");
    assert.match(plan, /form field values are never included in telemetry/i, "the plan must still quote the sentence");
    assert.match(plan, /Gate it\.|Narrow it\.|Justify it\./, "and still lay out the three ways out");
  });
});

describe('privacy notice vs. the telemetry collector — "independently"', () => {
  // Second claim, same class as the form-field one, found in the 2026-08-28
  // production-grade audit.
  //
  // The notice says:
  //
  //     "After a choice, the server independently rejects events outside the
  //      categories you allowed."
  //
  // `eventIsConsented()` in the collector reads `body.consentAnalytics`,
  // `body.consentMarketing` and friends — **from the request body**. It checks
  // that the client's own self-declared flags cover the category it is sending.
  // That is a consistency check on the payload, not independent verification.
  //
  // The visitor's actual decision IS stored, in `website_consent_events` — and
  // that table is only ever INSERTed. Nothing in the codebase reads it back to
  // gate anything.
  //
  // ── How bad, honestly ────────────────────────────────────────────────
  //
  // Not a security hole: the collector is a public endpoint, so anyone can post
  // to it regardless, and in normal operation the flags the Tag sends ARE the
  // visitor's stored choice. It is an ACCURACY problem in a published privacy
  // notice — Art. 5(1)(a), fairness and transparency — which is why it is
  // pinned rather than quietly reworded.

  it("still claims the server checks independently", () => {
    const notice = read("public/aquacrm-site/privacy/index.html");
    assert.match(
      notice,
      /the server independently rejects events outside the categories you allowed/,
      "The claim changed. If the collector now verifies against stored consent, update this test; "
      + "if the sentence was softened instead, check the new wording matches what the code does.",
    );
  });

  it("but the collector still trusts the flags in the request body", () => {
    const collector = read("src/app/api/telemetry/collect/route.ts");

    // The gate reads consent off the payload.
    assert.match(collector, /body\.consentAnalytics === true/, "analytics consent comes from the body");
    assert.match(collector, /body\.consentMarketing === true/, "marketing consent comes from the body");

    // And the stored decision is write-only. If a SELECT appears here, the
    // server has started verifying for real and the notice's claim becomes
    // true — at which point this test should be deleted, not edited.
    const consentTableUses = [...collector.matchAll(/website_consent_events"?\)?\s*\.\s*(\w+)/g)].map(m => m[1]);
    assert.deepEqual(
      [...new Set(consentTableUses)],
      ["insert"],
      "website_consent_events is no longer insert-only — if it is now read to gate events, the notice is finally accurate.",
    );
  });
});
