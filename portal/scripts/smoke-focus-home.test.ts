// The focused landing a department hat lands on.
//
// Ed: switching the hat "shows the same for any working as, which is weird… if i
// choose to work as executive i get a full executive mode… same for sales it
// shows the sales stuff". Phase 1 narrowed the sidebar; this is the landing.
// Executive lands on its Command Centre station; every OTHER department lands on
// its own focus home. These pins hold that invariant — no hat lands on the
// generic macro dashboard — AND the safety model (presentation only, never a
// redirect, reversible from the environment).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FOCUS_HOME_CONFIG,
  focusHomeConfig,
  focusHomeDepartment,
  isFocusHomeEnabled,
} from "../src/lib/access/focusHome";
import { DEPARTMENT_PROFILES } from "../src/lib/access/departmentProfiles";
import { focusLandingStation } from "../src/app/portal/agency/commandStationRouting";

describe("every hat lands somewhere distinct — never the generic dashboard", () => {
  it("each department has EITHER a landing station or a focus home", () => {
    // The exact regression Ed hit: put on any hat and the landing was identical.
    // Now Executive → a station, everyone else → a focus home; nobody falls
    // through to the shared macro Command Centre.
    for (const profile of DEPARTMENT_PROFILES) {
      const station = focusLandingStation(profile.id);
      const home = focusHomeConfig(profile.id);
      assert.ok(station || home, `${profile.id} lands nowhere of its own`);
      assert.ok(!(station && home), `${profile.id} must not claim both a station and a focus home`);
    }
  });

  it("Executive lands on its station, not a focus home", () => {
    assert.equal(focusLandingStation("executive"), "executive");
    assert.equal(focusHomeConfig("executive"), null, "Executive keeps its dedicated workspace station");
    assert.equal(focusHomeDepartment("executive"), null);
  });

  it("the five non-Executive departments each have a focus home and no station", () => {
    for (const id of ["sales", "delivery", "finance", "marketing", "support"] as const) {
      assert.ok(focusHomeConfig(id), `${id} must have a focus home`);
      assert.equal(focusLandingStation(id), null, `${id} has no Command Centre station`);
      assert.equal(focusHomeDepartment(id), id);
    }
  });

  it("no hat, an unknown hat, and a path-traversal value all resolve to no focus home", () => {
    assert.equal(focusHomeConfig(undefined), null);
    assert.equal(focusHomeConfig("not-a-department"), null);
    assert.equal(focusHomeConfig("../../etc/passwd"), null);
    assert.equal(focusHomeDepartment(undefined), null);
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

describe("a focus home is presentation, never permission", () => {
  it("every stat and destination points at a gated portal surface", () => {
    for (const [id, config] of Object.entries(FOCUS_HOME_CONFIG)) {
      assert.ok(config, `${id} has no config`);
      assert.ok(config!.destinations.length > 0, `${id} must offer somewhere to go`);
      for (const destination of config!.destinations) {
        assert.match(destination.href, /^\/portal\//, `${id} destination "${destination.label}" must be a portal path`);
      }
      for (const stat of config!.stats) {
        if (stat.href) assert.match(stat.href, /^\/portal\//, `${id} stat "${stat.label}" must link to a portal path`);
      }
    }
  });

  it("Sales carries the meetings feed, a Meetings surface and a scouting-only link", () => {
    const sales = focusHomeConfig("sales")!;
    assert.equal(sales.showMeetingsFeed, true, "Sales shows the booked-meetings feed");
    assert.ok(sales.destinations.some(d => d.href === "/portal/agency/meetings"), "a link to the standalone Meetings surface");
    assert.ok(sales.destinations.some(d => d.href.includes("#scouting")), "a scouting-only link (Ed: 'a link for scouting only')");
  });
});

describe("the landing swap is an initial default, wired at the one page", () => {
  const page = readFileSync("src/app/portal/agency/page.tsx", "utf8");

  it("replaces the Command Centre only with no ?station and only when enabled", () => {
    assert.match(page, /const focusHome = !resolvedSearchParams\?\.station && isFocusHomeEnabled\(\)/);
    assert.match(page, /focusHomeConfig\(activeDepartmentId\)/);
    assert.match(page, /if \(focusHome\) \{[\s\S]*?return renderFocusHome\(/, "the focus home returns in place of the dashboard");
  });

  it("never redirects for the focus home — it returns a render, so nav is never trapped", () => {
    // A redirect from /portal/agency would bounce every 'Command Centre' click
    // straight back, trapping the operator in the hat. The focus home must be a
    // returned render, reached only when the URL has no ?station.
    const branch = page.slice(page.indexOf("const focusHome ="), page.indexOf("renderFocusHome({") + 200);
    assert.doesNotMatch(branch, /redirect\(/, "the focus-home branch must not redirect");
  });

  it("the focus home does not build the heavy radar/intelligence graph", () => {
    // renderFocusHome loads only light counts; the heavy builders live after the
    // early return, so a hat never pays for the macro dashboard it isn't showing.
    const renderStart = page.indexOf("async function renderFocusHome(");
    const renderEnd = page.indexOf("function buildDashboardSignals(");
    const body = page.slice(renderStart, renderEnd);
    assert.doesNotMatch(body, /getCachedBusinessIssueRadar|buildCommandIntelligenceSnapshot/, "the focus home must not run the heavy Command Centre graph");
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
