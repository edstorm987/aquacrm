import assert from "node:assert/strict";
import { test } from "node:test";

import { buildProtectedAttentionWindow } from "../src/lib/attentionProtection";

type QueueItem = { id: string; group: string; urgency: number };

const queue: QueueItem[] = Array.from({ length: 10 }, (_, index) => ({
  id: `item-${index + 1}`,
  group: index % 2 ? "radar" : "task",
  urgency: index < 3 ? 0 : index < 7 ? 1 : 2,
}));

test("attention protection keeps a ranked focus window and retains the reserve", () => {
  const window = buildProtectedAttentionWindow(queue, {
    groupKey: item => item.group,
    urgencyRank: item => item.urgency,
  });

  assert.equal(window.protected, true);
  assert.equal(window.focus.length, 5);
  assert.equal(window.reserveCount, 5);
  assert.equal(window.total, 10);
});

test("full picture mode exposes every ranked item without losing queue totals", () => {
  const window = buildProtectedAttentionWindow(queue, {
    groupKey: item => item.group,
    urgencyRank: item => item.urgency,
    enabled: false,
  });

  assert.equal(window.protected, false);
  assert.equal(window.focus.length, queue.length);
  assert.equal(window.reserveCount, 0);
  assert.equal(window.total, queue.length);
  assert.deepEqual(window.focus.map(item => item.id), queue.map(item => item.id));
});
