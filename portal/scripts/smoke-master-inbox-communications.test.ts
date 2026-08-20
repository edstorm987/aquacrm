import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Master Inbox exposes one contact-aware composer for every enquiry view", () => {
  const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
  const detailCard = read("src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");
  const composer = read("src/app/portal/agency/inbox/_EnquiryCommunications.tsx");
  // The enquiry detail card is the inbox's per-enquiry view; it hosts the one composer.
  assert.match(inbox, /<EnquiryDetailCard/);
  assert.match(detailCard, /<EnquiryCommunications item=\{item\} readiness=\{communicationReadiness\}/);
  assert.match(composer, /id: "email"/);
  assert.match(composer, /id: "sms"/);
  assert.match(composer, /id: "whatsapp"/);
  assert.match(composer, /id: "call"/);
  assert.match(composer, />Send as</);
  assert.match(composer, /Preferred ·/);
  assert.match(composer, /senderByChannel/);
});

test("send-as accounts are workspace validated and provider backed", () => {
  const catalogue = read("src/lib/integrations/catalog.ts");
  const senders = read("src/lib/server/email/outboundCommunications.ts");
  const route = read("src/app/api/portal/website-enquiries/communications/route.ts");
  const email = read("src/lib/server/email/transactionalEmail.ts");
  assert.match(catalogue, /id: "smtp"/);
  assert.match(catalogue, /id: "twilio"/);
  assert.match(senders, /resolveCommunicationSender/);
  assert.match(senders, /Messages\.json/);
  assert.match(senders, /Calls\.json/);
  assert.match(senders, /initiatePhoneCall/);
  assert.match(route, /The selected send-as account is no longer connected/);
  assert.match(route, /senderId: sender\.id/);
  assert.match(route, /inboxReplies/);
  assert.match(route, /recordWebsiteEnquiryLeadContact/);
  assert.match(email, /createTransport/);
});

test("call mode retains consent, recording, notes, outcome and follow-up", () => {
  const composer = read("src/app/portal/agency/inbox/_EnquiryCommunications.tsx");
  const calls = read("src/app/api/portal/website-enquiries/calls/route.ts");
  const upload = read("src/app/api/portal/website-enquiries/calls/recording/route.ts");
  const content = read("src/app/api/portal/website-enquiries/calls/recording/content/route.ts");
  assert.match(composer, /MediaRecorder/);
  assert.match(composer, /I have permission from everyone on the call/);
  assert.match(composer, /window\.open\(`tel:/);
  assert.match(composer, /End and save call/);
  assert.match(calls, /inboxCalls/);
  assert.match(calls, /followUpAt/);
  assert.match(calls, /durationSeconds/);
  assert.match(calls, /recordWebsiteEnquiryLeadContact/);
  assert.match(upload, /activeCallRecordingConsent !== true/);
  assert.match(upload, /storePrivateUpload/);
  assert.match(content, /requireRole/);
  assert.match(content, /inbox-calls\/\$\{session\.agencyId\}/);
});

test("reply and call history participate in universal search", () => {
  const search = read("src/app/api/portal/search/route.ts");
  assert.match(search, /enquiry\.replies\.flatMap/);
  assert.match(search, /enquiry\.calls\.flatMap/);
  assert.match(search, /category: "Contact"/);
  assert.match(search, /matchLabel: "Enquiry reply"/);
});
