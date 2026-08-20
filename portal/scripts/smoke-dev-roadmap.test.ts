import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseRoadmap,
  parseRoadmapDoc,
  renderRoadmap,
  daysUntil,
  normaliseTarget,
  itemId,
  buildRoadmap,
  roadmapPath,
  ROADMAP_REL_PATH,
} from "../src/lib/server/devTeamRoadmap";

/**
 * Drive the REAL write path against a temp copy.
 *
 * These tests used to snapshot `docs/development/roadmap.md`, mutate it and
 * restore it in a `finally`. Two ways that bites: a killed test process leaves
 * a phantom item in the roadmap every worker reads, and any legitimate write
 * landing inside the ~1s window is reverted wholesale by the restore. The
 * module resolves its path per call, so an env var is enough to isolate it.
 */
async function withTempRoadmap<T>(
  markdown: string, run: (path: string) => Promise<T>,
): Promise<T> {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = await mkdtemp(join(tmpdir(), "aqua-roadmap-smoke-"));
  const path = join(dir, "roadmap.md");
  await writeFile(path, markdown, "utf8");
  const previous = process.env.PORTAL_ROADMAP_FILE;
  process.env.PORTAL_ROADMAP_FILE = path;
  try {
    return await run(path);
  } finally {
    if (previous === undefined) delete process.env.PORTAL_ROADMAP_FILE;
    else process.env.PORTAL_ROADMAP_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

/** The real roadmap's text — read only, never written by these tests. */
async function realRoadmap(): Promise<{ path: string; text: string }> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");
  const path = join(PROJECT_ROOT, "docs", "development", "roadmap.md");
  return { path, text: await readFile(path, "utf8") };
}

// The roadmap is the outer view: item → plans → phases → tasks. These pin the
// two things that would silently rot it — a parse/render round trip that loses
// a field, and a progress number that is typed rather than computed.

const SAMPLE = `# Roadmap

Preamble that must be ignored.

---

## Now
_In flight._

### First outcome
**Id:** first-outcome · **Status:** building · **Target:** 2026-08-22 · **Size:** M · **Owner:** alice · **Added:** 2026-08-20 · **Source:** ed
**Plans:** plan-one, plan-two
**Why:** Because it matters.

A free note under the item.

### Second outcome
**Id:** second-outcome · **Status:** planned · **Target:** 2026-09

---

## Shipped
_Done._

### Old thing
**Id:** old-thing · **Status:** shipped · **Shipped:** 2026-08-19
`;

test("parses items, and the ## section sets the horizon", () => {
  const items = parseRoadmap(SAMPLE);
  assert.equal(items.length, 3);

  const [first, second, old] = items;
  assert.equal(first.id, "first-outcome");
  assert.equal(first.title, "First outcome");
  assert.equal(first.horizon, "now");
  assert.equal(first.status, "building");
  assert.equal(first.target, "2026-08-22");
  assert.equal(first.size, "M");
  assert.equal(first.owner, "alice");
  assert.equal(first.source, "ed");
  assert.deepEqual(first.plans, ["plan-one", "plan-two"]);
  assert.equal(first.why, "Because it matters.");
  assert.equal(first.notes, "A free note under the item.");

  // A bare item still parses, and inherits the section's horizon.
  assert.equal(second.horizon, "now");
  assert.deepEqual(second.plans, []);
  assert.equal(second.target, "2026-09");

  assert.equal(old.horizon, "shipped");
  assert.equal(old.shippedOn, "2026-08-19");
});

test("render → parse round-trips every field", () => {
  const items = parseRoadmap(SAMPLE);
  const again = parseRoadmap(renderRoadmap(items));
  assert.deepEqual(again, items);
});

test("hyphens survive cleaning — a mangled control-char class would eat them", () => {
  const items = parseRoadmap(`## Now\n### X\n**Id:** dev-console-topbar\n**Plans:** dev-console-topbar\n`);
  assert.equal(items[0].id, "dev-console-topbar");
  assert.deepEqual(items[0].plans, ["dev-console-topbar"]);
});

test("duplicate ids are made unique — one edit must not hit two items", () => {
  const items = parseRoadmap(`## Now\n### A\n**Id:** same\n\n### B\n**Id:** same\n`);
  assert.equal(items[0].id, "same");
  assert.equal(items[1].id, "same-2");
});

test("a month target means the END of that month, not the 1st", () => {
  const sept1 = Date.parse("2026-09-01T09:00:00Z");
  assert.equal(daysUntil("2026-09", sept1), 29); // 30 Sept
  assert.equal(daysUntil("2026-09-01", sept1), 0);
  assert.equal(daysUntil("2026-08-30", sept1), -2); // overdue
});

test("a target must be a real date shape", () => {
  assert.equal(normaliseTarget("2026-09-04"), "2026-09-04");
  assert.equal(normaliseTarget("2026-09"), "2026-09");
  assert.equal(normaliseTarget(""), undefined);
  assert.throws(() => normaliseTarget("next tuesday"), /date/i);
});

test("itemId is a filesystem-safe slug", () => {
  assert.equal(itemId("Launch-safe — the three blocker fixes"), "launch-safe-the-three-blocker-fixes");
});

test("the real roadmap loads, and progress is COMPUTED from tasks not typed", async () => {
  const roadmap = await buildRoadmap(Date.parse("2026-08-20T12:00:00Z"));
  assert.ok(roadmap.items.length > 0, `${ROADMAP_REL_PATH} should hold items`);

  for (const item of roadmap.items) {
    // The percentage must be derivable from the task counts under its plans —
    // never a number someone wrote in the markdown.
    const expected = item.total > 0
      ? Math.round((item.done / item.total) * 100)
      : item.status === "shipped" ? 100 : 0;
    assert.equal(item.pct, expected, `${item.id} pct must come from its tasks`);
    assert.ok(item.done <= item.total, `${item.id} cannot have more done than it has`);
    // Every plan named on the roadmap must be a plan that actually exists.
    for (const plan of item.planLinks) {
      assert.ok(plan.exists, `${item.id} names a plan that does not exist: ${plan.name}`);
    }
  }

  // A shipped item never sits in a live horizon.
  for (const item of roadmap.items) {
    if (item.status === "shipped") assert.equal(item.horizon, "shipped", `${item.id} is shipped but filed under ${item.horizon}`);
  }

  // The schedule is dated, unshipped, and in the order things actually fall
  // due. NOT `deepEqual(dates, [...dates].sort())` — that re-applied the same
  // comparator to its own output and so could never fail.
  const due = roadmap.schedule.map(s => s.dueInDays!);
  assert.deepEqual(due, [...due].sort((a, b) => a - b), "the schedule is not in due order");
  assert.ok(roadmap.schedule.every(s => s.status !== "shipped"));
});

// ---- the write path --------------------------------------------------------
//
// These drive the real `addItem`/`updateItem`/`linkPlan`, because the failure
// that matters is a write that corrupts the markdown the workers read — but
// against a COPY of the real file, so a killed run or a concurrent save by
// anybody else cannot lose work.

test("add → update → ship writes real markdown, and never touches the shared file", async () => {
  const { readFile } = await import("node:fs/promises");
  const { addItem, updateItem, linkPlan, readItems } =
    await import("../src/lib/server/devTeamRoadmap");

  const real = await realRoadmap();
  const before = real.text;
  const beforeItems = parseRoadmap(before);

  await withTempRoadmap(before, async path => {
    const added = await addItem({
      title: "Smoke test outcome",
      why: "Proves the write path — removed immediately.",
      horizon: "next",
      target: "2026-09-04",
      size: "S",
    }, Date.parse("2026-08-20T10:00:00Z"));
    assert.equal(added.id, "smoke-test-outcome");
    assert.equal(added.added, "2026-08-20");

    let items = await readItems();
    assert.equal(items.length, beforeItems.length + 1, "the item must be on disk");
    const onDisk = items.find(i => i.id === "smoke-test-outcome");
    assert.equal(onDisk?.horizon, "next");
    assert.equal(onDisk?.target, "2026-09-04");
    assert.equal(onDisk?.why, "Proves the write path — removed immediately.");

    // Every pre-existing item must survive a write untouched.
    for (const original of beforeItems) {
      assert.deepEqual(items.find(i => i.id === original.id), original, `${original.id} changed on write`);
    }

    // Linking a plan promotes an idea to planned.
    const linked = await linkPlan("smoke-test-outcome", "radar-upgrade.md");
    assert.deepEqual(linked.plans, ["radar-upgrade"], "the .md suffix must be stripped");
    assert.equal(linked.status, "planned");

    // Shipping moves the item AND stamps the date — no shipped item may sit in
    // a live horizon.
    const shipped = await updateItem(
      { id: "smoke-test-outcome", status: "shipped" },
      Date.parse("2026-08-21T10:00:00Z"),
    );
    assert.equal(shipped.horizon, "shipped");
    assert.equal(shipped.shippedOn, "2026-08-21");

    // Un-shipping puts it back in play and clears the date.
    const reopened = await updateItem({ id: "smoke-test-outcome", status: "building" });
    assert.equal(reopened.horizon, "now");
    assert.equal(reopened.shippedOn, undefined);

    // A bad date is refused rather than stored.
    await assert.rejects(
      () => updateItem({ id: "smoke-test-outcome", target: "soon" }),
      /date/i,
    );

    // Clearing the target is possible.
    const cleared = await updateItem({ id: "smoke-test-outcome", target: "" });
    assert.equal(cleared.target, undefined);

    items = await readItems();
    assert.equal(items.filter(i => i.id === "smoke-test-outcome").length, 1, "no duplicate items");

    // The writes landed on the COPY, not on the file the workers read.
    assert.notEqual(path, real.path);
    assert.equal(roadmapPath(), path, "the module did not honour the path override");
    assert.match(await readFile(path, "utf8"), /Smoke test outcome/);
  });

  assert.equal(
    (await readFile(real.path, "utf8")), before,
    "the shared roadmap must not be written by the smoke suite at all",
  );
});

test("an unknown item is refused, not silently created", async () => {
  const { updateItem } = await import("../src/lib/server/devTeamRoadmap");
  await assert.rejects(() => updateItem({ id: "no-such-item", status: "shipped" }), /no longer exists/i);
});

// ---- the phase parser the roadmap counts on ---------------------------------
//
// The roadmap's percentages are only as honest as the phases underneath them.
// This pins the bug that made them wrong: a `## Phases` section that ran past
// its `###` sub-sections and swallowed every later numbered list in the plan.

test("a Phases section stops at the next heading of ANY level", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "# Plan — X",
    "## Phases",
    "1. **First.** Does a thing.",
    "2. **Second.** Does another.",
    "### A sub-section, not a phase",
    "1. A matcher rule that must NOT be counted.",
    "2. Another one.",
    "## Done when",
    "1. Also not a phase.",
  ].join("\n");
  assert.deepEqual(parsePhases(md).map(p => p.number), ["1", "2"]);
});

