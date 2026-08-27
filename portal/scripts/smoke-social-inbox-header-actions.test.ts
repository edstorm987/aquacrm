import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx", import.meta.url),
  "utf8",
);

test("Social Inbox does not advertise a conversation action with no outcome", () => {
  assert.doesNotMatch(source, /More conversation actions/);
  assert.doesNotMatch(source, /title="More actions"/);
  assert.doesNotMatch(source, /MoreHorizontal/);
});

test("the remaining header actions are native buttons backed by real conversation mutations", () => {
  assert.match(
    source,
    /<button type="button"[^>]*aria-label="Assign conversation to me"[^>]*onClick=\{\(\) => void onMutate\(item\.id, \{ assignedTo: currentUserId \}\)\}/,
  );
  assert.match(
    source,
    /<button type="button"[^>]*aria-label=\{item\.status === "closed" \? "Reopen conversation" : "Close conversation"\}[^>]*onClick=\{\(\) => void onMutate\(item\.id, \{ status:/,
  );
});
