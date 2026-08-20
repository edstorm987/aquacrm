// Dev Team portal smoke — the founder-only internal workspace.
//
// Phase 1 (icons) contract: the shared <SidebarNavLink> renders `item.icon` and
// falls back to a generic dot (`navIcon()` → `Circle`) for ids it doesn't know.
// The Dev Team ids (working, library, auditor, profiles, editor, updates,
// exit-dev-team) are NOT in that shared map, so an item without its own `icon`
// renders as a bare dot — which is exactly what this portal used to do.
//
// Proves:
//   1. every Dev Team nav item declares its own `icon` (no item may be added
//      without one — the fallback is not acceptable here);
//   2. each section's sidebar icon is the SAME lucide component that section's
//      own page header uses, so the nav and the page agree;
//   3. every icon the layout renders is actually imported from lucide-react;
//   4. no two sections share an icon (each one is distinguishable at a glance,
//      which is the whole point in collapsed mode);
//   5. the shared SidebarNavLink still prefers `item.icon` over the fallback.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (rel: string) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");

/**
 * Every nav item in the Dev Team layout, mapped to the lucide component it
 * renders. Both spellings count — the raw element `icon: <Foo … />` and the
 * accent helper `icon: ico(Foo, "…")` — because what this contract is about is
 * WHICH component each section shows, not how it is wrapped.
 */
function layoutNavIcons(source: string): Map<string, string | null> {
  const items = new Map<string, string | null>();
  // One nav item per `{ id: "…" … }` object literal on a single line.
  for (const line of source.split(/\r?\n/)) {
    const id = /\{\s*id:\s*"([^"]+)",\s*label:/.exec(line);
    if (!id) continue;
    const icon = /icon:\s*(?:<([A-Za-z][\w]*)\b|ico\(\s*([A-Za-z][\w]*)\b)/.exec(line);
    items.set(id[1], icon ? (icon[1] ?? icon[2]) : null);
  }
  return items;
}

