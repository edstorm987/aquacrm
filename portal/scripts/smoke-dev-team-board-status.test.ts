// Dev Team board — plan-status parsing + worker reconciliation.
//
// The board is the founder's only "what is moving" view, and both of its truth
// sources are markdown written by hand. Three defects lived here, all of them
// silent (a wrong lane or a missing card, never an error):
//
//   1. `**Status:** value` — bold LABEL, value after the closing `**` — parsed
//      to null, so the plan vanished from every lane and every count.
//   2. "awaiting" was checked BEFORE the ✅/shipped rule, so "✅ SHIPPED —
//      awaiting sign-off" landed in "Ready next · Planned, ready to assign".
//   3. Only the FIRST plan link in a worker row was reconciled, so a worker
//      owning two plans governed one of them and not the other.
//
// Everything below drives the real parsers over real-shaped markdown.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  composeLanes,
  parsePlanStatus,
  parseWorkers,
  type DevTeamBoard,
  type PlanStatus,
} from "../src/lib/server/devTeamBoard";

const kindOf = (md: string) => parsePlanStatus(md)?.statusKind ?? null;

describe("plan status — both markdown idioms parse", () => {
  it("reads the value when it sits INSIDE the bold span", () => {
    const parsed = parsePlanStatus("# Plan — X\n\n**Status: ✅ SHIPPED — all phases (2026-08-20).**\n");
    assert.equal(parsed?.statusKind, "shipped");
    assert.match(parsed?.status ?? "", /SHIPPED/);
  });

  it("reads the value when the bold span is only the LABEL", () => {
    // Regression: the non-greedy `[\s\S]*?` captures the empty string between
    // `:` and `**`, which used to return null and drop the plan off the board.
    const parsed = parsePlanStatus("# Plan — X\n\n**Status:** ✅ SHIPPED — all phases (2026-08-20).\n");
    assert.notEqual(parsed, null, "`**Status:** value` must not parse to null");
    assert.equal(parsed?.statusKind, "shipped");
    assert.match(parsed?.status ?? "", /SHIPPED/);
    assert.deepEqual(parsed?.markers, ["✅"]);
  });

  it("keeps the earliest real status when a doc carries both forms", () => {
    const md = [
      "# Plan — X",
      "",
      "**Status:** 🔴 BLOCKED — waiting on the auditor.",
      "",
      "## Later",
      "**Status: ✅ SHIPPED.**",
    ].join("\n");
    assert.equal(parsePlanStatus(md)?.statusKind, "blocked", "the opening status is the doc's status");
  });

  it("still returns null when there is no status line at all", () => {
    assert.equal(parsePlanStatus("# Plan — X\n\nSome prose.\n"), null);
  });

  it("still parses a status whose bold span wraps across lines", () => {
    const parsed = parsePlanStatus("**Status: ✅ SHIPPED —\nall phases landed.**\n");
    assert.equal(parsed?.statusKind, "shipped");
  });
});

describe("plan status — completion outranks 'awaiting'", () => {
  it("keeps built-but-unverified work OUT of Ready next", () => {
    assert.equal(
      kindOf("**Status: ✅ SHIPPED — all 6 phases (2026-08-20); awaiting commander browser-verify.**"),
      "shipped",
    );
    assert.equal(
      kindOf("**Status: ✅ COMPLETE — all phases shipped; awaiting auditor sign-off.**"),
      "shipped",
    );
    // Built, fixed, waiting on a re-check: in flight — never "ready to assign".
    assert.equal(kindOf("**Status: 🟡 FIXED — awaiting auditor re-verify.**"), "building");
    // "pending" carries the same intent and used to classify the other way.
    assert.equal(kindOf("**Status: ✅ BUILT — pending auditor sign-off.**"), "shipped");
  });

  it("still reads a genuinely unstarted plan as planned", () => {
    assert.equal(kindOf("**Status: PLAN — awaiting a worker.**"), "planned");
    assert.equal(kindOf("**Status: Greenfield — nothing built yet.**"), "planned");
    assert.equal(kindOf("**Status: 🟠 Awaiting Ed's decision on scope.**"), "planned");
    assert.equal(kindOf("**Status: Not built yet — spec only.**"), "planned");
  });

  it("leaves the rules either side of it alone", () => {
    assert.equal(kindOf("**Status: 🔴 BLOCKED — awaiting a fix.**"), "blocked");
    assert.equal(kindOf("**Status: Superseded by radar-upgrade.md — awaiting archive.**"), "shipped");
  });
});

// ---------------------------------------------------------------------------

const PLAN_A = "docs/development/plans/meta-inbox-connect.md";
const PLAN_B = "docs/development/plans/internal-chat-attention.md";

function twoPlanState(workerStatus: string): string {
  // The real shape of the Meta-inbox row: ONE worker, TWO plan links.
  return [
    "## Workers in flight",
    "| Worker | Plan | Owns | Status |",
    "| --- | --- | --- | --- |",
    `| **Meta-inbox worker** | [meta-inbox-connect.md](../development/plans/meta-inbox-connect.md) + [internal-chat-attention.md](../development/plans/internal-chat-attention.md) | \`inbox\` | ${workerStatus} |`,
  ].join("\n");
}

function boardWith(workerStatus: string): DevTeamBoard {
  const plan = (relPath: string, title: string): PlanStatus => ({
    relPath,
    name: relPath.split("/").pop()!.replace(/\.md$/, ""),
    title,
    status: "✅ CODE-COMPLETE.",
    statusKind: "shipped",
    markers: ["✅"],
  });
  return {
    workers: parseWorkers(twoPlanState(workerStatus)),
    planStatuses: [plan(PLAN_A, "Meta inbox connect"), plan(PLAN_B, "Internal chat attention")],
    blockers: [],
    scannedAtMs: 0,
  };
}

describe("board reconciliation — a worker owns EVERY plan in its cell", () => {
  it("collects both plan links off the row", () => {
    const worker = parseWorkers(twoPlanState("✅ **COMPLETE**"))[0];
    assert.deepEqual(worker.planRelPaths, [PLAN_A, PLAN_B]);
    assert.equal(worker.planRelPath, PLAN_A, "the first link stays the display link");
  });

  it("drags BOTH plans into Blocked when the worker is in trouble", () => {
    const lanes = composeLanes(boardWith("🔴 **REWORK** — webhook agency-resolution unsafe."));
    const blocked = lanes.blocked.map(i => i.title).sort();
    assert.deepEqual(blocked, ["Internal chat attention", "Meta inbox connect"]);
    assert.equal(lanes.shipped.length, 0, "no half of the row may stay in Shipped");
  });

  it("does not add a duplicate worker card once its plans are placed", () => {
    const lanes = composeLanes(boardWith("✅ **COMPLETE — 3 workstreams.**"));
    const all = [...lanes.inFlight, ...lanes.shipped, ...lanes.blocked, ...lanes.readyNext];
    assert.equal(all.filter(i => i.kind === "worker").length, 0);
    assert.equal(all.length, 2, "two plans, two cards");
  });

  it("still places a worker row that links no plan at all", () => {
    const lanes = composeLanes({
      workers: parseWorkers([
        "## Workers in flight",
        "| Worker | Plan | Owns | Status |",
        "| --- | --- | --- | --- |",
        "| **(this chat) Commander** | — | everything | Running the wave. |",
      ].join("\n")),
      planStatuses: [],
      blockers: [],
      scannedAtMs: 0,
    });
    assert.deepEqual(lanes.inFlight.map(i => i.title), ["(this chat) Commander"]);
  });
});
