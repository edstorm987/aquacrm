import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { personCardHref, personDestination } from "../src/lib/personDestination";
import type { Person } from "../src/server/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const person = (facets: Person["facets"] = {}) => ({ id: "per_1", facets });

describe("clicking a person opens what they are now", () => {
  // contact / enquiry → card, lead → lead card, client → client workspace.
  it("opens the contact card for an enquiry or contact", () => {
    assert.equal(personDestination(person(), "enquiry"), "/portal/agency/contacts/per_1");
    assert.equal(personDestination(person(), "contact"), "/portal/agency/contacts/per_1");
  });

  it("opens the lead card for a lead", () => {
    assert.equal(
      personDestination(person({ leadId: "lead_9" }), "lead"),
      "/portal/agency/pipelines/leads?lead=lead_9",
    );
  });

  it("opens the client workspace for a client", () => {
    assert.equal(
      personDestination(person({ clientIds: ["cli_9"] }), "client"),
      "/portal/clients/cli_9",
    );
  });

  it("falls back to the card rather than producing a dead link", () => {
    // State says client but no workspace id survived — the card is at least
    // somewhere real.
    assert.equal(personDestination(person(), "client"), "/portal/agency/contacts/per_1");
    assert.equal(personDestination(person(), "lead"), "/portal/agency/contacts/per_1");
  });

  it("still exposes the card directly, for classifying", () => {
    // Resolution links must reach the card whatever the person has become.
    assert.equal(personCardHref("per_1"), "/portal/agency/contacts/per_1");
  });

  it("the index resolves the destination server-side, in one place", () => {
    // A list that hard-codes the card keeps sending you there long after
    // somebody became a client.
    const page = read("src", "app", "portal", "agency", "contacts", "page.tsx");
    assert.match(page, /personDestination\(person, derivePersonState\(person\)\)/);
  });
});

describe("converting from the card", () => {
  const route = read("src", "app", "api", "portal", "persons", "[personId]", "route.ts");
  const card = read("src", "app", "portal", "agency", "contacts", "[personId]", "_ContactCard.tsx");

  it("refuses a second workspace for the same person", () => {
    assert.match(route, /already has a client workspace/);
    assert.match(route, /status: 409/);
  });

  it("carries the history across on conversion", () => {
    assert.match(route, /seedClientFromPerson/);
  });

  it("records them as an existing client, so the card state follows", () => {
    assert.match(route, /classification: "existing-client"/);
  });

  it("is not offered on an unclassified enquiry", () => {
    // Otherwise you create a client for somebody who turns out to be a
    // supplier.
    assert.match(card, /person\.classification !== "unclassified"/);
  });

  it("is not offered to someone who already is a client", () => {
    assert.match(card, /state !== "client"/);
  });
});

describe("changing the primary contact detail is one click", () => {
  it("does not require entering edit mode", () => {
    const card = read("src", "app", "portal", "agency", "contacts", "[personId]", "_ContactCard.tsx");
    assert.match(card, /Make primary/);
    assert.match(card, /onSave\(\{ isPrimary: true \}\)/);
  });
});
