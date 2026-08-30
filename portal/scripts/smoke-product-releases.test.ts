// "What's new in Aqua" — the operator-facing changelog.
//
// Ed, 2026-08-29, on splitting internal logs from the changes he has made to the
// app. The split already existed; what had gone wrong was quieter. The Settings
// tab was built, well laid out, and **twenty days stale** — the newest entry was
// 0.8.0 on 9 August with 89 commits behind it, including an entire editor.
//
// A stale changelog is worse than an absent one: it is a page that confidently
// tells somebody the product stopped changing. So the checks below are about
// the two ways this surface goes wrong, and neither of them is layout.
//
// ── This is NOT the dev log, and must never become it ─────────────────────
//
// `docs/development/updates.md` is the internal working record and carries its
// own warning: *"an entry saying 'X is not built yet' stays on the page long
// after X ships."* It is founder-only, in Dev Team → Library, and it stays
// there. This file is authored FOR the operator. Piping one into the other
// would put superseded internal notes in front of a hired caller.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { APP_VERSION, PRODUCT_RELEASES, formatReleaseDate } from "../src/lib/projects/releases";

describe("the changelog is coherent", () => {
  it("has the current version at the top", () => {
    // The version badge in Settings reads APP_VERSION; if the newest entry is a
    // different release, the page shows one number and describes another.
    assert.equal(PRODUCT_RELEASES[0].version, APP_VERSION);
  });

  it("is ordered newest first", () => {
    const dates = PRODUCT_RELEASES.map(release => release.releasedAt);
    assert.deepEqual(dates, [...dates].sort().reverse(),
      "the tab renders in array order and marks entry 0 as Latest");
  });

  it("has no duplicate versions", () => {
    const versions = PRODUCT_RELEASES.map(release => release.version);
    assert.equal(new Set(versions).size, versions.length);
  });

  it("dates are real and parseable", () => {
    for (const release of PRODUCT_RELEASES) {
      assert.match(release.releasedAt, /^\d{4}-\d{2}-\d{2}$/, `${release.version} has a malformed date`);
      assert.ok(formatReleaseDate(release.releasedAt).trim(), `${release.version} does not format`);
    }
  });
});

describe("every entry is worth reading", () => {
  it("says what changed and what it means, not just a title", () => {
    for (const release of PRODUCT_RELEASES) {
      assert.ok(release.title.trim(), `${release.version} has no title`);
      assert.ok(release.summary.trim().length > 40, `${release.version}'s summary is too thin to be useful`);
      assert.ok(release.highlights.length > 0, `${release.version} has no highlights`);
      for (const highlight of release.highlights) {
        assert.ok(highlight.title.trim(), `${release.version} has an untitled highlight`);
        // A highlight that only names a feature tells an operator nothing about
        // whether it changes their day.
        assert.ok(highlight.detail.trim().length > 40,
          `${release.version} → "${highlight.title}" has no real detail`);
      }
    }
  });

  it("is written for an operator, not from commit messages", () => {
    // The tell: conventional-commit prefixes and internal file paths leaking
    // into a surface a hired caller can open.
    const prose = PRODUCT_RELEASES.flatMap(release => [
      release.title, release.summary,
      ...release.highlights.flatMap(highlight => [highlight.title, highlight.detail]),
    ]).join("\n");
    assert.doesNotMatch(prose, /\b(feat|fix|chore|refactor|docs)\(/, "commit prefixes are not release notes");
    assert.doesNotMatch(prose, /\bsrc\/|\.tsx?\b/, "file paths belong in the dev log, not here");
  });
});

describe("the operator changelog and the dev log stay apart", () => {
  it("Settings reads the authored releases, never the dev updates doc", () => {
    const settings = readFileSync("src/app/portal/agency/settings/SettingsTabs.tsx", "utf8");
    assert.match(settings, /PRODUCT_RELEASES/);
    assert.doesNotMatch(settings, /devTeamUpdates|development\/updates\.md/,
      "the internal working record must not reach a surface staff can open");
  });

  it("the dev updates surface stays in Dev Team, founder-gated", () => {
    const devUpdates = readFileSync("src/app/portal/dev-team/updates/_Section.tsx", "utf8");
    assert.match(devUpdates, /devDocsAccessible/, "the dev changelog stays behind the Dev Team gate");
  });
});
