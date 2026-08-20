import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Enquiry detail card — Phase 1 ("card mirrors the real submission").
// Clicking an enquiry opens a modal that shows everything about it in two
// layers: A) the form's own fields exactly as submitted, B) Aqua's own contact
// record (consent-first). These are source-shape contracts, matching the rest
// of the inbox smoke suite; the behaviour they pin is what the card must render.

const read = (path: string) => readFileSync(path, "utf8");
const card = read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");
const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");

test("clicking an enquiry opens a detail card for the selected item", () => {
  // The inbox opens one card at section level for the selected enquiry, wiring
  // the existing handlers rather than a reduced copy of them.
  assert.match(inbox, /const openItem = items\.find/);
  assert.match(inbox, /<EnquiryDetailCard/);
  assert.match(inbox, /item=\{openItem\}/);
  assert.match(inbox, /onClose=\{\(\) => onToggle\(openItem\.id\)\}/);
  assert.match(inbox, /onStatus=\{onStatus\}/);
});

test("the card opens as an accessible modal that can be dismissed", () => {
  // Ed's decision was a modal: it must trap focus and close on Escape/backdrop.
  assert.match(card, /role="dialog"/);
  assert.match(card, /aria-modal="true"/);
  assert.match(card, /useFocusTrap\(dialogRef, true\)/);
  assert.match(card, /event\.key === "Escape"/);
  assert.match(card, /mm-modal-backdrop/);
  assert.match(card, /onClick=\{onClose\}/);
});

test("layer A mirrors the form: every submitted field, in order, nothing dropped", () => {
  // `capture.fields` is already in submission order, so mapping it in order is
  // the mirror. The answers Aqua has no column for are shown in full, not just
  // counted as they were before.
  assert.match(card, /capture\.fields\.map/);
  assert.match(card, /field\.label \|\| field\.key/);
  assert.match(card, /capture\.additional/);
  // Phase 3: with the imported schema, the submission is laid out in the real form's shape.
  assert.match(card, /mergeFormLayout/);
  assert.match(card, /beyond Aqua/);
  // And it still says so plainly when the tag never captured the submission.
  assert.match(card, /The full submission was not captured/);
});

test("layer B keeps Aqua's contact record, and consent leads it", () => {
  // Consent decides what you may do next, so it is surfaced explicitly across
  // its three states (given / declined / not recorded), never assumed.
  assert.match(card, /item\.consent === true/);
  assert.match(card, /item\.consent === false/);
  assert.match(card, /consentPurpose/);
  assert.match(card, /consentVersion/);
  assert.match(card, /consentCapturedAt/);
  assert.match(card, /Consent given/);
  assert.match(card, /Consent not recorded/);
  // The linked CRM records travel with the enquiry.
  assert.match(card, /Sales record/);
  assert.match(card, /Contact record/);
  assert.match(card, /item\.clientId/);
});

test("the card reuses the one enquiry communications composer", () => {
  assert.match(card, /import \{ EnquiryCommunications \}/);
  assert.match(card, /<EnquiryCommunications item=\{item\} readiness=\{communicationReadiness\}/);
});

test("polish: a genuinely-empty field is a muted em dash, never an invented value (Phase 5)", () => {
  // The Field helper renders — for an empty value rather than padding the blank.
  assert.match(card, /const empty = !value\.trim\(\)/);
  assert.match(card, /empty \? "—" : value/);
  // An empty campaign is not fabricated as "Direct".
  assert.doesNotMatch(card, /Direct \/ not supplied/);
  // But the deliberate, meaningful distinctions are kept, not flattened to a dash.
  assert.match(card, /This form did not ask/);
});
