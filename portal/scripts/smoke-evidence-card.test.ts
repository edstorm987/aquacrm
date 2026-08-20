import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf-8");

const card = read("src", "components", "attention", "EvidenceCard.tsx");
const builders = read("src", "lib", "server", "resolutionPlans.ts");
const controls = read("src", "components", "attention", "AttentionControls.tsx");

describe("the records come to the alert", () => {
  // Sending somebody to a list to "see the evidence" costs them their place in
  // the queue and makes them reconstruct why the alert fired.
  it("expands in place rather than navigating", () => {
    assert.match(controls, /onToggleEvidence/, "Evidence must be able to expand, not only link");
    assert.match(controls, /evidenceOpen/, "the control must reflect open state");
  });

  it("loads on expand, not with the queue", () => {
    // Pulling records for every row of a 30-item list costs far more than it
    // saves when most rows are never opened.
    assert.match(card, /useEffect/, "records are fetched when the card mounts");
    assert.doesNotMatch(card, /generatedActions/, "the queue must not prefetch every row's records");
  });

  it("says so plainly when a family has no inline records", () => {
    // An empty panel reads as "nothing is wrong", the opposite of an alert.
    assert.match(card, /No inline records for this one yet/);
  });

  it("distinguishes unreadable records from healthy ones", () => {
    assert.match(card, /unavailable/, "a deleted or unreadable record must not look like all-clear");
    assert.match(builders, /unavailable:/, "the builder must be able to report unavailability");
  });

  it("marks the figure that actually breached", () => {
    assert.match(card, /field\.emphasis/, "the breaching value must stand out from the rest");
  });
});

describe("evidence builders cover the alert families that have records", () => {
  it("builds evidence for the families it claims", () => {
    for (const prefix of [
      "enquiry-classification:", "person-organisation:", "task:",
      "payment-plan:", "contract-awaiting:",
    ]) {
      assert.ok(
        builders.includes(`alertId.startsWith("${prefix}")`),
        `resolutionEvidenceFor must handle ${prefix}`,
      );
    }
  });

  it("returns null for a family with no builder rather than an empty shell", () => {
    // The UI falls back to the link, which is honest; a hollow panel is not.
    assert.match(builders, /return null;\s*\n\}/, "unknown families fall through to null");
  });
});