test("no plan produces two tasks with the same id", async () => {
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");
  for (const plan of await scanTasks()) {
    const ids = plan.tasks.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, `${plan.planName} has duplicate task ids`);
  }
});

// ---- local time, not UTC ----------------------------------------------------
//
// A finding captured at 00:28 BST was written as "2026-08-20 00:28" and FILED
// under the wrong day, in its filename too, because every stamp went through
// toISOString(). Caught by browser-verifying findings capture at 01:28 local.

test("day and minute stamps follow the server's timezone, not UTC", async () => {
  const { localDay, localStamp } = await import("../src/lib/server/devLocalTime");
  // 00:28 BST on the 20th is 23:28 UTC on the 19th — the exact case that broke.
  const justAfterMidnightBst = Date.parse("2026-08-19T23:28:00Z");
  const d = new Date(justAfterMidnightBst);
  const expectedDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(localDay(justAfterMidnightBst), expectedDay);
  assert.equal(
    localStamp(justAfterMidnightBst),
    `${expectedDay} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  );
  // And it must differ from the UTC rendering whenever the offset is non-zero.
  if (d.getTimezoneOffset() !== 0) {
    assert.notEqual(localDay(justAfterMidnightBst), new Date(justAfterMidnightBst).toISOString().slice(0, 10));
  }
});

test("nothing in the Dev Console stamps a human-facing date in UTC", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");
  for (const rel of [
    "src/lib/server/devTeamFindings.ts",
    "src/lib/server/devTeamPlans.ts",
    "src/lib/server/devTeamRoadmap.ts",
  ]) {
    const source = await readFile(join(PROJECT_ROOT, rel), "utf8");
    assert.doesNotMatch(source, /toISOString\(\)\.slice/, `${rel} still stamps a date in UTC — use devLocalTime`);
  }
});

test("markdown emphasis never leaks into a parsed title", async () => {
  const { parsePhases } = await import("../src/lib/server/devTeamTasks");
  const md = [
    "## Phases",
    "1. _(First slice — the placeholder a UI-authored plan ships with.)_",
    "2. **Bold lead.** With `code` and *stars*.",
    "3. Keeps snake_case_identifiers intact.",
  ].join("\n");
  const titles = parsePhases(md).map(p => p.title);
  assert.doesNotMatch(titles[0], /^_|_$/, "underscore emphasis leaked into the title");
  assert.match(titles[0], /^\(First slice/);
  assert.doesNotMatch(titles[1], /[`*]/, "backticks or stars leaked into the title");
  assert.match(titles[2], /snake_case_identifiers/, "a snake_case identifier must keep its underscores");
});

