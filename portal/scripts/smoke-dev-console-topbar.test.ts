// Dev Console in the topbar — the ambient half of the Dev Team workspace.
//
// Ed's ask: don't make me navigate somewhere to record a thought. An icon sits
// beside Radar and notifications on every page, shows true live status, and
// captures a finding in place.
//
// Two kinds of coverage here, deliberately:
//   1. BEHAVIOUR over the real repo — `devConsoleBadge()` / `devConsoleStatus()`
//      compose only from readers that already exist, and every number they
//      report is re-derivable from those readers. A console that invents a
//      number is worse than one that shows nothing.
//   2. WIRING pins — the gate is server-decided in every layout that mounts a
//      Topbar, the route re-asserts it, and the panel stays lazily loaded (a
//      closed console must cost nothing on a surface that renders everywhere).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIVE_WORKER_WINDOW_MS,
  devConsoleBadge,
  devConsoleCore,
  devConsoleStatus,
  invalidateDevConsoleBadge,
} from "../src/lib/server/dev/devConsoleStatus";
import { scanBlockers } from "../src/lib/server/dev/devDocs";
import { listFindings } from "../src/lib/server/dev/devTeamFindings";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Every symbol a module actually imports. Asserting "X is not used here" against
 * raw text is a trap — these files explain in comments WHY they avoid something,
 * and a naive regex matches the explanation. Nothing can be called without being
 * imported, so this is the honest check.
 */
