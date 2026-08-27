import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const masterInbox = readFileSync("src/app/portal/agency/inbox/_MasterInbox.tsx", "utf8");
const unifiedInbox = readFileSync("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx", "utf8");
const enquiryCommunications = readFileSync("src/app/portal/agency/inbox/_EnquiryCommunications.tsx", "utf8");
const inboxPage = readFileSync("src/app/portal/agency/inbox/page.tsx", "utf8");
const websiteReplyRoute = readFileSync("src/app/api/portal/website-enquiries/communications/route.ts", "utf8");
const websiteCallRoute = readFileSync("src/app/api/portal/website-enquiries/calls/route.ts", "utf8");
const websiteEnquiries = readFileSync("src/lib/server/websiteEnquiries.ts", "utf8");
const socialWorkspace = readFileSync("src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx", "utf8");
const clientRequestRoute = readFileSync("src/app/api/tenants/client-requests/route.ts", "utf8");

test("Master Inbox exposes reply composers for every currently sendable thread type", () => {
  assert.match(enquiryCommunications, /\/api\/portal\/website-enquiries\/communications/);
  assert.match(enquiryCommunications, /`Send \$\{channelLabel\(channel\)\}`/);
  assert.match(unifiedInbox, /\/api\/tenants\/client-requests/);
  assert.match(unifiedInbox, /Send client portal reply/);
  assert.match(unifiedInbox, /\/api\/portal\/inbox\/messages/);
  assert.match(socialWorkspace, /\/api\/portal\/inbox\/messages/);
  assert.match(socialWorkspace, /composerMode === "note"/);
});

test("website enquiry replies require a real recipient and sender", () => {
  assert.match(websiteReplyRoute, /requireRole\(\["agency-owner", "agency-manager", "agency-staff"\]\)/);
  assert.match(websiteReplyRoute, /This enquiry has no valid/);
  assert.match(websiteReplyRoute, /resolveCommunicationSender/);
  assert.match(websiteReplyRoute, /enquiry\.metadata\?\.clientId/);
  assert.match(websiteReplyRoute, /resolveCommunicationSender\(session\.agencyId, senderId, channel, targetClientId\)/);
  assert.match(websiteReplyRoute, /sendTransactionalEmail/);
  assert.match(enquiryCommunications, /!sender\.clientId \|\| sender\.clientId === item\.clientId/);
  assert.match(websiteCallRoute, /resolveCommunicationSender\(session\.agencyId, senderId, "call", targetClientId\)/);
  assert.match(inboxPage, /outboundCommunicationReadiness\(session\.agencyId\)/);
  // Connecting an email sender to reply through is done in the Channels tab's
  // connection manager (the panel that saves Resend/SMTP), not a dead status
  // card. Email connections carry their own sender, unifying the two.
  assert.match(masterInbox, /IntegrationConnectionsPanel/);
  assert.match(masterInbox, /Email connections carry their own sender/);
});

test("outbound website replies are idempotent, retained and timed", () => {
  assert.match(websiteReplyRoute, /createHash\("sha256"\)/);
  assert.match(websiteReplyRoute, /existingReplies\.find\(reply => reply\.id === replyId && reply\.status === "sent"\)/);
  assert.match(websiteReplyRoute, /inboxReplies: \[\.\.\.existingReplies\.filter\(item => item\.id !== replyId\)\.slice\(-199\), reply\]/);
  assert.match(websiteReplyRoute, /firstRespondedAt/);
  assert.match(websiteReplyRoute, /lastRespondedAt/);
  assert.match(websiteReplyRoute, /`website-enquiry\.\$\{channel\}-sent`/);
  assert.match(websiteEnquiries, /replies: inboxReplies\(metadata\)/);
  assert.match(enquiryCommunications, /Communication history/);
});

test("failed replies stay visible instead of pretending they were delivered", () => {
  assert.match(websiteReplyRoute, /status: result\.delivered \? "sent" : "failed"/);
  assert.match(websiteReplyRoute, /result\.via === "unconfigured" \? 503 : 502/);
  assert.match(enquiryCommunications, /reply\.status === "sent" \? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"/);
  assert.match(enquiryCommunications, /setError\(payload\?\.error \|\| "The message could not be sent\."\)/);
});

test("authenticated portal conversations preserve their reply history", () => {
  assert.match(inboxPage, /replies: request\.replies \?\? \[\]/);
  assert.match(masterInbox, /Conversation history/);
  assert.match(clientRequestRoute, /action: reply \? "client_request\.replied"/);
  assert.match(clientRequestRoute, /from: fromMilesymedia \? "milesymedia" : "customer"/);
});

test("the connections panel prompts to connect an email sender first when none is set", () => {
  const panel = readFileSync("src/app/portal/agency/settings/IntegrationConnectionsPanel.tsx", "utf8");
  // The callout appears only when no Resend/SMTP sender is connected yet…
  assert.match(panel, /connection\.provider === "resend" \|\| connection\.provider === "smtp"/);
  // …and explains why email matters (enquiry replies + customer login codes) with direct connect actions.
  assert.match(panel, /Start here — connect an email sender/);
  assert.match(panel, /reply to website enquiries and send customers their login codes/);
  assert.match(panel, /setModal\(\{ provider: "resend" \}\)/);
});

test("the social inbox offers a self-serve Connect-now form that saves Meta credentials", () => {
  // The dead "Awaiting Meta values" button is gone — an enabled "Connect now" replaces it.
  assert.doesNotMatch(socialWorkspace, /Awaiting Meta values/);
  assert.match(socialWorkspace, /Connect now/);
  // The form saves to the canonical integration store as the `meta` provider,
  // reusing the shared catalog field definitions (one source of truth, no re-listed fields).
  assert.match(socialWorkspace, /integrationDefinition\("meta"\)/);
  assert.match(socialWorkspace, /\/api\/portal\/settings\/integrations/);
  assert.match(socialWorkspace, /provider: "meta"/);
  // On save it refreshes so readiness recomputes stored-then-env and the OAuth buttons appear.
  assert.match(socialWorkspace, /router\.refresh\(\)/);
  assert.match(socialWorkspace, /readiness\.configured \?/);
});
