// My Radar on the topbar — the judgement of the hat, one tap from anywhere.
//
// The reading and its honesty rules are pinned in `smoke-my-radar` and
// `smoke-my-radar-panel`; this file pins the CHROME around them, because every
// property here is one that would still look right in review after being
// quietly broken: a control id slotted in the wrong place, a route that forgot
// the element gate the dashboard applies, a "reused" switcher that is actually
// a fork, a nudge that speaks only in amber.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { TOPBAR_CONTROL_IDS } from "../src/lib/chrome/topbarControls";

const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BUTTON = "src/components/chrome/MyRadarButton.tsx";
const CONTROL = "src/components/chrome/MyRadarControl.tsx";
const PANEL = "src/components/chrome/MyRadarQuickLookPanel.tsx";
const ROUTE = "src/app/api/portal/intelligence/my-radar/route.ts";

describe("the registered id", () => {
  it("sits immediately after 'department' — the hat, then the judgement of the hat", () => {
    // Registry order is bar order, and a stored pin is an id against THIS list.
    const ids = TOPBAR_CONTROL_IDS as readonly string[];
    assert.equal(ids.indexOf("my-radar"), ids.indexOf("department") + 1,
      "'my-radar' must be registered directly after 'department'");
    // And it is not the Business Radar's id, which is a different feature.
    assert.ok(ids.includes("radar"), "the Business Radar keeps its own id");
  });

  it("is mounted in the topbar behind the SAME gate as the department switcher", () => {
    const topbar = stripComments(read("src/components/chrome/Topbar.tsx"));
    const block = topbar.split("const collapsible")[1]?.split("const pinnedControls")[0] ?? "";
    const gate = /!publicShowcase && !showcaseMode && isAgencyRole\(role\)/g;
    assert.equal([...block.matchAll(gate)].length, 2,
      "department and my-radar must share one gate expression — a hat and its judgement are for the same people");
    assert.match(block, /id: "my-radar", label: "My Radar", node: <MyRadarControl key="my-radar" activeDepartment=\{activeDepartment\}/,
      "the control must receive the department read ONCE at the top of Topbar, not read its own");
  });
});

