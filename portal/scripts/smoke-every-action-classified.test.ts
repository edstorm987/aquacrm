import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearanceFor } from "../src/lib/inbox/resolutionExplain";
import { inferResolutionFocus } from "../src/lib/inbox/resolutionFocus";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const source = readFileSync(join(ROOT, "src", "lib", "server", "operationalAlerts.ts"), "utf-8");
const table = readFileSync(join(ROOT, "src", "lib", "inbox", "resolutionExplain.ts"), "utf-8");

/**
 * Every alert family the generator can actually emit, read out of the source
 * rather than maintained by hand — a hand-kept list is the thing that goes
 * stale and lets an unclassified action through.
 */
function emittedFamilies(): string[] {
  const ids = new Set<string>();
  for (const match of source.matchAll(/id: `([a-z:-]+)[:`$]/g)) ids.add(match[1]);
  for (const match of source.matchAll(/id: "([a-z:-]+)"/g)) ids.add(match[1]);
  return [...ids].sort();
}

const declaredPrefixes = [...table.matchAll(/\["([a-z:-]+)",\s*\{/g)].map(match => match[1]);

describe("every action the system can emit is classified", () => {
  // The guarantee Ed asked for: not that today's 44 sites are right, but that
  // a new one cannot ship unclassified. This test reads the generator itself,
  // so adding an alert family without classifying it fails here.
  const families = emittedFamilies();

  it("finds the alert families in the generator", () => {
    assert.ok(families.length >= 40, `expected the generator's families, found ${families.length}`);
  });

  it("classifies every one of them explicitly", () => {
    const uncovered = families.filter(family =>
      !declaredPrefixes.some(prefix => family.startsWith(prefix) || `${family}:`.startsWith(prefix)));
    assert.deepEqual(uncovered, [],
      `these families fall back to the generic default — classify them in resolutionExplain.ts:\n  ${uncovered.join("\n  ")}`);
  });

  it("gives every one a clearance condition", () => {
    // An action with no stated clearance reads as broken and gets dismissed.
    const missing = families.filter(family => !clearanceFor(`${family}:x`).clearsWhen);
    assert.deepEqual(missing, [],
      `these families do not say what clears them:\n  ${missing.join("\n  ")}`);
  });

  it("gives every one a focus, so the destination can point somewhere", () => {
    const missing = families.filter(family => !inferResolutionFocus(`${family}:x`));
    assert.deepEqual(missing, [],
      `these families have no focus:\n  ${missing.join("\n  ")}`);
  });
});

describe("the classification is honest about what each kind promises", () => {
  it("never marks work the operator cannot do in Aqua as in-app", () => {
    // Chasing money, waiting on a client, a third party granting access —
    // offering Resolve on these promises a control that cannot exist.
    for (const family of [
      "finance:overdue-invoices", "finance:obligations-overdue", "finance:people-payments-due",
      "client-marketing-access", "portal-access", "contact", "invoice", "payment-plan",
    ]) {
      assert.equal(clearanceFor(`${family}:x`).kind, "off-system", `${family} is not resolvable in app`);
    }
  });

  it("marks the calls that have no fix as judgement", () => {
    for (const family of ["client-marketing-no-leads", "recommended-radar:x", "incident:x"]) {
      assert.equal(clearanceFor(`${family}:x`).kind, "judgement", `${family} is a decision, not a task`);
    }
  });

  it("marks the ones with a real control as in-app", () => {
    for (const family of [
      "enquiry-classification", "person-organisation", "task", "external-proposal",
      "finance:expense-review", "compliance-action", "request",
    ]) {
      assert.equal(clearanceFor(`${family}:x`).kind, "in-app", `${family} has a control`);
    }
  });
});