// ---- the two defects the Dev Console audit proved ---------------------------

test("two simultaneous writes BOTH land — neither is silently lost", async () => {
  const { addItem, readItems, removeItem } = await import("../src/lib/server/devTeamRoadmap");

  const before = (await realRoadmap()).text;
  const startCount = parseRoadmap(before).length;

  await withTempRoadmap(before, async () => {
    // Every mutation is read-modify-write over the whole file. Before this was
    // serialised, Promise.all moved the count by ONE while both calls resolved
    // with {ok:true} — the UI showed success for an item that never existed.
    const [a, b] = await Promise.all([
      addItem({ title: "Race probe alpha", horizon: "someday" }),
      addItem({ title: "Race probe bravo", horizon: "someday" }),
    ]);
    const after = await readItems();
    assert.equal(after.length, startCount + 2, "a concurrent write was lost");
    assert.ok(after.some(i => i.id === a.id), "the first concurrent write is missing from disk");
    assert.ok(after.some(i => i.id === b.id), "the second concurrent write is missing from disk");

    // A concurrent update and delete must both take effect, not clobber.
    const [, removed] = await Promise.all([
      (async () => (await import("../src/lib/server/devTeamRoadmap")).updateItem({ id: a.id, status: "building" }))(),
      removeItem(b.id),
    ]);
    const settled = await readItems();
    assert.equal(removed.removed.id, b.id);
    assert.ok(!settled.some(i => i.id === b.id), "the delete was clobbered by the concurrent update");
    assert.equal(settled.find(i => i.id === a.id)?.status, "building", "the update was clobbered by the concurrent delete");

    await removeItem(a.id);
  });
});