describe("the server wrapper", () => {
  const source = stripComments(read(CONTROL));

  it("applies the staff.overview gate BEFORE computing any reading", () => {
    // The required property: a staff account whose overview view was revoked
    // must never be handed meter data — not as a route response, and not as a
    // server-rendered prop that skips the route. Refused means NO control.
    assert.match(source, /requireCurrentWorkspaceElementAccess\("staff", "staff\.overview", "view"\)/);
    assert.match(source, /catch \{[\s\S]*?return null;/, "a refusal renders nothing, not a control with blank data");
    assert.ok(
      source.indexOf("await requireCurrentWorkspaceElementAccess") < source.indexOf("readMyRadar({"),
      "the gate must run before the reading exists at all",
    );
  });

  it("never writes on the render path", () => {
    // This renders on every authenticated navigation — the exact path issue #21
    // cleared of render-time writes.
    assert.doesNotMatch(source, /flushPendingWrites|setUserChromeLayout|mutate\(/);
  });
});

describe("the route", () => {
  const source = stripComments(read(ROUTE));

  it("gates agency-staff on the staff element, like dashboard-planning does", () => {
    assert.match(source, /getSessionFromRequest/);
    assert.match(source, /requireCurrentWorkspaceElementAccess\("staff", "staff\.overview", "view"\)/,
      "the reading is the staff overview's working-time data; revoking that view must close this door too");
  });

  it("is read-only, and takes its tenant from the session alone", () => {
    assert.doesNotMatch(source, /flushPendingWrites|export async function (POST|PATCH|PUT|DELETE)/);
    assert.match(source, /session\.agencyId/);
    assert.doesNotMatch(source, /searchParams|request\.json\(/, "the request carries no ids and no body");
  });

  it("filters client-named Actions through the shared client gate", () => {
    // Same actor, same helper, same rule as GET /api/portal/tasks — a task
    // naming a client you may not see stays invisible here too.
    assert.match(source, /canReadClientAssociation\(actor, "agency-task", task\.clientId\)/);
    assert.match(source, /task\.assigneeUserId === session\.userId \|\| task\.createdBy === session\.userId/,
      "own open work only");
  });
});

describe("the button", () => {
  const source = stripComments(read(BUTTON));

  it("marks its popover as a chrome surface", () => {
    // The marker the mobile overflow panel and its CSS agree on; without it the
    // popover stacks under the drawer — the exact screenshot that rule pins.
    assert.match(source, /data-chrome-surface/);
    assert.match(source, /mm-attention-badge/, "the badge class is what the drawer toggle sums");
  });

  it("badges STARVED departments only — behind is glanceable, not an alarm", () => {
    assert.match(source, /entry\.status === "starved"/);
    assert.doesNotMatch(source, /"short"|"over"/,
      "a badge that cries on every ordinary week is a badge people learn to ignore");
  });

  it("says the count in words, never colour or number alone", () => {
    assert.match(source, /"departments"\} starved`/);
    assert.match(source, /no starved departments/);
  });

  it("is not the Business Radar in disguise", () => {
    // Two identical icons on one bar is a trap; the fresh data comes from the
    // panel's own gated route, never a fetch in the always-mounted button.
    const lucideImport = /import \{([^}]*)\} from "lucide-react"/.exec(source)?.[1] ?? "";
    assert.ok(lucideImport.includes("Gauge"), "the icon is a gauge");
    assert.ok(!/\bRadar\b/.test(lucideImport), "…and never lucide's Radar, which the Business Radar wears");
    assert.doesNotMatch(source, /fetch\(/);
  });

  it("adopts a refreshed server reading only when it is newer", () => {
    // The embedded switcher's router.refresh() re-renders the server half; the
    // generatedAt guard is what turns that into "meters update after a hat
    // change" instead of a race with the panel's own fetch.
    assert.match(source, /initial\.generatedAt >= snapshot\.generatedAt/);
  });
});

describe("the panel", () => {
  const source = stripComments(read(PANEL));

  it("REUSES the department switcher — mounted, never forked", () => {
    assert.match(source, /import \{ DepartmentSwitcher \} from "@\/components\/chrome\/DepartmentSwitcher"/);
    assert.match(source, /<DepartmentSwitcher active=\{activeDepartment\}/);
    // The forks this rule exists to prevent: re-listing the profiles, or
    // POSTing the department route itself and splitting cookie from stamp.
    assert.doesNotMatch(source, /DEPARTMENT_PROFILES/);
    assert.doesNotMatch(source, /\/api\/portal\/chrome\/department/);
  });

  it("loads fresh meter data through the gated route only", () => {
    assert.match(source, /fetch\("\/api\/portal\/intelligence\/my-radar"/);
    assert.match(source, /fetch\("\/api\/portal\/dashboard-planning"/);
  });

  it("answers a 403 with a closed door, not an error over the meters", () => {
    // Access can be revoked mid-session, after the server rendered the button.
    assert.match(source, /status === 403/);
    assert.match(source, /access to the staff overview is turned off/i);
  });

  it("gives the break nudge an icon and words, never colour alone", () => {
    const nudge = source.split("workRunMs > BREAK_NUDGE_MS")[1]?.split(": active ?")[0] ?? "";
    assert.ok(nudge, "the nudge branch must exist");
    assert.match(nudge, /<Pause size=/, "the icon");
    assert.match(nudge, /min straight — take a break/, "…and the words");
    assert.match(source, /On a break ·/, "a break already running suppresses the nudge and says so");
  });

  it("reuses MyRadarPanel for the meters rather than redrawing them", () => {
    // Every honesty rule pinned in smoke-my-radar-panel is inherited by reuse;
    // a second drawing would drift from the first the day one of them changed.
    assert.match(source, /import \{ MyRadarPanel \} from "@\/components\/intelligence\/MyRadarPanel"/);
    assert.match(source, /variant="popover"/);
  });
});
