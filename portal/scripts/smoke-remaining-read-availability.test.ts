import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkedReadHasRetainedSnapshot,
  checkedReadIsCurrent,
  checkedReadReducer,
  confirmedCheckedRead,
} from "../src/lib/client/checkedReadState";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("checked reads distinguish confirmed empty, failed retention and current mutation authority", () => {
  const initial = confirmedCheckedRead("pending", [{ id: "review-1" }]);
  const loading = checkedReadReducer(initial, { type: "begin", requestId: 1, scope: "parked" });
  assert.equal(checkedReadIsCurrent(loading), false);
  assert.equal(checkedReadHasRetainedSnapshot(loading), true);
  assert.deepEqual(loading.value, [{ id: "review-1" }]);

  const failed = checkedReadReducer(loading, { type: "fail", requestId: 1, scope: "parked", error: "offline" });
  assert.equal(failed.phase, "unavailable");
  assert.equal(failed.confirmedScope, "pending", "old evidence keeps its old label");
  assert.deepEqual(failed.value, [{ id: "review-1" }], "last-confirmed evidence is retained");
  assert.equal(checkedReadIsCurrent(failed), false, "mutations remain locked");

  const retrying = checkedReadReducer(failed, { type: "begin", requestId: 2, scope: "parked" });
  const confirmedEmpty = checkedReadReducer(retrying, { type: "succeed", requestId: 2, scope: "parked", value: [] });
  assert.equal(confirmedEmpty.phase, "ready");
  assert.equal(confirmedEmpty.confirmedScope, "parked");
  assert.deepEqual(confirmedEmpty.value, [], "an empty successful payload is genuine empty evidence");
  assert.equal(checkedReadIsCurrent(confirmedEmpty), true);
});

test("a delayed response cannot overwrite a newer queue or governance scope", () => {
  const initial = confirmedCheckedRead("agency", { company: "Agency" });
  const first = checkedReadReducer(initial, { type: "begin", requestId: 10, scope: "company-a" });
  const second = checkedReadReducer(first, { type: "begin", requestId: 11, scope: "company-b" });
  const stale = checkedReadReducer(second, { type: "succeed", requestId: 10, scope: "company-a", value: { company: "A" } });
  assert.deepEqual(stale, second, "the older response is inert");
  const current = checkedReadReducer(stale, { type: "succeed", requestId: 11, scope: "company-b", value: { company: "B" } });
  assert.equal(current.confirmedScope, "company-b");
  assert.deepEqual(current.value, { company: "B" });
});

test("all six remaining #57 surfaces expose retry and gate consequential mutations", () => {
  const interactions = read("src/app/portal/agency/contacts/[personId]/_ContactCard.tsx");
  assert.match(interactions, /disabled=\{busy !== null \|\| !interactionsComplete\}/);
  assert.match(interactions, /disabled=\{!interactionsComplete\}/);

  const marketing = read("src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx");
  assert.match(marketing, /inboxConnectionsAvailable && metaConfigured/);
  assert.match(marketing, /Retry connections/);

  const commercial = read("src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx");
  assert.match(commercial, /requestId !== readRequestId\.current/);
  assert.match(commercial, /Retry records/);
  assert.match(commercial, /Retry catalogue/);
  assert.match(commercial, /packRead !== "ready" \|\| busy === "payment"/);

  const manual = read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");
  assert.match(manual, /<ManualContactDetails key=\{item\.id\}/);
  assert.match(manual, /if \(readState !== "ready"\)/);
  assert.match(manual, /Retry the read/);

  const identity = read("src/app/portal/clients/_IdentityReviewWorkspace.tsx");
  assert.match(identity, /checkedReadReducer/);
  assert.match(identity, /queueRead\.phase !== "ready"/);
  assert.match(identity, /Retry \{reviewStatusLabel\(failedStatus\)\}/);

  const governance = read("src/app/portal/agency/governance/_GovernanceWorkspace.tsx");
  assert.match(governance, /const companyId = scopeRead\.confirmedScope/);
  assert.match(governance, /<fieldset disabled=\{scopeRead\.phase !== "ready"\}/);
  assert.match(governance, /Try that scope again/);
});

test("Finance, customer, Radar and Fulfilment retain explicit unavailable contracts", () => {
  const finance = read("src/lib/client/clientFinanceReads.ts");
  assert.match(finance, /plugin-missing/);
  assert.match(finance, /retainedSnapshotIsStale/);

  const customer = read("src/lib/portal/customerPortalReadState.ts");
  assert.match(customer, /unavailable/);
  const radar = read("src/lib/client/clientRadarRead.ts");
  assert.match(radar, /activeRequestId/);
  const fulfilment = read("src/app/portal/clients/[clientId]/_ClientFulfilmentHub.tsx");
  assert.match(fulfilment, /invoiceAvailability: "ready" \| "unavailable"/);
  assert.match(fulfilment, /invoices unavailable/);
});