test("a hand-written bold line in a note survives the next write", () => {
  // The page tells Ed the roadmap is his to edit in the Library. The pair
  // scanner used to consume ANY `**Word:**` line and drop it, so a note like
  // "**Blocked by:** …" vanished the next time any other item was touched.
  const md = [
    "## Next",
    "### Alpha",
    "**Id:** alpha · **Status:** building",
    "**Why:** it matters.",
    "",
    "**Blocked by:** the auth rewrite lands first.",
    "Ordinary prose that was always fine.",
  ].join("\n");

  const parsed = parseRoadmap(md);
  assert.equal(parsed.length, 1);
  assert.match(parsed[0].notes ?? "", /Blocked by:\*\* the auth rewrite lands first\./);
  assert.match(parsed[0].notes ?? "", /Ordinary prose/);
  // And it must still be there after a full render → parse round trip.
  assert.match(renderRoadmap(parsed), /the auth rewrite lands first/);
  assert.match(parseRoadmap(renderRoadmap(parsed))[0].notes ?? "", /the auth rewrite lands first/);
  // The real meta line is still parsed, not treated as prose.
  assert.equal(parsed[0].status, "building");
  assert.equal(parsed[0].why, "it matters.");
});

// ---- file maps + collision detection ----------------------------------------

test("an item's file map round-trips through parse and render", () => {
  const md = [
    "## Now",
    "### Alpha",
    "**Id:** alpha · **Status:** building",
    "**Plans:** plan-one",
    "**Files:** src/lib/server/a.ts, src/app/portal/x/**, scripts/smoke-a.test.ts",
  ].join("\n");
  const [item] = parseRoadmap(md);
  assert.deepEqual(item.files, ["src/lib/server/a.ts", "src/app/portal/x/**", "scripts/smoke-a.test.ts"]);
  const again = parseRoadmap(renderRoadmap([item]))[0];
  assert.deepEqual(again.files, item.files, "the file map was lost on a write");
  assert.deepEqual(again.plans, ["plan-one"], "Files: must not swallow the Plans: line");
});

