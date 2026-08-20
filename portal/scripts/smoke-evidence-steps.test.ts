import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stepsFor } from "../src/lib/inbox/evidenceSteps";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");
const source = read("src", "lib", "server", "operationalAlerts.ts");

function emittedFamilies(): string[] {
  const ids = new Set<string>();
  for (const m of source.matchAll(/id: `([a-z:-]+)[:`$]/g)) ids.add(m[1]);
  for (const m of source.matchAll(/id: "([a-z:-]+)"/g)) ids.add(m[1]);
  return [...ids].sort();
}

describe("every action says what to actually do", () => {
  // "Clears when the invoice is paid" is a condition, not an instruction. The
  // operator's first question is "what do I do", and half the families were
  // answering it with a restatement of the problem.
  const families = emittedFamilies();

  it("gives every family at least one concrete step", () => {
    const bare = families.filter(family => stepsFor(`${family}:x`).length === 0);
    assert.deepEqual(bare, [], `these families have no steps:\n  ${bare.join("\n  ")}`);
  });

  it("writes steps as instructions, not descriptions", () => {
    // A step starting "The invoice is…" is a restatement; it must start with a
    // verb the operator can carry out.
    const descriptive: string[] = [];
    for (const family of families) {
      for (const step of stepsFor(`${family}:x`)) {
        if (/^(The|This|A |An |It )/.test(step.label)) descriptive.push(`${family}: ${step.label}`);
      }
    }
    assert.deepEqual(descriptive, [],
      `these read as descriptions rather than instructions:\n  ${descriptive.join("\n  ")}`);
  });

  it("names the person and how to reach them when it knows", () => {
    const steps = stepsFor("contact:cli_1", { who: "Cedar Dental", contact: "0161 496 0000" });
    assert.match(steps[0].label, /Cedar Dental/);
    assert.match(steps[0].label, /0161 496 0000/,
      "the number must be in the instruction, not three fields away from it");
  });

  it("degrades to something sensible without those specifics", () => {
    const steps = stepsFor("contact:cli_1");
    assert.match(steps[0].label, /the client/);
    assert.doesNotMatch(steps[0].label, /undefined/);
  });

  it("tells you dismissing is a valid answer for a judgement call", () => {
    // Otherwise a radar alert with no fix just sits there being ignored.
    const steps = stepsFor("recommended-radar:x");
    assert.ok(steps.some(step => /dismiss/i.test(step.label)));
  });

  it("never leaves an unrecognised family without guidance", () => {
    const steps = stepsFor("something-nobody-has-written-yet:1");
    assert.ok(steps.length >= 1);
    assert.doesNotMatch(steps[0].label, /undefined/);
  });
});

describe("steps are shown before the data", () => {
  it("renders them above the records", () => {
    const card = read("src", "components", "attention", "EvidenceCard.tsx");
    const stepsAt = card.indexOf('data-testid="evidence-steps"');
    const recordsAt = card.indexOf("evidence.records.map");
    assert.ok(stepsAt > 0 && stepsAt < recordsAt,
      "the instruction should come before the numbers that justify it");
  });
});

describe("no bespoke builder forgets its steps", () => {
  // The generic builder always sets them, so a family with its OWN builder is
  // the only way to end up with evidence and no guidance — which is exactly
  // how "Open action: test" ended up with numbers and no instruction.
  it("every evidence builder returns steps", () => {
    const builders = read("src", "lib", "server", "resolutionPlans.ts");
    const names = [
      "enquiryEvidence", "organisationEvidence", "taskEvidence",
      "paymentEvidence", "contractEvidence", "radarEvidenceFor",
      "genericEvidenceFor",
    ];
    const missing = names.filter(name => {
      const start = builders.search(new RegExp(`(async )?function ${name}\\\\b`));
      if (start < 0) return false;
      // Read to the next top-level function declaration.
      const rest = builders.slice(start + 1);
      const end = rest.search(/\n(async )?function |\nexport (async )?function /);
      const body = end < 0 ? rest : rest.slice(0, end);
      return !/steps:/.test(body);
    });
    assert.deepEqual(missing, [],
      `these builders return evidence with no instruction:\n  ${missing.join("\n  ")}`);
  });
});
