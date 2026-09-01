import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildStaffNavigationPanels,
  type StaffNavigationAccess,
  type StaffNavigationStation,
} from "../src/app/portal/team/staffNavigation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const STATIONS: StaffNavigationStation[] = [
  { id: "my-day", label: "My Day", href: "/portal/team" },
  { id: "actions", label: "Assigned work", href: "/portal/team/actions" },
  { id: "calendar", label: "Schedule", href: "/portal/team/calendar" },
  { id: "onboarding", label: "Onboarding", href: "/portal/team/onboarding" },
  { id: "leave", label: "Time off", href: "/portal/team/leave" },
  { id: "training", label: "Training", href: "/portal/team/training" },
  { id: "pay", label: "Pay & commission", href: "/portal/team/pay" },
  { id: "notes", label: "Work notes", href: "/portal/team/notes" },
  { id: "progression", label: "My growth & company", href: "/portal/team/progression" },
  { id: "chat", label: "Team chat", href: "/portal/team/chat" },
];

const ACCESS: StaffNavigationAccess[] = STATIONS.map((station, order) => ({
  stationId: station.id,
  mode: station.id === "pay" ? "view" : "edit",
  order,
}));

describe("staff workspace navigation surfaces", () => {
  it("groups every authorised station exactly once without changing routes or view-only badges", () => {
    const panels = buildStaffNavigationPanels(STATIONS, ACCESS);

    assert.deepEqual(panels.map(panel => panel.label), [
      "Command",
      "Inbox & actions",
      "Operations",
      "Tools",
    ]);
    assert.deepEqual(panels.map(panel => panel.items.map(item => item.id)), [
      ["my-day"],
      ["actions", "chat"],
      ["calendar", "onboarding", "leave", "training", "pay"],
      ["notes", "progression"],
    ]);

    const items = panels.flatMap(panel => panel.items);
    assert.equal(items.length, ACCESS.length);
    assert.equal(new Set(items.map(item => item.id)).size, ACCESS.length);
    const hrefById = new Map(items.map(item => [item.id, item.href]));
    for (const station of STATIONS) {
      assert.equal(hrefById.get(station.id), station.href, `${station.id} changed destination during regrouping`);
    }
    assert.equal(items.find(item => item.id === "pay")?.badge, "View");
    assert.ok(items.filter(item => item.id !== "pay").every(item => item.badge === undefined));
  });

  it("renders only authorised stations, preserves their configured order, and retains future stations", () => {
    const stations = [
      ...STATIONS,
      { id: "future-station", label: "Future station", href: "/portal/team/future-station" },
    ];
    const panels = buildStaffNavigationPanels(stations, [
      { stationId: "chat", mode: "edit", order: 40 },
      { stationId: "actions", mode: "view", order: 5 },
      { stationId: "future-station", mode: "edit", order: 1 },
    ]);

    assert.deepEqual(panels.map(panel => panel.label), ["Inbox & actions", "Tools"]);
    assert.deepEqual(panels[0]!.items.map(item => item.id), ["actions", "chat"]);
    assert.equal(panels[0]!.items[0]!.badge, "View");
    assert.deepEqual(panels[1]!.items.map(item => item.id), ["future-station"]);
  });

  it("uses the canonical access projection in the server layout", () => {
    const layout = readFileSync(join(ROOT, "src/app/portal/team/layout.tsx"), "utf8");
    assert.match(layout, /resolveActorWorkspaceElementAccess\(actor, "staff"\)/);
    assert.match(layout, /staffStationAccessEntries\(actor, staffAccess\)/);
    assert.match(layout, /buildStaffNavigationPanels\(PEOPLE_STATIONS, access\)/);
    assert.doesNotMatch(layout, /\.workspaceAccess/);
  });
});