test("two items claiming the same file collide, and a glob counts as a claim", async () => {
  const { findCollisions } = await import("../src/lib/server/devTeamRoadmap");
  const base = { planLinks: [], done: 0, total: 0, pct: 0, workers: [], plans: [], horizon: "now" as const };
  const items = [
    { ...base, id: "one", title: "One", status: "building" as const, files: ["src/server/storage.ts", "src/app/portal/dev-team/**"] },
    { ...base, id: "two", title: "Two", status: "building" as const, files: ["src/app/portal/dev-team/roadmap/page.tsx"] },
    { ...base, id: "three", title: "Three", status: "parked" as const, files: ["src/server/storage.ts"] },
    { ...base, id: "four", title: "Four", status: "building" as const, files: ["src/lib/untouched.ts"] },
  ];
  const collisions = findCollisions(items as never);

  // The glob must catch the specific file underneath it.
  const oneTwo = collisions.find(c => c.between.includes("one") && c.between.includes("two"));
  assert.ok(oneTwo, "a `dir/**` claim must collide with a file inside that dir");
  assert.equal(oneTwo!.bothLive, true);

  // A live item overlapping a PARKED one is reported but not dangerous.
  const oneThree = collisions.find(c => c.between.includes("one") && c.between.includes("three"));
  assert.ok(oneThree, "an exact shared file must be reported");
  assert.equal(oneThree!.bothLive, false, "parked work is not a live collision");

  // Dangerous ones sort first, and an unrelated item never appears.
  assert.equal(collisions[0].bothLive, true);
  assert.ok(!collisions.some(c => c.between.includes("four")), "an item sharing nothing must not collide");
});

// ---- what a wholesale rewrite destroys --------------------------------------
//
// `renderRoadmap` regenerates the file from scratch on EVERY write, so anything
// the parser does not capture is gone the next time any unrelated item is
// touched. The page tells Ed the file is his to hand-edit in the Library.

test("a hand-written header survives — the parser captures it, the renderer emits it", () => {
  const md = [
    "# Roadmap",
    "",
    "> Ed's note: read the Q4 memo before touching Now.",
    "",
    "---",
    "",
    "## Now",
    "_In flight._",
    "",
    "### Alpha",
    "**Id:** alpha · **Status:** building",
  ].join("\n");

  const doc = parseRoadmapDoc(md);
  assert.match(doc.preamble ?? "", /Q4 memo/, "the header above the first horizon was not captured");
  assert.equal(doc.items.length, 1);

  // The rewrite must carry it through — this is the exact assertion that failed
  // before: renderRoadmap replaced the whole header with its built-in constant.
  const written = renderRoadmap(doc.items, doc.preamble);
  assert.ok(written.includes("Q4 memo"), "an unrelated write destroyed the hand-written header");

  // And it must be STABLE: rewriting twice must not grow or drop anything.
  const twice = parseRoadmapDoc(written);
  assert.equal(renderRoadmap(twice.items, twice.preamble), written, "the header churns on every write");
});

