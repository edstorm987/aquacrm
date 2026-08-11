import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Journey exposes a one-click list and Kanban workspace", () => {
  const hub = readFileSync("src/app/portal/clients/_PeopleHub.tsx", "utf8");

  assert.match(hub, /type JourneyMode = "list" \| "kanban"/);
  assert.match(hub, /onClick=\{\(\) => setMode\("list"\)\}/);
  assert.match(hub, /onClick=\{\(\) => setMode\("kanban"\)\}/);
  assert.match(hub, /aria-label="Journey kanban board"/);
  assert.match(hub, /filteredJourneyRows/);
});

test("Journey Kanban keeps every relationship type visible and actionable", () => {
  const hub = readFileSync("src/app/portal/clients/_PeopleHub.tsx", "utf8");

  assert.match(hub, /id: "enquiry", label: "Enquiries"/);
  assert.match(hub, /id: "contact", label: "Contacts"/);
  assert.match(hub, /id: "client", label: "Clients"/);
  assert.match(hub, /id: "manual", label: "Other relationships"/);
  assert.match(hub, /JourneyKanbanCard/);
  assert.match(hub, /href=\{row\.href\}/);
  assert.match(hub, /onReview\(row\.contact!\)/);
});
