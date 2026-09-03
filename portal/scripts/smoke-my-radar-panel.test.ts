// The My Radar panel — how the reading is drawn.
//
// The arithmetic is tested in `smoke-department-allocation`; this is about the
// ways a correct number becomes a misleading picture.
//
// Form first: this is NOT a radar chart despite the name. The data's job is "a
// ratio against a limit, per department", which is a meter. A spider chart
// encodes magnitude as area — a department on half its baseline draws at a
// quarter — and its axis ORDER silently changes the shape, so two people
// reading the same data disagree. The product's existing Radar is a health
// system, not a shape, and this follows that.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync("src/components/intelligence/MyRadarPanel.tsx", "utf8");
// Comments stripped for the form checks: this file's own prose explains WHY it
// is not a polygon, and an assertion that cannot tell an explanation from a
// drawing would forbid documenting the decision.
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(line => !line.trim().startsWith("//"))
  .join("\n");

describe("the form", () => {
  it("draws meters, not a polygon", () => {
    assert.doesNotMatch(code, /polygon|<svg|radialGradient|polarArea/i,
      "a ratio against a limit is a meter; area encoding would understate every shortfall");
  });

  it("reads each department against its OWN baseline, not the busiest one", () => {
    // A shared scale would make a small department with a small target look
    // like a failure beside a large one that is doing worse.
    assert.match(source, /entry\.actualHours \/ entry\.baselineHours/);
  });

  it("caps the fill so an over-served department cannot draw outside its row", () => {
    assert.match(source, /Math\.min\(100,/);
  });

  it("keeps a sliver for a department that got a little, so it differs from none", () => {
    assert.match(source, /Math\.max\(filled, entry\.actualHours > 0 \? 2 : 0\)/);
  });

  it("draws no track at all without a baseline", () => {
    // A meter with no limit is a one-number bar chart pretending to be a ratio.
    assert.match(source, /Set a weekly baseline to assess this area/);
  });
});

describe("status never rests on colour alone", () => {
  it("pairs every state with an icon and a word", () => {
    for (const state of ["starved", "short", '"on-track"', "over", "unplanned"]) {
      assert.match(source, new RegExp(`${state}:\\s*\\{[^}]*label:`), `${state} needs a label`);
      assert.match(source, new RegExp(`${state}:\\s*\\{[^}]*icon:`), `${state} needs an icon`);
    }
  });

  it("renders the icon and the label beside the tint", () => {
    assert.match(source, /<Icon size=\{11\} aria-hidden="true" \/>\s*\{status\.label\}/);
  });

  it("gives 'no baseline' a neutral grey rather than a status colour", () => {
    // A permanently amber row for a department nobody planned is a row people
    // learn to ignore — and then they ignore the amber that matters.
    assert.match(source, /unplanned:\s*\{[^}]*text: "text-black\/40"/);
    assert.match(source, /unplanned:\s*\{[^}]*fill: "bg-black\/25"/);
  });
});

describe("wellbeing is drawn with its denominator", () => {
  it("always shows how many days the mean came from", () => {
    assert.match(source, /from \{days\}/);
  });

  it("says 'not rated yet' rather than showing a zero", () => {
    // A self-rated mean of nothing is not zero out of five.
    assert.match(source, /Not rated yet/);
  });
});

describe("unattributed hours", () => {
  it("get their own line rather than being spread across departments", () => {
    assert.match(source, /allocation\.unattributedHours > 0/);
    assert.match(source, /Not counted against any of them/);
  });

  it("tell the reader how to stop it happening again", () => {
    // A finding with no next action is just a complaint.
    assert.match(source, /Working as/);
  });
});
