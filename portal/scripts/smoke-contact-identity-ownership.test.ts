import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

describe("mounted Contact identity ownership boundary", () => {
  const route = read("src", "app", "api", "portal", "persons", "[personId]", "route.ts");
  const card = read("src", "app", "portal", "agency", "contacts", "[personId]", "_ContactCard.tsx");

  it("returns the same owner-aware conflict contract for Add and Edit", () => {
    assert.match(route, /case "add-email"[\s\S]*identityWriteErrorResponse\(error\)/);
    assert.match(route, /case "add-phone"[\s\S]*identityWriteErrorResponse\(error\)/);
    assert.match(route, /conflictingPersonId: isConflict \? error\.conflictingPersonId/);
    assert.match(route, /status: isConflict \? 409 : 400/);
  });

  it("keeps a rejected draft and links to the card that owns the value", () => {
    assert.match(card, /Promise<boolean>/);
    assert.match(card, /if \(saved\) setNewEmail\(""\)/);
    assert.match(card, /if \(saved\) setNewPhone\(""\)/);
    assert.match(card, /Open existing contact/);
    assert.match(card, /encodeURIComponent\(conflictingPersonId\)/);
  });

  it("labels switchboards as shared contact details", () => {
    assert.match(card, /entry\.shared/);
    assert.match(card, /shared line/);
  });
});