function imported(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.replace(/\btype\b/, "").split(" as ")[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

describe("Dev Console status — behaviour over the real sources", () => {
  it("the badge counts open findings + open blockers, and nothing else", async () => {
    invalidateDevConsoleBadge();
    const badge = await devConsoleBadge();

    const [findings, blockers] = await Promise.all([listFindings(), scanBlockers()]);
    const openFindings = findings.filter(finding => finding.status === "open").length;
    const openBlockers = blockers.filter(blocker => !blocker.resolved).length;

    assert.equal(badge.openFindings, openFindings, "open findings come from listFindings()");
    assert.equal(badge.openBlockers, openBlockers, "open blockers come from scanBlockers()");
    assert.equal(badge.attention, openFindings + openBlockers, "the badge number is the sum, not a guess");
    // Resolved blockers and planned/fixed findings must never inflate the badge.
    assert.ok(badge.openBlockers <= blockers.length);
    assert.ok(badge.openFindings <= findings.length);
  });

  it("the badge and the panel read the same numbers — the icon can never disagree with what it opens", async () => {
    invalidateDevConsoleBadge();
    const core = await devConsoleCore();
    const badge = await devConsoleBadge();
    assert.equal(badge.attention, core.attention);
    assert.equal(badge.openFindings, core.openFindings);
    assert.equal(badge.openBlockers, core.openBlockers);
  });

  it("caches the badge (it renders on every page) and can be invalidated", async () => {
    invalidateDevConsoleBadge();
    const first = await devConsoleBadge();
    const second = await devConsoleBadge();
    assert.equal(second.scannedAtMs, first.scannedAtMs, "a second read inside the TTL reuses the first scan");

    invalidateDevConsoleBadge();
    const third = await devConsoleBadge(first.scannedAtMs + 1);
    assert.notEqual(third.scannedAtMs, first.scannedAtMs, "invalidation forces a fresh read");
  });

  it("the fast half carries the lists but never the worker walk", async () => {
    invalidateDevConsoleBadge();
    const core = await devConsoleCore();
    // Structural, not a timing assertion: `core` is what paints the popover on
    // its first frame, so it must not carry the fields that require walking the
    // working tree. If worker data ever appears here, the console got slow.
    assert.ok(Array.isArray(core.findings) && Array.isArray(core.blockers));
    assert.ok(!("workers" in core), "worker activity is NOT part of the fast read");
    assert.ok(!("activeAreas" in core), "file activity is NOT part of the fast read");

    const full = await devConsoleStatus();
    assert.ok(Array.isArray(full.workers), "the slow read adds worker activity");
    assert.ok(Array.isArray(full.activeAreas));
    assert.equal(full.attention, core.attention, "both halves agree on the count");
  });

  it("the full status is capped for a popover but counts the whole truth", async () => {
    const now = Date.now();
    const status = await devConsoleStatus(now);

    // Counts are the REAL totals; the lists are what fits in a glance. Reporting
    // the capped list length as the count is the bug this pins.
    assert.ok(status.findings.length <= 5, "at most five findings shown");
    assert.ok(status.blockers.length <= 4, "at most four blockers shown");
    assert.ok(status.workers.length <= 5, "at most five workers shown");
    assert.ok(status.activeAreas.length <= 4, "at most four active areas shown");
    assert.ok(status.findings.length <= status.openFindings);
    assert.ok(status.blockers.length <= status.openBlockers);
    assert.equal(status.attention, status.openFindings + status.openBlockers);

    const badge = await devConsoleBadge(now);
    assert.equal(status.openBlockers, badge.openBlockers, "badge and panel read the same blockers");

    // "Working right now" means right now — a check-in older than the window is
    // history, not activity.
    for (const worker of status.workers) {
      assert.ok(worker.at >= now - ACTIVE_WORKER_WINDOW_MS, `${worker.name} checked in inside the active window`);
      assert.ok(worker.name.length > 0);
    }
    for (const area of status.activeAreas) {
      assert.ok(area.count > 0, "an area with no changed files is not activity");
    }
  });

  it("only surfaces OPEN work — planned/fixed findings and resolved blockers stay out", async () => {
    const status = await devConsoleStatus();
    const findings = await listFindings();
    const bySlug = new Map(findings.map(finding => [finding.slug, finding]));
    for (const shown of status.findings) {
      assert.equal(bySlug.get(shown.slug)?.status, "open", `${shown.slug} is open`);
    }
    const resolved = new Set((await scanBlockers()).filter(blocker => blocker.resolved).map(blocker => blocker.label));
    for (const shown of status.blockers) {
      assert.ok(!resolved.has(shown.label), `${shown.label} is not a resolved blocker`);
    }
  });
});

describe("Dev Console — the topbar wiring", () => {
  it("the gate is server-decided and re-asserted by the route", () => {
    const route = read("src/app/api/portal/dev-team/console/route.ts");
    assert.match(route, /devDocsAccessible\(session\)/, "the route asks the one predicate itself");
    assert.match(route, /status: 404/, "outside founder-only access the surface does not exist");
    assert.match(route, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/);

    const control = read("src/components/chrome/DevConsoleControl.tsx");
    assert.match(control, /^import "server-only";/m, "the control is server-only");
    assert.match(control, /devConsoleBadge\(\)/, "only the cheap read is on the render path");
    assert.ok(!imported(control).has("devConsoleStatus"), "the expensive scan must never be on the render path");
  });

  it("every Topbar mount decides visibility server-side", () => {
    const topbar = read("src/components/chrome/Topbar.tsx");
    assert.match(topbar, /devConsole\?: boolean/, "one boolean prop, never a client decision");
    assert.match(topbar, /devConsole && !publicShowcase && !showcaseMode \? <DevConsoleControl \/> : null/);

    // Every surface that renders a Topbar for an agency operator passes it.
    for (const surface of [
      "src/app/portal/agency/layout.tsx",
      "src/app/portal/clients/page.tsx",
      "src/app/portal/clients/[clientId]/layout.tsx",
    ]) {
      // Server-side gate = the founder gate AND the dev-icon visibility cookie
      // (the profile "Dev Mode" toggle drives that cookie instead of navigating).
      assert.match(read(surface), /devConsole=\{devDocsAccessible\(session\) && /, `${surface} gates the icon server-side`);
    }
    // Dev Team already rejects the whole layout through the same underlying
    // founder decision before it constructs its streamed Topbar. It uses the
    // lightweight access seam directly so importing the shell does not also
    // import the docs scanner merely to ask the compatibility wrapper.
    const devTeam = read("src/app/portal/dev-team/layout.tsx");
    assert.match(devTeam, /import \{ devTeamAccessible \} from "@\/lib\/server\/dev\/devTeamAccess"/);
    assert.match(devTeam, /if \(!devTeamAccessible\(session\)\) notFound\(\)/);
    assert.match(devTeam, /devConsole=\{await devIconPreference\(\)\}/);
    // The staff portal is not a founder surface — no icon, no import.
    assert.doesNotMatch(read("src/app/portal/team/layout.tsx"), /devConsole/);
  });

  it("a closed console costs nothing — the panel is lazily loaded", () => {
    const button = read("src/components/chrome/DevConsoleButton.tsx");
    assert.match(button, /dynamic\(\s*\(\) => import\("@\/components\/chrome\/DevConsolePanel"\)/, "next/dynamic, the GlobalAdvisorDrawer precedent");
    assert.match(button, /ssr: false/);
    assert.match(button, /\{open \? \(/, "the panel mounts only while open");
  });

  it("matches the topbar-peek pattern its neighbours set", () => {
    const button = read("src/components/chrome/DevConsoleButton.tsx");
    const radar = read("src/components/chrome/RadarQuickLookButton.tsx");
    for (const shared of [
      /mm-has-attention-badge relative overflow-visible/,
      /aria-haspopup="dialog"/,
      /aria-expanded=\{open\}/,
      /role="dialog"/,
      /event\.key === "Escape"/,
      /rootRef\.current\?\.contains\(event\.target as Node\)/,
      /mm-attention-badge/,
      /grid size-9 place-items-center rounded-md border border-black\/10 bg-white/,
    ]) {
      assert.match(button, shared, `Dev Console follows the shared topbar-peek shape: ${shared}`);
      assert.match(radar, shared, `…which Radar still sets: ${shared}`);
    }
  });

  it("captures in place: pre-filled page path, uploads, and the EXISTING findings API", () => {
    const panel = read("src/components/chrome/DevConsolePanel.tsx");

    // The whole point. `where` is free context here and is what makes a finding
    // actionable a week later — it must be filled in before you type a word.
    assert.match(panel, /function currentPagePath\(\)/);
    assert.match(panel, /window\.location\.pathname\}\$\{window\.location\.search/, "path AND query — ?station=… identifies the view");
    assert.match(panel, /const where = draft\.where \?\? pagePath;/, "typed value wins, otherwise follow the page");
    // useSearchParams() here would opt every page carrying a Topbar into
    // client-side rendering for a string we need once, on open.
    // Checked on the IMPORT, not the text: the panel names the hook in a comment
    // explaining why it doesn't use it, and a naive regex would match that.
    const navImport = /import \{([^}]*)\} from "next\/navigation";/.exec(panel)?.[1] ?? "";
    assert.ok(!navImport.includes("useSearchParams"), "useSearchParams is not imported");

    // A second front-end for a system that already works — not a second system.
    assert.match(panel, /fetch\("\/api\/portal\/dev-team\/findings"/);
    assert.match(panel, /action: "create"/);
    assert.match(panel, /images: draft\.shots/);
    for (const severity of ["blocker", "bug", "polish", "idea"]) {
      assert.match(panel, new RegExp(`value: "${severity}"`), `${severity} is offered`);
    }

    // Upload is the named path; drop and paste come along with it.
    assert.match(panel, /type="file"[\s\S]{0,120}accept="image\/\*"[\s\S]{0,60}multiple/, "upload a screenshot");
    assert.match(panel, /addEventListener\("paste", onPaste\)/, "paste a screenshot");
    assert.match(panel, /onDrop=\{event =>/, "drop a screenshot");
    assert.match(panel, /readAsDataURL/);

    // Capture must be faster than the thought — the console opens ready to type.
    assert.match(panel, /titleRef\.current\?\.focus\(\)/);
  });

  it("a half-written finding survives the popover closing", () => {
    // The failure this feature exists to prevent is losing the thought. The
    // panel unmounts on close (same as its neighbours), so the draft cannot
    // live in it.
    const button = read("src/components/chrome/DevConsoleButton.tsx");
    assert.match(button, /const \[draft, setDraft\] = useState<FindingDraft>\(EMPTY_DRAFT\)/, "the draft lives in the always-mounted button");
    assert.match(button, /draft=\{draft\}/);
    assert.match(button, /onDraftChange=\{setDraft\}/);
    assert.match(button, /unsaved \?/, "an unsaved capture is visible on the icon");

    const panel = read("src/components/chrome/DevConsolePanel.tsx");
    assert.doesNotMatch(panel, /useState<FindingDraft>/, "the panel must not own the draft — it unmounts");
    // Several screenshots resolve at once; a value-setter would drop all but one.
    assert.match(panel, /onDraftChange: Dispatch<SetStateAction<FindingDraft>>/);
    assert.match(panel, /onDraftChange\(previous =>/);
  });

  it("a capture drops the cached badge so the count moves immediately", () => {
    const route = read("src/app/api/portal/dev-team/findings/route.ts");
    assert.match(route, /invalidateDevConsoleBadge\(\)/, "the badge is TTL-cached; a create must clear it");
  });

  it("opening the workspace plays the cinematic without changing who you are", () => {
    const panel = read("src/components/chrome/DevConsolePanel.tsx");
    assert.match(panel, /DEV_MODE_LOADIN_KEY, DEV_MODE_LOADIN_WORKSPACE/, "reuses the shared key — no magic-string drift");
    assert.match(panel, /sessionStorage\.setItem\(DEV_MODE_LOADIN_KEY, DEV_MODE_LOADIN_WORKSPACE\)/);
    // A real document navigation, because DevModeLoadIn reads the one-shot flag
    // when it MOUNTS — and it lives in the persistent /portal layout, which a
    // client-side transition never remounts.
    assert.match(panel, /<a\s+href="\/portal\/dev-team"/);
    assert.match(panel, /event\.metaKey \|\| event\.ctrlKey/, "a modifier click opens a tab; don't arm this one");
    // Performance mode is honoured by reuse, not re-implemented.
    assert.doesNotMatch(panel, /performanceModeEnabled/);
    assert.match(read("src/components/chrome/DevModeLoadIn.tsx"), /!cinematicModeEnabled\(\) \|\| reducedMotionPreferred\(\)/);
  });

  it("the panel shows live status and links to the workspace, without changing identity", () => {
    const panel = read("src/components/chrome/DevConsolePanel.tsx");
    // Both halves come from the gated route — and the fast one must actually
    // ask for the cheap part, or the "paints immediately" claim is fiction.
    assert.match(panel, /"\/api\/portal\/dev-team\/console\?part=core"/, "the fast read asks for the core part");
    assert.match(panel, /"\/api\/portal\/dev-team\/console"/, "the full read asks the same gated route");
    // "Both in flight together" moved to `devConsoleLoad.ts` when the load rules
    // were lifted out of the component so they could be DRIVEN rather than
    // grepped — smoke-dev-console-edges.test.ts now proves it by starting a load
    // and checking both parts were requested before either resolved.
    assert.match(
      read("src/components/chrome/devConsoleLoad.ts"),
      /read\("core"\)[\s\S]{0,400}read\("full"\)/,
      "both are in flight together, not chained",
    );
    for (const label of ["Findings", "Blockers", "Working now", "Open launch blockers", "Open Dev Team workspace"]) {
      assert.match(panel, new RegExp(label));
    }
    // Entering the workspace is plain navigation. Minting a session here would
    // re-open the privilege-escalation hole the Inspector fix closed.
    assert.match(panel, /href="\/portal\/dev-team"/);
    assert.doesNotMatch(panel, /api\/auth\/dev-mode/, "the console never mints a session");
  });
});

describe("Dev Console — the Command Centre station", () => {
  const station = () => read("src/app/portal/agency/_DevTeamStation.tsx");

  it("shows queues, not just counts — and every row goes somewhere", () => {
    const source = station();
    for (const queue of ["Findings awaiting review", "Blocked", "Working right now", "Shipped recently"]) {
      assert.match(source, new RegExp(queue), `the ${queue} queue is present`);
    }
    // Rows are links into the real surface, not decoration.
    assert.match(source, /function QueueRow\(/);
    assert.match(source, /<Link href=\{href\}/);
    assert.match(source, /function docHref\(relPath\?: string\)/);
    assert.match(source, /\/portal\/dev-team\/library\?doc=\$\{encodeURIComponent\(relPath\)\}/, "a plan opens in the Library, same as the working board");
    // The lane tiles used to be dead numbers.
    assert.match(source, /function LaneStat\([\s\S]{0,400}<Link href=\{href\}/, "lane tiles click through too");
    // A truncated queue says so rather than quietly hiding work.
    assert.match(source, /\{count - rows\.length\} more/);
  });

  it("keeps every number sourced — no estimates, no new scanning", () => {
    const source = station();
    assert.match(source, /composeLanes, scanDevTeamBoard/, "lanes come from the shared board model");
    assert.match(source, /listFindings/, "findings come from the findings store");
    assert.match(source, /blockers\.filter\(blocker => !blocker\.resolved\)/);
    assert.match(source, /findings\.filter\(finding => finding\.status === "open"\)/);

    // The station and the topbar console must not quote different worker counts
    // at each other: same reader, same PREDICATE.
    //
    // This used to pin `checkIn.at >= cutoff` — the window alone — which is
    // exactly half the rule. A worker signs off by writing "done" in its phase,
    // and the window says nothing about that, so the station counted finished
    // workers as live while the page it links to did not: "Working now: 5" one
    // click from "Nobody working right now". `isCheckInActive` owns both halves.
    assert.match(source, /readCheckIns/, "live check-ins, not the hand-maintained workers table");
    assert.match(source, /isCheckInActive/, "the shared predicate, not a re-implemented window");
    assert.doesNotMatch(
      source,
      /checkIn\.at >= cutoff/,
      "re-implementing the window drops the signed-off half of the rule",
    );

    // This station is BUILT on every dashboard load (streamed, but built), so it
    // must stay off the reader that walks src/ + scripts/ + docs/.
    const uses = imported(source);
    assert.ok(!uses.has("scanWorkerSignals"), "the working-tree walk must not run on the dashboard path");
    assert.ok(!uses.has("devConsoleStatus"), "…nor via the console's slow read");
  });

  it("wears the Radar command-centre language", () => {
    const source = station();
    const radar = read("src/app/portal/agency/_InfraHealthPanel.tsx");
    assert.match(source, /bg-\[#020b11\]/, "the deep command ground");
    assert.match(source, /border-\[#62e8ff\]\/30/, "the instrument frame");
    assert.match(source, /linear-gradient\(rgba\(98,232,255,\.035\)/, "the grid overlay");
    // The accents are shared with Radar's own panels, not invented here.
    for (const accent of [/#62e8ff/, /#68f5d0/]) {
      assert.match(source, accent);
      assert.match(radar, accent);
    }
  });

  it("still hands off to the workspace, and still gates upstream", () => {
    const source = station();
    assert.match(source, /href="\/portal\/dev-team"/);
    assert.match(source, /Open the workspace/);
    // The station never gates itself — page.tsx decides whether it exists at all.
    assert.ok(!imported(source).has("devDocsAccessible"), "the gate lives upstream, in page.tsx");
    assert.match(read("src/app/portal/agency/page.tsx"), /devTeamVisible = devTeamAccessible\(session\)/);
    assert.match(read("src/app/portal/agency/page.tsx"), /resolveServerCommandStation\(resolvedSearchParams\?\.station, devTeamVisible\)/, "the server rejects a hand-typed Dev Team station for anyone else");
    assert.match(read("src/app/portal/agency/page.tsx"), /requestedServerStation === "devteam"[\s\S]{0,180}await import\("\.\/_DevTeamStation"\)/, "the node is constructed only for an authorised explicit station request");
  });
});
