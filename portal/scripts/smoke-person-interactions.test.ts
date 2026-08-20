import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INTERACTION_LABELS, sortInteractions, type PersonInteraction } from "../src/lib/inbox/personInteractions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

function interaction(id: string, at: number, kind: PersonInteraction["kind"] = "enquiry"): PersonInteraction {
  return { id, kind, at, summary: id, fields: [] };
}

describe("you can see what you are being asked to classify", () => {
  // The card asked for a decision — sales, supplier, spam — while showing none
  // of the message it was asking about. That is a guess, not a decision.
  it("the card renders interactions", () => {
    const card = read("src", "app", "portal", "agency", "contacts", "[personId]", "_ContactCard.tsx");
    assert.match(card, /<Interactions interactions=\{interactions\}/);
  });

  it("expands the newest enquiry by default", () => {
    // Making somebody click to read the one thing they came for is one click
    // too many.
    const view = read("src", "app", "portal", "agency", "contacts", "[personId]", "_Interactions.tsx");
    assert.match(view, /defaultOpen=\{index === 0 && interaction\.kind === "enquiry"\}/);
  });

  it("shows every field the form captured, not a summary", () => {
    const gatherer = read("src", "lib", "server", "personInteractions.ts");
    for (const field of ["Preferred contact", "Services asked about", "Page", "Campaign"]) {
      assert.ok(gatherer.includes(field), `the form field "${field}" must be surfaced`);
    }
  });
});

describe("consent is visible without a click", () => {
  // Consent decides what you are allowed to do next; it was captured at
  // submission and never surfaced anywhere in the app.
  it("is exposed on the enquiry type", () => {
    const enquiries = read("src", "lib", "server", "websiteEnquiries.ts");
    for (const field of ["consent?:", "consentPurpose?:", "consentCapturedAt?:"]) {
      assert.ok(enquiries.includes(field), `WebsiteEnquiry must expose ${field}`);
    }
  });

  it("is selected from the database, not silently dropped", () => {
    const enquiries = read("src", "lib", "server", "websiteEnquiries.ts");
    assert.match(enquiries, /campaign, consent, created_at/, "the consent column must be selected");
  });

  it("is marked important so it is not buried among ordinary fields", () => {
    const gatherer = read("src", "lib", "server", "personInteractions.ts");
    assert.match(gatherer, /label: "Consent given"[\s\S]{0,400}important: true/);
  });

  it("shows on the collapsed row, not only when expanded", () => {
    const view = read("src", "app", "portal", "agency", "contacts", "[personId]", "_Interactions.tsx");
    assert.match(view, /Consented|No consent|Consent unknown/);
  });

  it("distinguishes 'no consent' from 'not recorded'", () => {
    // Treating an unrecorded consent as a refusal, or as permission, are both
    // wrong in different directions.
    const gatherer = read("src", "lib", "server", "personInteractions.ts");
    assert.match(gatherer, /"Not recorded"/);
  });
});

describe("interactions read newest first", () => {
  it("puts the most recent at the top", () => {
    const sorted = sortInteractions([interaction("old", 1), interaction("new", 3), interaction("mid", 2)]);
    assert.deepEqual(sorted.map(i => i.id), ["new", "mid", "old"]);
  });

  it("labels every kind it can hold", () => {
    for (const kind of ["enquiry", "reply", "call", "meeting", "note"] as const) {
      assert.ok(INTERACTION_LABELS[kind], `${kind} needs a label`);
    }
  });
});
