import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function activityBlock(value: string, idempotencyPrefix: string): string {
  const start = value.indexOf(`idempotencyKey: \`${idempotencyPrefix}`);
  assert.notEqual(start, -1, `missing ${idempotencyPrefix} activity`);
  const close = value.slice(start).match(/\n\s+\}\);/);
  assert.ok(close?.index !== undefined, `unterminated ${idempotencyPrefix} activity`);
  return value.slice(start, start + close.index + close[0].length);
}

test("device call activity persists operational lineage without raw recipient PII", () => {
  const route = source("src/app/api/portal/telephony/call/route.ts");
  const activity = activityBlock(route, "outreach-call-device:");

  assert.match(activity, /message: "Prepared a device call in the default phone app\."/);
  assert.doesNotMatch(activity, /\bphone\s*[,}]/);
  assert.doesNotMatch(activity, /identity\.(?:displayName|categoryLabel)/);
  assert.match(activity, /resolvedProspectId \? \{ prospectId: resolvedProspectId \}/);
  assert.match(activity, /resolvedLeadId \? \{ leadId: resolvedLeadId \}/);
  assert.match(activity, /verifiedContactId \? \{ contactId: verifiedContactId \}/);
  assert.match(activity, /logicalCallId/);

  // The browser contract is unchanged: a device handoff is still successful
  // and receives the identity and stable logical operation id it used before.
  assert.match(route, /ok: result\.via === "device",[\s\S]*?identity,[\s\S]*?logicalCallId/);
  assert.match(route, /status: result\.via === "device" \? 200/);
});

test("device email activity persists operational lineage while mailto keeps the recipient", () => {
  const route = source("src/app/api/portal/telephony/email/route.ts");
  const activity = activityBlock(route, "outreach-email-device:");

  assert.match(activity, /message: "Prepared an email in the default email app\."/);
  assert.doesNotMatch(activity, /\bto\s*[,}]/);
  assert.doesNotMatch(activity, /\$\{to\}/);
  assert.match(activity, /resolvedProspectId \? \{ prospectId: resolvedProspectId \}/);
  assert.match(activity, /resolvedLeadId \? \{ leadId: resolvedLeadId \}/);
  assert.match(activity, /verifiedContactId \? \{ contactId: verifiedContactId \}/);
  assert.match(activity, /logicalSendId/);

  // Only the response-side mailto carries the recipient; response shape and
  // logical-id idempotency remain unchanged.
  assert.match(route, /const mailto = `mailto:\$\{encodeURIComponent\(to\)\}/);
  assert.match(route, /return NextResponse\.json\(\{[\s\S]*?via: "device",[\s\S]*?mailto,[\s\S]*?logicalSendId/);
});
