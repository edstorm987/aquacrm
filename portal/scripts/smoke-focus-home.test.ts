// Where a "Working as <department>" hat lands.
//
// Ed: switching the hat "shows the same for any working as, which is weird… if i
// choose to work as executive i get a full executive mode… same for sales it
// shows the sales stuff… the department things all custom ui so the owner can
// truly lock in". Phase 1 narrowed the sidebar; this is the LANDING. Ed's choice
// was to EMBED THE FULL WORKSPACE for each hat: a hat lands you directly in that
// department's real workspace. Executive lands on its Command Centre station
// (already the full deck in place); the other five redirect to their real route.
//
// These pins hold that invariant (every hat lands on its own real workspace, so
// no hat can regress to the identical macro dashboard) AND the safety model
// (redirect only, no ?station override, reversible from the environment).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEPARTMENT_WORKSPACE_HREF,
  focusHomeHref,
  focusHomeDepartment,
  isFocusHomeEnabled,
} from "../src/lib/access/focusHome";
import { DEPARTMENT_PROFILES } from "../src/lib/access/departmentProfiles";
import { focusLandingStation } from "../src/app/portal/agency/commandStationRouting";

describe("every hat lands on its own real workspace — never the generic dashboard", () => {
  it("each department lands somewhere of its own — a workspace route or a station", () => {
    // The exact regression Ed hit: put on any hat and the landing was identical.
    // Now Executive → its station, everyone else → their real workspace route.
    for (const profile of DEPARTMENT_PROFILES) {
      const href = focusHomeHref(profile.id);
      const station = focusLandingStation(profile.id);
      assert.ok(href || station, `${profile.id} lands nowhere of its own`);
      assert.ok(!(href && station), `${profile.id} must not claim both a workspace and a station`);
    }
  });

  it("the five non-Executive departments each embed a distinct real workspace", () => {
    const expected: Record<string, string> = {
      sales: "/portal/agency/pipelines/leads",
      delivery: "/portal/agency/fulfilment",
      finance: "/portal/agency/agency-finance",
      marketing: "/portal/agency/marketing",
      support: "/portal/agency/inbox",
    };
    for (const [id, href] of Object.entries(expected)) {
      assert.equal(focusHomeHref(id), href, `${id} must land in ${href}`);
      assert.equal(focusHomeDepartment(id), id);
      assert.equal(focusLandingStation(id), null, `${id} embeds a workspace, not a Command Centre station`);
    }
    // Distinct: no two hats land on the same workspace, or they'd feel identical.
    const targets = Object.values(DEPARTMENT_WORKSPACE_HREF);
    assert.equal(new Set(targets).size, targets.length, "each department must embed a different workspace");
  });

  it("Executive lands on its station, not a redirect", () => {
    assert.equal(focusLandingStation("executive"), "executive");
    assert.equal(focusHomeHref("executive"), null, "Executive keeps its in-place deck station");
    assert.equal(focusHomeDepartment("executive"), null);
  });

  it("no hat, an unknown hat, and a path-traversal value all resolve to no landing", () => {
    assert.equal(focusHomeHref(undefined), null);
    assert.equal(focusHomeHref("not-a-department"), null);
    assert.equal(focusHomeHref("../../etc/passwd"), null);
    assert.equal(focusHomeDepartment(undefined), null);
  });

  it("every landing target is a gated portal route (presentation, not permission)", () => {
    for (const [id, href] of Object.entries(DEPARTMENT_WORKSPACE_HREF)) {
      assert.match(href!, /^\/portal\/agency\//, `${id} must land on an agency route`);
    }
  });
});

describe("the flag is on by default and reversible from the environment", () => {
  const original = process.env.PORTAL_ROLE_FOCUS_HOME;
  function withFlag(value: string | undefined, run: () => void) {
    if (value === undefined) delete process.env.PORTAL_ROLE_FOCUS_HOME;
    else process.env.PORTAL_ROLE_FOCUS_HOME = value;
    try { run(); } finally {
      if (original === undefined) delete process.env.PORTAL_ROLE_FOCUS_HOME;
      else process.env.PORTAL_ROLE_FOCUS_HOME = original;
    }
  }

  it("defaults ON when unset", () => {
    withFlag(undefined, () => assert.equal(isFocusHomeEnabled(), true));
  });

  it("turns OFF for the documented off-switches", () => {
    for (const value of ["off", "false", "0", "disabled", "OFF", "False"]) {
      withFlag(value, () => assert.equal(isFocusHomeEnabled(), false, `"${value}" should disable the swap`));
    }
  });

  it("stays ON for any affirmative value", () => {
    for (const value of ["on", "true", "1", "yes", ""]) {
      withFlag(value, () => assert.equal(isFocusHomeEnabled(), true, `"${value}" should keep the swap on`));
    }
  });
});

describe("the switcher drives the landing (a hard nav, not a fragile redirect)", () => {
  const switcher = readFileSync("src/components/chrome/DepartmentSwitcher.tsx", "utf8");
  const page = readFileSync("src/app/portal/agency/page.tsx", "utf8");

  it("hard-navigates to the hat's workspace, falling back to /portal/agency", () => {
    // The streamed agency layout flushes its shell before the page renders, so a
    // redirect() at /portal/agency would degrade to a flashing client bounce. The
    // switcher hard-navigates to the workspace instead — clean, no flash.
    assert.match(switcher, /const landing = \(focusHomeEnabled && focusHomeHref\(id\)\) \|\| "\/portal\/agency";/);
    assert.match(switcher, /window\.location\.assign\(landing\)/);
    assert.doesNotMatch(switcher, /router\.refresh\(\)/, "the soft refresh no longer moves the landing");
  });

  it("the flag reaches the switcher from the server via the top bar", () => {
    const topbar = readFileSync("src/components/chrome/Topbar.tsx", "utf8");
    assert.match(topbar, /focusHomeEnabled=\{isFocusHomeEnabled\(\)\}/);
  });

  it("page.tsx RENDERS a focused stub for a hat — never a redirect (it would flash)", () => {
    // A direct visit to /portal/agency under a hat renders the focused stub, not
    // the Command Centre and not a bounce. The landing into the real workspace is
    // the switcher's job; the page only ever renders here.
    assert.match(page, /return <FocusedStub /, "the page renders the focused stub under a hat");
    const branch = page.slice(page.indexOf("if (!resolvedSearchParams?.station && isFocusHomeEnabled())"), page.indexOf("return <FocusedStub") + 120);
    assert.doesNotMatch(branch, /redirect\(/, "the focus branch must render, never redirect");
  });
});

describe("the standalone Meetings surface reuses one derivation", () => {
  it("the route renders the shared card from the shared feed", () => {
    const route = readFileSync("src/app/portal/agency/meetings/page.tsx", "utf8");
    assert.match(route, /loadUpcomingMeetings/);
    assert.match(route, /<UpcomingMeetings/);
  });

  it("the feed derives meetings exactly as the leads pipeline does", () => {
    const feed = readFileSync("src/lib/server/agency/meetingsFeed.ts", "utf8");
    assert.match(feed, /isLeadJourneyEligible/);
    assert.match(feed, /timestampFromValue\(lead\.nextMeetingAt\)/);
    assert.match(feed, /\.sort\(\(a, b\) => a\.meetingAt - b\.meetingAt\)/);
  });

  it("the shared card can show more than the five-row dashboard preview", () => {
    const card = readFileSync("src/app/portal/agency/leads-pipeline/_UpcomingMeetings.tsx", "utf8");
    assert.match(card, /limit = 5/);
    assert.match(card, /\.slice\(0, limit\)/);
  });
});
