import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLeadJourneyEligible } from "../src/lib/enquiryClassification";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE = join(
  __dirname, "..",
  "src", "app", "api", "portal", "website-enquiries", "classification", "route.ts",
);
const source = readFileSync(ROUTE, "utf-8");

// Strip comments so the assertions below test code, not prose about code.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(line => !line.trim().startsWith("//"))
  .join("\n");

describe("reclassifying an enquiry never destroys the person's history", () => {
  // Reclassifying a sales lead as a supplier used to call leads.delete() —
  // a real storage.del() — taking meeting notes, call recordings, sales
  // presentations, budget and journey events with it, irreversibly.
  //
  // The delete was also redundant: isLeadJourneyEligible already excludes any
  // website lead not classified "sales", and that filter runs on every
  // Journey surface. Stamping the classification is sufficient.

  it("does not delete the lead when routing away from sales", () => {
    assert.ok(
      !/leads\.delete\s*\(/.test(code),
      "classification must not call leads.delete() — the lead carries history that cannot be rebuilt",
    );
  });

  it("does not delete the contact when routing to sales or spam", () => {
    assert.ok(
      !/contacts\.delete\s*\(/.test(code),
      "classification must not call contacts.delete() — retained contacts preserve prior judgement",
    );
  });

  it("stamps the classification onto the retained lead so Journey excludes it", () => {
    assert.ok(
      /leads\.update\s*\(/.test(code),
      "the lead must be updated with its new classification rather than removed",
    );
    assert.ok(
      /enquiryClassification:\s*classification/.test(code),
      "the retained lead must carry the new classification for isLeadJourneyEligible",
    );
  });

  it("restores the kanban card when the lead re-enters Journey", () => {
    // Without this a lead reclassified out and back is eligible for Journey
    // but has no card, so it silently never appears on the board.
    assert.ok(
      /ensureLeadCard\s*\(/.test(code),
      "returning to sales must put the pipeline card back",
    );
  });

  it("records the decision on the canonical person", () => {
    assert.ok(/classifyPerson\s*\(/.test(code), "classification must land on the Person");
    assert.ok(/upsertPerson\s*\(/.test(code), "the enquiry must resolve to a canonical Person");
  });
});

describe("journey membership follows classification alone", () => {
  const websiteLead = {
    source: "website:aquaoasis",
    tags: ["website-enquiry"],
    customFields: { enquiryClassification: "sales" },
  };

  it("includes a website lead classified as sales", () => {
    assert.equal(isLeadJourneyEligible(websiteLead), true);
  });

  it("excludes the same lead once reclassified, without deleting it", () => {
    const reclassified = {
      ...websiteLead,
      customFields: { enquiryClassification: "supplier" },
    };
    assert.equal(isLeadJourneyEligible(reclassified), false);
  });

  it("includes it again when reclassified back to sales", () => {
    const restored = {
      ...websiteLead,
      customFields: { enquiryClassification: "sales" },
    };
    assert.equal(isLeadJourneyEligible(restored), true);
  });

  it("still includes converted leads regardless of classification", () => {
    assert.equal(isLeadJourneyEligible({
      ...websiteLead,
      customFields: { enquiryClassification: "supplier" },
      convertedClientId: "cli_1",
    }), true);
  });
});
