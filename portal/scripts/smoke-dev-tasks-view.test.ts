import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Thought } from "../src/lib/server/devTeamThoughts";

// The inline thoughts in the Tasks view. The component itself pulls in
// next/link, which cannot be imported under the suite's react-server
// condition, so the rule it follows lives in its own module and is driven
// directly here.

function thought(id: string, over: Partial<Thought> = {}): Thought {
  return { id, at: 1, author: "Ed", text: id, taskId: "plan-a#1", ...over };
}

test("a locally-posted thought shows before the server has it", async () => {
  const { mergeThoughts } = await import("../src/app/portal/dev-team/tasks/_thoughtMerge");
  const merged = mergeThoughts({}, [thought("th_local")]);
  assert.deepEqual(Object.keys(merged), ["plan-a#1"]);
  assert.equal(merged["plan-a#1"][0].id, "th_local");
});

test("the SERVER copy wins once it arrives — the view cannot freeze at mount", async () => {
  const { mergeThoughts } = await import("../src/app/portal/dev-team/tasks/_thoughtMerge");
  // Ed posts, a worker acknowledges, router.refresh() brings back the row with
  // a reader on it. The old view kept its own unread copy and went on saying
  // "waiting to be picked up" while the header pill said otherwise.
  const fromServer = { "plan-a#1": [thought("th_1", { readBy: { alpha: 99 } })] };
  const merged = mergeThoughts(fromServer, [thought("th_1")]);
  assert.equal(merged["plan-a#1"].length, 1, "the optimistic row must not double up");
  assert.deepEqual(merged["plan-a#1"][0].readBy, { alpha: 99 }, "the view must show what the server now says");
});

test("a thought posted in another tab appears on the next refresh", async () => {
  const { mergeThoughts } = await import("../src/app/portal/dev-team/tasks/_thoughtMerge");
  const merged = mergeThoughts({ "plan-a#1": [thought("th_other_tab")] }, []);
  assert.deepEqual(merged["plan-a#1"].map(t => t.id), ["th_other_tab"]);
});

test("re-syncing on every refresh cannot loop", async () => {
  const { dropLanded } = await import("../src/app/portal/dev-team/tasks/_thoughtMerge");
  const pending = [thought("th_1")];
  assert.equal(dropLanded(pending, {}), pending, "nothing landed — same array, so no state churn");
  assert.deepEqual(dropLanded(pending, { "plan-a#1": [thought("th_1")] }), [], "landed rows are released");
});

test("the Tasks view never seeds its thought state from the server prop", async () => {
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");
  const source = await readFile(
    join(PROJECT_ROOT, "src/app/portal/dev-team/tasks/_TasksWorkspace.tsx"), "utf8");
  assert.doesNotMatch(source, /useState\(\s*initialThoughts\s*\)/,
    "mirroring the prop into state freezes the inline notes at first mount");
  assert.match(source, /mergeThoughts\(initialThoughts, pending\)/);
});

test("the placeholder does not promise a worker that isn't there", async () => {
  const { PROJECT_ROOT } = await import("../src/lib/server/devDocs");
  const source = await readFile(
    join(PROJECT_ROOT, "src/app/portal/dev-team/tasks/_TasksWorkspace.tsx"), "utf8");
  // Most tasks carry no worker (one is only set while a check-in names that
  // exact phase), so "This reaches the worker on this task" was usually false.
  assert.doesNotMatch(source, /This reaches the worker on this task/);
  assert.match(source, /whoever picks this plan up next/);
});
