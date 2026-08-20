// Dev Console view-layer pins — Logs' changes count, and the Library's dropped
// blocker strip.
//
// Two different kinds of check live here, and the difference matters:
//
//   • BEHAVIOURAL. `changesPillLabel` is a real function with real inputs; the
//     old pill printed a truncated file count as if it were the whole truth, and
//     these cases fail against that.
//   • SOURCE-SHAPE. The Library's dead `scanBlockers()` fetch has no observable
//     output by definition — it was dead code whose only cost was a wasted file
//     read per page load, and the section is a React server component that
//     cannot be imported here (it pulls in next/link, which needs a client
//     React). So the removal is pinned by shape. That is weaker proof and is
//     labelled as such rather than dressed up.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  changesPillLabel,
  changesPillTitle,
} from "../src/app/portal/dev-team/logs/_changesLabel";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

// ─── 1. Logs: the count must not overstate what it knows ────────────────────

describe("Logs — the changes pill", () => {
  // This label has been wrong in BOTH directions, so it is worth stating what
  // is true now: `scanWorkerSignals` returns EVERY file changed in the window,
  // uncapped, so the pill's number is exact and needs no caveat.
  it("states the exact count, because the count is now the whole truth", () => {
    assert.equal(changesPillLabel(0), "0 changes · 2h");
    assert.equal(changesPillLabel(37), "37 changes · 2h");
    assert.equal(changesPillLabel(1908), "1908 changes · 2h");
    assert.equal(changesPillTitle(1908), "", "no caveat is needed when the number is the truth");
  });

  it("never labels an exact number as a lower bound", () => {
    // The regression this replaces: one lane removed the 200-file cap at the
    // source, the other kept printing "200+" and "showing the newest 200" — so
    // a true count of 1,908 was presented as if truncated.
    for (const n of [199, 200, 201, 1908]) {
      assert.doesNotMatch(changesPillLabel(n), /\+/, `${n} is exact — a "+" claims it is not`);
      assert.equal(changesPillTitle(n), "", `${n} needs no truncation caveat`);
    }
  });

  it("agrees with the scanner it describes — recentFiles is not truncated", () => {
    const scanner = read("src/lib/server/dev/devTeamWorkers.ts");
    assert.match(
      scanner,
      /NOT truncated/,
      "if scanWorkerSignals starts capping again, this pill must go back to a lower bound",
    );
    assert.doesNotMatch(
      read("src/app/portal/dev-team/logs/_changesLabel.ts"),
      /RECENT_FILES_CAP/,
      "the label must not carry a cap the scanner no longer applies",
    );
  });

  it("gets its singular right", () => {
    assert.equal(changesPillLabel(1), "1 change · 2h");
  });

  it("takes the window label from the caller", () => {
    assert.equal(changesPillLabel(5, "24h"), "5 changes · 24h");
  });
});

// ─── 2. Library: the blocker strip is gone, and so is its fetch ─────────────
//
// SOURCE-SHAPE pins (see the header note): dead code has no behaviour to assert.

describe("Library index — no leftover blocker plumbing [source-shape]", () => {
  it("the section no longer reads state.md on every index render", () => {
    const section = read("src/app/portal/dev-team/library/_Section.tsx");
    const code = section.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    assert.ok(!code.includes("scanBlockers"), "scanBlockers() must not be called for a discarded value");
  });

  it("the view no longer advertises a `blockers` prop it does not render", () => {
    const view = read("src/app/portal/dev-team/library/_LibraryIndex.tsx");
    const code = view.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    assert.ok(!code.includes("DevDocBlocker"), "the unused type import must be gone");
    assert.ok(!/blockers\??:/.test(code), "the prop must be gone from the signature");
  });
});

// ─── 3. Docs editor: the canonical path is what gets plumbed through ────────
//
// SOURCE-SHAPE pin. The behaviour it guards — one file, one history — is proved
// for real in smoke-dev-doc-edits.test.ts; this only catches the page handing
// the raw `?doc=` string back in.

describe("Edit docs page — canonical path wiring [source-shape]", () => {
  it("passes the resolved relPath to the history and the editor, not the raw query", () => {
    const page = read("src/app/portal/dev-team/docs/page.tsx");
    assert.ok(page.includes("docHistory(doc.relPath)"), "history must be keyed by the resolved path");
    assert.ok(!page.includes("docHistory(docParam)"), "the raw query string must not key the ledger");
    assert.ok(page.includes("relPath={doc.relPath}"), "the editor saves back under the resolved path");
    assert.ok(!page.includes("relPath={docParam}"));
  });
});
