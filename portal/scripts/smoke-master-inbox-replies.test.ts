import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const masterInbox = readFileSync("src/app/portal/agency/inbox/_MasterInbox.tsx", "utf8");
const inboxPage = readFileSync("src/app/portal/agency/inbox/page.tsx", "utf8");
const websiteReplyRoute = readFileSync("src/app/api/portal/website-enquiries/reply/route.ts", "utf8");
const websiteEnquiries = readFileSync("src/lib/server/websiteEnquiries.ts", "utf8");
const socialWorkspace = readFileSync("src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx", "utf8");
const clientRequestRoute = readFileSync("src/app/api/tenants/client-requests/route.ts", "utf8");

test("Master Inbox exposes reply composers for every currently sendable thread type", () => {
  assert.match(masterInbox, /\/api\/portal\/website-enquiries\/reply/);
  assert.match(masterInbox, /Send email reply/);
  assert.match(masterInbox, /\/api\/tenants\/client-requests/);
  assert.match(masterInbox, /Send reply/);
  assert.match(socialWorkspace, /\/api\/portal\/inbox\/messages/);
  assert.match(socialWorkspace, /composerMode === "note"/);
});

test("website enquiry replies require a real recipient and sender", () => {
  assert.match(websiteReplyRoute, /requireRole\(\["agency-owner", "agency-manager", "agency-staff"\]\)/);
  assert.match(websiteReplyRoute, /This enquiry does not have a valid email address/);
  assert.match(websiteReplyRoute, /sendTransactionalEmail/);
  assert.match(inboxPage, /transactionalEmailReadiness\(session\.agencyId\)\.configured/);
  assert.match(masterInbox, /Connect Resend to answer website enquiries/);
});

test("outbound website replies are idempotent, retained and timed", () => {
  assert.match(websiteReplyRoute, /createHash\("sha256"\)/);
  assert.match(websiteReplyRoute, /priorDelivery/);
  assert.match(websiteReplyRoute, /inboxReplies: \[\.\.\.priorReplies\.filter\(item => item\.id !== replyId\)\.slice\(-99\), reply\]/);
  assert.match(websiteReplyRoute, /firstRespondedAt/);
  assert.match(websiteReplyRoute, /lastRespondedAt/);
  assert.match(websiteReplyRoute, /website-enquiry\.replied/);
  assert.match(websiteEnquiries, /replies: inboxReplies\(metadata\)/);
  assert.match(masterInbox, /Every attempt is retained in its history/);
});

test("failed replies stay visible instead of pretending they were delivered", () => {
  assert.match(websiteReplyRoute, /status: result\.delivered \? "sent" : "failed"/);
  assert.match(websiteReplyRoute, /result\.via === "unconfigured" \? 503 : 502/);
  assert.match(masterInbox, /reply\.status === "sent" \? "green" : "red"/);
  assert.match(masterInbox, /replyError\[item\.id\]/);
});

test("authenticated portal conversations preserve their reply history", () => {
  assert.match(inboxPage, /replies: request\.replies \?\? \[\]/);
  assert.match(masterInbox, /Conversation history/);
  assert.match(clientRequestRoute, /action: reply \? "client_request\.replied"/);
  assert.match(clientRequestRoute, /from: fromMilesymedia \? "milesymedia" : "customer"/);
});