/** The lucide component used by a page's `<PageHeader icon={<Foo … />}>`. */
function pageHeaderIcon(source: string): string | null {
  const m = /<PageHeader[\s\S]{0,200}?icon=\{<([A-Za-z][\w]*)\b/.exec(source);
  return m ? m[1] : null;
}

describe("dev team portal — sidebar icons", () => {
  it("gives every nav item its own icon, matching that section's page header", async () => {
    const [layout, home, roadmap, findings, library, tools, notes, notepad, navLink] =
      await Promise.all([
        read("src/app/portal/dev-team/layout.tsx"),
        read("src/app/portal/dev-team/page.tsx"),
        read("src/app/portal/dev-team/roadmap/page.tsx"),
        // A section's header lives in its DEFAULT VIEW, not in the host route.
        read("src/app/portal/dev-team/findings/_Section.tsx"),
        read("src/app/portal/dev-team/library/_LibraryIndex.tsx"),
        read("src/app/portal/dev-team/tools/page.tsx"),
        read("src/app/portal/dev-team/notes/page.tsx"),
        read("src/app/portal/agency/notepad/_NotepadWorkspace.tsx"),
        read("src/components/chrome/SidebarNavLink.tsx"),
      ]);

    const nav = layoutNavIcons(layout);

    // 1 — the full set of sections, and NONE of them may fall back to the dot.
    assert.deepEqual(
      [...nav.keys()],
      // Editor + Team chat are now first-class sidebar items; the old
      // "exit-dev-team" item was removed (the topbar's role-dependent "Back to
      // home" is the single way out now).
      ["home", "roadmap", "findings", "library", "tools", "editor", "chat", "notes", "account"],
      "the Dev Team sidebar sections changed — update this contract deliberately",
    );
    for (const [id, icon] of nav) {
      assert.ok(icon, `nav item "${id}" has no icon — it would render the generic dot fallback`);
    }

    // 2 — sidebar icon === that section's own page-header icon.
    const headerIcons: Record<string, string | null> = {
      home: pageHeaderIcon(home),
      roadmap: pageHeaderIcon(roadmap),
      findings: pageHeaderIcon(findings),
      library: pageHeaderIcon(library),
    };
    for (const [id, headerIcon] of Object.entries(headerIcons)) {
      assert.ok(headerIcon, `${id}/page has no PageHeader icon to match the sidebar against`);
      assert.equal(
        nav.get(id),
        // The Library index imports lucide's `Library` under its own name; the
        // layout imports it plainly. Compare the underlying component.
        headerIcon === "LibraryIcon" ? "Library" : headerIcon,
        `sidebar icon for "${id}" disagrees with its page header`,
      );
    }

    // Tools is a deliberate exception: it groups three genuinely different jobs
    // (Inspector / Editor / API & MCP), each of which keeps its own header and
    // hue, so the section's own icon is the generic one for "the controls".
    assert.equal(nav.get("tools"), "Wrench");
    assert.equal(pageHeaderIcon(tools), null, "the Tools host renders a view, not a header of its own");
    assert.match(tools, /InspectorSection|EditorSection|ApiSection/, "Tools still mounts its three views");

    // Notes is the OTHER deliberate exception: it reuses the agency Notepad
    // workspace wholesale, which brings its own <h1> header — so there is no
    // dev-team PageHeader to match. The sidebar icon matches the icon that
    // workspace itself uses, which is the honest equivalent.
    assert.match(notes, /NotepadWorkspace/, "notes still reuses the shared notepad workspace");
    assert.equal(pageHeaderIcon(notes), null, "notes deliberately has no dev-team PageHeader");
    assert.equal(nav.get("notes"), "NotebookPen");
    assert.match(notepad, /<NotebookPen\b/, "the notepad workspace still leads with NotebookPen");

    // 3 — every icon the layout renders is imported from lucide-react.
    const importBlock = /import\s*\{([^}]*)\}\s*from\s*"lucide-react";/.exec(layout);
    assert.ok(importBlock, "layout imports its icons from lucide-react");
    const imported = new Set(importBlock[1].split(",").map(s => s.trim()).filter(Boolean));
    for (const [id, icon] of nav) {
      assert.ok(imported.has(icon!), `"${id}" uses <${icon}> but the layout never imports it`);
    }

    // 4 — no two sections share an icon.
    const used = [...nav.values()] as string[];
    assert.equal(new Set(used).size, used.length, `two Dev Team sections share an icon: ${used.join(", ")}`);

    // 5 — the shared link still prefers the item's own icon over the fallback.
    assert.match(navLink, /\{icon \?\? <Icon size=\{16\}/, "SidebarNavLink no longer prefers item.icon");
  });

  it("keeps the home section cards distinguishable too", async () => {
    const home = await read("src/app/portal/dev-team/page.tsx");
    const section = /const SECTIONS[\s\S]*?\n\];/.exec(home);
    assert.ok(section, "the home page still lists its section cards");
    const icons = [...section[0].matchAll(/icon:\s*<([A-Za-z][\w]*)\b/g)].map(m => m[1]);
    assert.ok(icons.length >= 5, "every home card carries an icon");
    assert.equal(icons.length, [...section[0].matchAll(/href:\s*"/g)].length, "every home card carries an icon");
    assert.equal(new Set(icons).size, icons.length, `two home cards share an icon: ${icons.join(", ")}`);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — accuracy. These drive the REAL parsers/composers over fixture
// markdown, so they prove behaviour rather than shape.
// ---------------------------------------------------------------------------

describe("dev team board — a parked worker is not a shipped plan", () => {
  it("hands the verdict back to the plan file when the worker row says PARKED", async () => {
    const { parseWorkers, composeLanes } = await import("../src/lib/server/dev/devTeamBoard");

    // The real shape of the mfa-login row: a ✅ "Phase N complete" that is about
    // the worker's own slice, followed by PARKED — while the plan itself is not
    // built. Before this contract it read as a shipped plan.
    const state = [
      "## Workers in flight",
      "| Worker | Plan | Owns | Status |",
      "| --- | --- | --- | --- |",
      "| **MFA worker** | [mfa-login.md](../development/plans/mfa-login.md) | `login` | ✅ **Phase 4 complete — PARKED by Ed** (won't advance further for now). |",
      "| **Radar worker** | [radar-upgrade.md](../development/plans/radar-upgrade.md) | `radar` | ✅ **COMPLETE — all stages shipped.** |",
    ].join("\n");

    const workers = parseWorkers(state);
    const mfaWorker = workers.find(w => w.name.includes("MFA"));
    const radarWorker = workers.find(w => w.name.includes("Radar"));
    assert.equal(mfaWorker?.parked, true, "PARKED must be detected on the worker row");
    assert.equal(radarWorker?.parked, false, "a plainly-complete row is not parked");

    const board = {
      workers,
      planStatuses: [
        {
          relPath: "docs/development/plans/mfa-login.md",
          name: "mfa-login",
          title: "Wire MFA into login",
          status: "PLAN (not wired) — PARKED by Ed.",
          statusKind: "planned" as const,
          markers: [],
        },
        {
          relPath: "docs/development/plans/radar-upgrade.md",
          name: "radar-upgrade",
          title: "Radar upgrade",
          status: "PLAN (not built).",
          statusKind: "planned" as const,
          markers: [],
        },
      ],
      blockers: [],
      scannedAtMs: 0,
    };

    const lanes = composeLanes(board);
    const shippedTitles = lanes.shipped.map(item => item.title);
    const readyTitles = lanes.readyNext.map(item => item.title);

    // The parked plan follows its own file (not built → Ready next)…
    assert.ok(!shippedTitles.includes("Wire MFA into login"), "a parked plan must not be reported as shipped");
    assert.ok(readyTitles.includes("Wire MFA into login"), "a parked plan follows its own plan file");

    // …while a genuinely-complete worker still overrides a stale plan line.
    assert.ok(shippedTitles.includes("Radar upgrade"), "a complete worker still reconciles a stale plan to shipped");

    // And the card explains itself — the plan's word first, then why nobody is on it.
    const mfaCard = lanes.readyNext.find(item => item.title === "Wire MFA into login");
    assert.match(mfaCard?.detail ?? "", /PLAN \(not wired\)/);
    assert.match(mfaCard?.detail ?? "", /Worker parked:/);
  });

  it("keeps trouble winning over a parked row", async () => {
    const { parseWorkers, composeLanes } = await import("../src/lib/server/dev/devTeamBoard");
    const state = [
      "## Workers in flight",
      "| Worker | Plan | Owns | Status |",
      "| --- | --- | --- | --- |",
      "| **X worker** | [x.md](../development/plans/x.md) | `x` | 🔴 **REWORK** — PARKED while it is fixed. |",
    ].join("\n");
    const lanes = composeLanes({
      workers: parseWorkers(state),
      planStatuses: [{
        relPath: "docs/development/plans/x.md",
        name: "x",
        title: "X",
        status: "✅ SHIPPED.",
        statusKind: "shipped" as const,
        markers: ["✅"],
      }],
      blockers: [],
      scannedAtMs: 0,
    });
    assert.deepEqual(lanes.blocked.map(i => i.title), ["X"], "a 🔴 row stays blocked even when parked");
  });
});

describe("dev team auditor — open vs historical is evidence, not a guess", () => {
  it("labels a 🔴 closed only when a later ✅ names the same subject", async () => {
    const { parseAuditFindings } = await import("../src/lib/server/dev/devTeamAuditor");

    // Newest-first, exactly as the auditor writes it.
    const log = [
      "# Audit log",
      "",
      "> ✅ **RESOLVED (2026-08-19, auditor)** — Freelancer preview MANAGER → OWNER escalation is **closed**.",
      "",
      "## 2026-08-19 — ✅ PASS (re-audit) — Freelancer preview MANAGER → OWNER escalation: CLOSED",
      "",
      "**Verdict:** ✅ PASS — the escalation is resolved.",
      "",
      "## 2026-08-19 — 🔴 REWORK — Freelancer preview: MANAGER → OWNER privilege escalation (session-minting)",
      "",
      "**Verdict:** 🔴 REWORK — exit re-mints an owner.",
      "",
      "## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2: the runtime sweep",
      "",
      "**Verdict:** 🔴 REWORK — the sweep never runs.",
      "",
      "## 2026-08-18 — ✅ PASS — Plugin-data erasure Phase 1: onEraseClient hook contract",
      "",
      "**Verdict:** ✅ PASS — the hook contract is sound.",
    ].join("\n");

    const findings = parseAuditFindings(log);
    const entries = findings.filter(f => f.source === "entry");
    assert.equal(entries.length, 2, "only the 🔴 rulings are findings; ✅ ones are not");

    const freelancer = entries.find(f => /Freelancer/i.test(f.title));
    const erasure = entries.find(f => /erasure/i.test(f.title));

    // Closed — a NEWER ✅ ruling names the same subject.
    assert.ok(freelancer?.supersededBy, "a later ✅ PASS on the same subject closes the 🔴");
    assert.match(freelancer!.supersededBy!.verdict, /✅/);
    assert.match(freelancer!.supersededBy!.title, /Freelancer preview/);

    // NOT closed — the only ✅ about erasure is OLDER, and it is a different
    // phase. An older PASS can never close a newer REWORK.
    assert.equal(erasure?.supersededBy, undefined, "an older ✅ must not be read as closing a newer 🔴");

    // Nothing is dropped: both rulings are still returned either way.
    assert.deepEqual(
      entries.map(f => Boolean(f.supersededBy)),
      [true, false],
      "both rulings survive; only the label differs",
    );
  });

  it("does not let a same-plan PASS on a different phase close a rework", async () => {
    const { parseAuditFindings } = await import("../src/lib/server/dev/devTeamAuditor");
    const log = [
      "# Audit log",
      "",
      "## 2026-08-19 — ✅ PASS — Plugin-data erasure Phase 5: the per-disposition test",
      "",
      "**Verdict:** ✅ PASS.",
      "",
      "## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2: the runtime sweep",
      "",
      "**Verdict:** 🔴 REWORK.",
    ].join("\n");
    const entry = parseAuditFindings(log).find(f => f.source === "entry");
    assert.ok(entry, "the rework is a finding");
    assert.equal(entry!.supersededBy, undefined, "same plan, different phase is NOT the same subject");
  });

  it("surfaces the split on the Auditor page, without hiding anything", async () => {
    const page = await read("src/app/portal/dev-team/auditor/_Section.tsx");
    assert.match(page, /unresolvedEntries = reworkEntries\.filter\(f => !f\.supersededBy\)/);
    assert.match(page, /closedEntries = reworkEntries\.filter\(f => f\.supersededBy\)/);
    // Both groups render — the split labels, it never drops.
    assert.match(page, /rulings with no recorded resolution/i);
    assert.match(page, /closed by a later ✅ PASS/i);
    assert.match(page, /Closed by \{finding\.supersededBy\.verdict\}/);
    // The banner ledger stays the "open now" signal, and says so.
    assert.match(page, /\{openCount\} open now/);
  });
});

describe("command centre — the Dev Team station tells the truth", () => {
  it("badges the board's Blocked lane and deep-links only for a founder", async () => {
    const [dashboard, page] = await Promise.all([
      read("src/app/portal/agency/_DashboardCommandCenter.tsx"),
      read("src/app/portal/agency/page.tsx"),
    ]);

    // The count is computed server-side from the SAME model the station renders,
    // so the nav badge and the station's "Blocked" tile cannot disagree.
    assert.match(page, /composeLanes\(await scanDevTeamBoard\(\)\)/);
    assert.match(page, /devTeamBlockedCount = devTeamLanes\?\.blocked\.length \?\? 0/);
    assert.match(page, /devTeamLaunchBlockerCount = devTeamLanes\?\.blocked\.filter\(item => item\.kind === "blocker"\)\.length/);
    // Still founder-gated (and skipped under Performance mode): no scan, no
    // count, no station-badge work for anyone else, or when perf mode is on.
    assert.match(page, /devTeamVisible && !perfMode \? composeLanes/);
    assert.doesNotMatch(page, /devTeamBlockerCount/, "the old hardcoded-zero-era prop is gone");

    // The badge is the real number, and never a bare hardcoded literal again.
    assert.match(dashboard, /count: devTeamBlockedCount,/);
    assert.doesNotMatch(dashboard, /devTeamAttention[\s\S]{0,120}count: 0,/);
    // Tone follows the other stations: a launch blocker is critical, stalled work is a warning.
    assert.match(dashboard, /tone: devTeamLaunchBlockerCount \? "critical" : devTeamBlockedCount \? "warning" : "clear"/);
    // The label breaks the number down rather than asserting a bare count.
    assert.match(dashboard, /blocked on the Dev Team board/);

    // Phase 3 — `?station=devteam` resolves ONLY when the station is visible.
    assert.match(dashboard, /function commandStationMode\(value: string \| null, devTeamVisible = false\)/);
    assert.match(dashboard, /if \(value === "devteam"\) return devTeamVisible \? "devteam" : null;/);
    assert.match(dashboard, /commandStationMode\(requestedStationValue, devTeamVisible\)/);
    // The other three stations are untouched by the guard.
    assert.match(dashboard, /\["executive", "day", "battle", "intelligence", "radar"\]\.includes\(value\)/);
  });
});