test("a real add/update/delete preserves the header the file already had", async () => {
  const { readFile } = await import("node:fs/promises");
  const { addItem, updateItem, removeItem } = await import("../src/lib/server/devTeamRoadmap");

  const source = (await realRoadmap()).text.replace(
    "# Roadmap\n",
    "# Roadmap\n\n> Ed's note: read the Q4 memo before touching Now.\n",
  );
  assert.ok(source.includes("Q4 memo"), "fixture did not take");

  await withTempRoadmap(source, async path => {
    const item = await addItem({ title: "Header probe", horizon: "someday" });
    assert.match(await readFile(path, "utf8"), /Q4 memo/, "adding an item destroyed the header");

    await updateItem({ id: item.id, status: "building" });
    assert.match(await readFile(path, "utf8"), /Q4 memo/, "editing an item destroyed the header");

    await removeItem(item.id);
    const final = await readFile(path, "utf8");
    assert.match(final, /Q4 memo/, "removing an item destroyed the header");
    // Exactly once — a preserved header must not be duplicated alongside the
    // built-in one, or it doubles on every single write.
    assert.equal(final.split("Q4 memo").length - 1, 1, "the header was duplicated");
    assert.equal(final.split(/^# Roadmap$/m).length - 1, 1, "the title was duplicated");
  });
});

test("a file with no header at all still gets the built-in one", () => {
  const md = "## Now\n### Alpha\n**Id:** alpha · **Status:** building\n";
  assert.equal(parseRoadmapDoc(md).preamble, undefined);
  assert.match(renderRoadmap(parseRoadmap(md)), /^# Roadmap\n/);
});

// ---- date order --------------------------------------------------------------
//
// A month target means the END of that month, so `2026-09` falls due AFTER
// `2026-09-04` — but it sorts before it as a string. The schedule strip is the
// one surface whose job is to say what is next.

test("a month target sorts by when it is due, not by its string", async () => {
  const md = [
    "# Roadmap",
    "",
    "---",
    "",
    "## Next",
    "_Queued._",
    "",
    "### End of September thing",
    "**Id:** month-target · **Status:** planned · **Target:** 2026-09",
    "",
    "### Fourth of September thing",
    "**Id:** day-target · **Status:** planned · **Target:** 2026-09-04",
  ].join("\n");

  await withTempRoadmap(md, async () => {
    const roadmap = await buildRoadmap(Date.parse("2026-08-20T12:00:00Z"));

    // The countdowns, to make the ordering claim concrete.
    const byId = new Map(roadmap.items.map(i => [i.id, i]));
    assert.equal(byId.get("day-target")!.dueInDays, 15);
    assert.equal(byId.get("month-target")!.dueInDays, 41);

    // Sorting on the raw string printed 41 above 15 — "end of Sep · in 6 weeks"
    // sitting above "4 Sep · in 15 days".
    assert.deepEqual(
      roadmap.schedule.map(s => s.id), ["day-target", "month-target"],
      "the schedule printed a later item above an earlier one",
    );
    assert.deepEqual(roadmap.schedule.map(s => s.dueInDays), [15, 41]);

    // The horizon lane has the same bug and the same fix.
    assert.deepEqual(
      roadmap.byHorizon.next.map(s => s.id), ["day-target", "month-target"],
      "the Next lane printed a later item above an earlier one",
    );
  });
});

// ---- plan links --------------------------------------------------------------

test("a plan named twice is stored once — a repeat used to multiply the task count", async () => {
  const { addItem, updateItem, linkPlan, readItems } = await import("../src/lib/server/devTeamRoadmap");
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");

  // A real plan with real phases, so the multiplication is measurable.
  const [plan] = (await scanTasks()).filter(p => p.total > 0);
  assert.ok(plan, "no plan with phases to measure against");

  await withTempRoadmap("# Roadmap\n\n---\n\n## Now\n_In flight._\n", async () => {
    // Exactly what the AddItem field produces from typing `x, x` — it splits on
    // comma with no dedupe.
    const added = await addItem({
      title: "Dedupe probe",
      horizon: "now",
      status: "building",
      plans: [plan.planName, plan.planName, plan.planName.toUpperCase()],
    });
    assert.deepEqual(added.plans, [plan.planName], "a repeated plan name was stored more than once");

    const roadmap = await buildRoadmap(Date.parse("2026-08-20T12:00:00Z"));
    const view = roadmap.items.find(i => i.id === added.id)!;
    assert.equal(view.total, plan.total, "the task total was multiplied by a repeated plan name");
    assert.equal(view.done, plan.done);
    assert.equal(view.planLinks.length, 1, "duplicate planLinks collide on their React key");
    assert.ok(view.pct <= 100);

    // The same rule on the update path…
    const updated = await updateItem({ id: added.id, plans: [plan.planName, plan.planName] });
    assert.deepEqual(updated.plans, [plan.planName]);

    // …and on linkPlan, which used an exact-case `includes` and had no cap.
    const relinked = await linkPlan(added.id, `${plan.planName.toUpperCase()}.md`);
    assert.deepEqual(relinked.plans, [plan.planName], "linkPlan re-added a plan under a different case");

    for (let n = 0; n < 15; n += 1) await linkPlan(added.id, `filler-plan-${n}`);
    const capped = (await readItems()).find(i => i.id === added.id)!;
    assert.ok(capped.plans.length <= 12, `linkPlan stored ${capped.plans.length} plans, past the 12 cap`);
  });
});

test("a duplicate in the FILE is collapsed on read, not summed", () => {
  const [item] = parseRoadmap([
    "## Now",
    "### Alpha",
    "**Id:** alpha · **Status:** building",
    "**Plans:** plan-one, plan-one, Plan-One, plan-two",
  ].join("\n"));
  assert.deepEqual(item.plans, ["plan-one", "plan-two"]);
});

// ---- a plan name that matches nothing ----------------------------------------

test("a plan that does not exist is carried as missing, not silently dropped", async () => {
  const { addItem } = await import("../src/lib/server/devTeamRoadmap");
  const { scanTasks } = await import("../src/lib/server/devTeamTasks");
  const [plan] = (await scanTasks()).filter(p => p.total > 0 && p.done === p.total);

  await withTempRoadmap("# Roadmap\n\n---\n\n## Now\n_In flight._\n", async () => {
    const added = await addItem({
      title: "Typo probe",
      horizon: "now",
      status: "building",
      plans: plan ? [plan.planName, "definitely-not-a-plan-9f3a"] : ["definitely-not-a-plan-9f3a"],
    });

    const roadmap = await buildRoadmap(Date.parse("2026-08-20T12:00:00Z"));
    const view = roadmap.items.find(i => i.id === added.id)!;

    // The unresolved name reaches the view, so the COLLAPSED card and the
    // schedule can say so. It used to exist only as a red line inside the
    // expanded panel, where nobody looking at a full green bar would see it.
    assert.deepEqual(view.missingPlans, ["definitely-not-a-plan-9f3a"]);
    if (plan) {
      // …and this is the case that read as 100% done with half of it unaccounted for.
      assert.equal(view.pct, 100);
      assert.ok(view.missingPlans.length > 0, "nothing on the view flags the unaccounted plan");
    }
  });
});

test("the roadmap UI never draws a progress bar for an item with an unresolved plan", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");
  const source = await readFile(
    join(PROJECT_ROOT, "src/app/portal/dev-team/roadmap/_RoadmapWorkspace.tsx"), "utf8",
  );
  // Both bars — the card's and the schedule strip's — are behind the check.
  assert.match(source, /unresolved === 0 \?/, "the card bar is not gated on unresolved plans");
  assert.match(source, /item\.missingPlans\.length > 0 \?/, "the schedule bar is not gated on unresolved plans");
});

// ---- the meta-line separator -------------------------------------------------

test("a '·' inside a value does not truncate it on the next write", () => {
  const item = {
    id: "alpha", title: "Alpha", horizon: "now" as const, status: "building" as const,
    owner: "alice · bob", source: "worker · money", plans: [],
  };
  // The pair scanner reads a value as `[^·]*`, so an in-band separator used to
  // drop everything after it: owner came back as "alice" and "bob" was gone.
  const [again] = parseRoadmap(renderRoadmap([item]));
  assert.match(again.owner ?? "", /bob/, "the owner lost everything after the separator");
  assert.match(again.source ?? "", /money/, "the source lost everything after the separator");
  assert.equal(again.status, "building", "the meta line stopped parsing");
});

test("the write path stores the value it will be able to read back", async () => {
  const { addItem, readItems } = await import("../src/lib/server/devTeamRoadmap");
  await withTempRoadmap("# Roadmap\n\n---\n\n## Now\n_In flight._\n", async () => {
    const added = await addItem({ title: "Separator probe", horizon: "now", owner: "alice · bob" });
    // What the API hands back must be what is on disk — not a value the file
    // cannot represent.
    const onDisk = (await readItems()).find(i => i.id === added.id);
    assert.equal(onDisk?.owner, added.owner);
    assert.match(added.owner ?? "", /bob/);
  });
});

// ---- the API gate ------------------------------------------------------------
//
// The real gate cannot be driven in-process: `requireRole` → `getSession()`
// reads `cookies()` from next/headers, which needs a request scope. So this
// pins the SHAPE — every verb gated before it touches anything — and the live
// gate is confirmed by the browser walk.

test("every verb on the roadmap API gates before it reads or writes", async () => {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");

  const source = await readFile(
    join(PROJECT_ROOT, "src/app/api/portal/dev-team/roadmap/route.ts"), "utf8",
  );

  // The gate itself must still be role + dev-docs, not one or the other.
  assert.match(source, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/, "the gate no longer asserts an agency role");
  assert.match(source, /devDocsAccessible\(session\)/, "the gate no longer asserts Dev Mode access");

  const verbs = ["GET", "POST", "PATCH", "DELETE"];
  const declared = [...source.matchAll(/export async function (GET|POST|PATCH|DELETE)\b/g)].map(m => m[1]);
  assert.deepEqual([...declared].sort(), [...verbs].sort(), "a verb was added or removed without a gate check");

  const starts = verbs.map(v => ({ verb: v, at: source.indexOf(`export async function ${v}`) }));
  for (const { verb, at } of starts) {
    const end = Math.min(...starts.map(s => s.at).filter(i => i > at), source.length);
    const body = source.slice(at, end);

    const gateAt = body.indexOf("await gate()");
    assert.ok(gateAt >= 0, `${verb} does not call gate() — any agency user could reach it`);
    assert.match(body.slice(gateAt - 20, gateAt + 20), /if \(!await gate\(\)\)/, `${verb} calls gate() but ignores it`);

    // And it must gate FIRST — a gate after the mutation protects nothing.
    for (const call of ["addItem(", "updateItem(", "removeItem(", "linkPlan(", "createPlan(", "buildRoadmap(", "request.json("]) {
      const useAt = body.indexOf(call);
      if (useAt < 0) continue;
      assert.ok(useAt > gateAt, `${verb} reaches ${call} before it gates`);
    }
  }
});

test("rewriting the REAL roadmap changes not one byte", async () => {
  // The strongest statement that a write is lossless: parse the file every
  // worker reads, render it straight back, and get the same bytes. Anything the
  // parser drops or the renderer invents shows up here as a diff — including a
  // header that got replaced by the built-in constant, or a `---` that grows.
  const { text } = await realRoadmap();
  const doc = parseRoadmapDoc(text);
  assert.ok(doc.items.length > 0);
  assert.equal(renderRoadmap(doc.items, doc.preamble), text, "a no-op write would rewrite the roadmap");
});
