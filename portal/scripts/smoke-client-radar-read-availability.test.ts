import assert from "node:assert/strict";
import test from "node:test";

import { readClientRadarInvoiceEvidence } from "../src/engines/data/server/radar/clientRadarService";

test("client Radar distinguishes a confirmed empty Finance read from a rejected read", async () => {
  let disconnectedReadCalled = false;
  const disconnected = await readClientRadarInvoiceEvidence(false, async () => {
    disconnectedReadCalled = true;
    return [];
  });
  assert.deepEqual(disconnected, { connected: false, available: true, invoices: [] });
  assert.equal(disconnectedReadCalled, false);

  const empty = await readClientRadarInvoiceEvidence(true, async () => []);
  assert.deepEqual(empty, { connected: true, available: true, invoices: [] });

  const unavailable = await readClientRadarInvoiceEvidence(true, async () => {
    throw new Error("forced Finance outage");
  });
  assert.deepEqual(unavailable, { connected: true, available: false, invoices: [] });
});
