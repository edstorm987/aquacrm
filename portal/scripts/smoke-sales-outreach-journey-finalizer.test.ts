import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("both Journey entry routes project the outcome actor through the agency-scoped label resolver", () => {
  for (const relativePath of [
    "../src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx",
    "../src/app/portal/agency/pipelines/[slug]/page.tsx",
  ]) {
    const route = source(relativePath);
    assert.match(route, /const actorLabelFor = \(actorUserId\?: string\)[\s\S]*?actor\.agencyIds\.includes\(/);
    assert.match(route, /map\(\(\{ actorUserId, outcomeActorUserId, \.\.\.event \}\) => \(\{[\s\S]*?actorLabel: actorLabelFor\(actorUserId\),[\s\S]*?outcomeActorLabel: actorLabelFor\(outcomeActorUserId\)/);
    assert.doesNotMatch(route, /journeyEvents:\s*lead\.journeyEvents/,
      `${relativePath} passed raw Journey actor identifiers to the browser`);
  }
});

test("the Journey timing trace separates occurrence time from honest outcome attribution", () => {
  const types = source("../src/app/portal/agency/pipelines/[slug]/_leadTypes.ts");
  const trace = source("../src/app/portal/agency/pipelines/[slug]/_leadShared.tsx");

  assert.match(types, /outcomeRecordedAt\?: number;/);
  assert.match(types, /outcomeActorLabel\?: string;/);
  assert.match(trace, /event\.type === "contact-recorded" && event\.source\?\.startsWith\("scouting:"\)/);
  assert.match(trace, /Outcome by \{event\.outcomeActorLabel \?\? "Staff not recorded \(legacy\)"\}/);
  assert.match(trace, /event\.outcomeRecordedAt \? formatUkDateTime\(event\.outcomeRecordedAt\) : "time not recorded \(legacy\)"/);
  assert.match(trace, /formatUkDateTime\(event\.at\)/,
    "the contact occurrence must continue to render from event.at");
});
