import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const messages = read("src/app/api/portal/inbox/messages/route.ts");
const conversations = read("src/app/api/portal/inbox/conversations/route.ts");
const connections = read("src/app/api/portal/inbox/connections/route.ts");
const status = read("src/app/api/portal/website-enquiries/status/route.ts");
const metaStart = read("src/app/api/portal/inbox/meta/start/route.ts");
const metaCallback = read("src/app/api/portal/inbox/meta/callback/route.ts");
const integrationSettings = read("src/app/api/portal/settings/integrations/route.ts");
const master = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
const social = read("src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx");
const unified = read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");

test("Inbox message writes re-authorize the live conversation and linked client before storage or delivery", () => {
  assert.match(messages, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "use"\)/);
  assert.match(messages, /getInboxConversation\(agencyId, conversationId\)/);
  assert.match(messages, /liveConversation\.identity\.clientId/);
  assert.match(messages, /requireCurrentClientWorkspaceElementAccess\([\s\S]*?"client\.communications",[\s\S]*?"use"/);
  const liveChecks = [...messages.matchAll(/requireLiveConversationCommunicationUse\(agencyId, body\.conversationId\)/g)].map(match => match.index);
  assert.equal(liveChecks.length, 2);
  assert.ok(liveChecks[0]! < messages.indexOf("preflightInboxReplyOperation(stagedPreflightInput)"));
  assert.ok(liveChecks[1]! > messages.indexOf("preflightInboxReplyOperation(stagedPreflightInput)"));
  assert.ok(liveChecks[1]! < messages.indexOf("claimStagedPrivateUploadsForOwnership({"));
  assert.ok(liveChecks[1]! < messages.indexOf("const persistMessage ="));
});

test("conversation reads project client visibility and every conversation write requires Inbox Use", () => {
  assert.match(conversations, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "view"\)/);
  assert.match(conversations, /resolveActorClientWorkspaceElementAccess\(actor, clientId\)/);
  assert.match(conversations, /clientWorkspaceElementLevel\(access, "client\.communications"\)/);
  assert.match(conversations, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "use"\)/);
  assert.match(conversations, /getInboxConversation\(agencyId, body\.conversationId\)/);
  assert.match(conversations, /currentConversation\.identity\.clientId/);
  assert.match(conversations, /requireCurrentClientWorkspaceElementAccess\([\s\S]*?"client\.communications",[\s\S]*?"use"/);
  assert.doesNotMatch(conversations, /listInboxSnapshot\(session\.agencyId\)/);
});

test("connection discovery is View while routing, disconnect and OAuth are Manage", () => {
  assert.match(connections, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "view"\)/);
  assert.equal((connections.match(/requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "manage"\)/g) ?? []).length, 2);
  assert.match(metaStart, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "manage"\)/);
  assert.match(metaCallback, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "manage"\)/);
  assert.match(integrationSettings, /metaInboxOperation/);
  assert.match(integrationSettings, /existingConnection\.provider === "meta"/);
  assert.match(integrationSettings, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "manage"\)/);
  assert.match(integrationSettings, /connections\.filter\(connection => connection\.provider === "meta"\)/);
});

test("website enquiry status writes use the live linked-client communications boundary", () => {
  assert.match(status, /requireCurrentWorkspaceElementAccess\("staff", "workspace\.inbox", "use"\)/);
  assert.match(status, /enquiry\.metadata\?\.clientId/);
  assert.match(status, /requireCurrentClientWorkspaceElementAccess\(linkedClientId, "client\.communications", "use"\)/);
  assert.ok(status.indexOf("loadOwnedEnquiry") < status.indexOf("requireCurrentClientWorkspaceElementAccess(linkedClientId"));
  assert.ok(status.indexOf("requireCurrentClientWorkspaceElementAccess(linkedClientId") < status.indexOf(".update({ metadata })"));
});

test("view-only Inbox keeps discovery enabled and disables only mutation controls", () => {
  assert.doesNotMatch(master, /<fieldset disabled=\{readOnly\} className="contents">/);
  assert.match(master, /canMutate=\{!readOnly\}/);
  assert.match(master, /canManageChannels=\{canManageChannels\}/);
  assert.match(master, /disabled=\{!canMutate \|\| classificationBusyId/);
  assert.match(social, /canManage \? <div className="flex flex-wrap gap-2">/);
  assert.match(social, /\{canManage \? <button type="button" disabled=\{busy === `disconnect:/);
  assert.match(social, />Disconnect<\/button> : null/);
  assert.match(social, /disabled=\{!canMutate \|\| \(mode === "reply" && !windowOpen\)\}/);
  assert.match(unified, /if \(!canMutate \|\| thread\.kind !== "social"/);
  assert.match(unified, /disabled=\{!canMutate\} placeholder=\{canMutate \? `Reply to/);
});
