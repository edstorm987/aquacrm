// The Command Centre "More views" menu.
//
// Part of the simplification: Key numbers, Projections, Advisor, Actions and Calendar used to
// be reachable only through scattered buttons or a URL. They now live in one
// visible menu directly under the four primary stations, so the whole Command
// Centre is findable from one place. Static-source contracts, matching the rest
// of the dashboard suite.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dashboard = readFileSync("src/app/portal/agency/_DashboardCommandCenter.tsx", "utf8");

test("the More-views menu sits under the primary stations and exposes the buried doors", () => {
  // Rendered right after the primary station nav.
  assert.match(dashboard, /onSelect=\{selectCommandStation\}\s*\/>\s*<CommandMoreNav/, "More views renders immediately after CommandStationNav");
  assert.match(dashboard, /<nav aria-label="More views" data-testid="command-more-nav"/, "it is one labelled menu");
  // Projections was buried as one tab of ~a dozen inside Plan & targets; it now
  // has its own first-class door alongside the other surfaced destinations.
  for (const door of ["Key numbers", "Projections", "Advisor", "Actions", "Calendar"]) {
    assert.match(dashboard, new RegExp(`label="${door}"`), `${door} is a visible entry`);
  }
});

test("each entry drives the existing station/mode handler, not a bare URL", () => {
  assert.match(dashboard, /onOpenKeyNumbers=\{openIntelligenceOverview\}/);
  // Projections deep-links to the battle station's projections section (its
  // forecast/target-setting surface) rather than the war-room front door.
  assert.match(dashboard, /onOpenProjections=\{\(\) => navigateServerStation\("battle", \{ battleSection: "projections" \}\)\}/);
  assert.match(dashboard, /onOpenAdvisor=\{\(\) => selectWorkspaceMode\("advisor"\)\}/);
  assert.match(dashboard, /onOpenActions=\{\(\) => selectWorkspaceMode\("actions"\)\}/);
  assert.match(dashboard, /onOpenCalendar=\{\(\) => selectWorkspaceMode\("calendar"\)\}/);
});

test("the menu reflects the active destination and gates the personal surfaces", () => {
  assert.match(dashboard, /keyNumbersActive=\{activeStation === "intelligence"\}/);
  assert.match(dashboard, /projectionsActive=\{activeStation === "battle" && requestedBattleSection === "projections"\}/);
  assert.match(dashboard, /advisorActive=\{dashboardMode === "advisor"\}/);
  assert.match(dashboard, /actionsActive=\{dashboardMode === "actions"\}/);
  assert.match(dashboard, /calendarActive=\{dashboardMode === "calendar"\}/);
  // Actions and Calendar are the owner's personal surfaces; hidden when the viewer cannot use them.
  assert.match(dashboard, /showPersonal=\{canUsePersonalCommand\}/);
  assert.match(dashboard, /\{showPersonal \? <CommandMoreButton icon=\{<ClipboardCheck/);
});

test("each entry is an accessible pressable button with a touch-sized target", () => {
  assert.match(dashboard, /function CommandMoreButton\(/);
  assert.match(dashboard, /aria-pressed=\{active\}/);
  assert.match(dashboard, /min-h-\[52px\]/, "44px+ touch target");
});
