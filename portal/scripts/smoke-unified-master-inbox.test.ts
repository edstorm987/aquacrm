import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string { return readFileSync(path, "utf8"); }

test("Master Inbox leads with attention and retains a real all-channel conversation desk", () => {
  const inbox = read("src/app/portal/agency/inbox/_MasterInbox.tsx");
  const unified = read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");
  assert.match(inbox, /type View = "all" \|/);
  assert.match(inbox, /: "attention";/);
  // Both labels changed on 2026-08-30 when ten tabs became three. "Needs
  // attention" absorbed Actions and became "Needs you"; "All" became the
  // "Everything" source inside the merged Inbox tab. The guarantee this test
  // exists for is unchanged — attention still leads, and the all-channel desk
  // is still a real desk rather than a link to six separate ones.
  assert.match(inbox, /label="Needs you"/);
  assert.match(inbox, /label="Everything"/);
  assert.match(inbox, /label="Inbox"/);
  assert.match(inbox, /<UnifiedInboxWorkspace/);
  assert.match(unified, /Every conversation, one desk/);
  assert.match(unified, /kind: "website"/);
  assert.match(unified, /kind: "social"/);
  assert.match(unified, /kind: "client"/);
  assert.match(unified, /buildThreads\(websiteForms, conversations, socialInbox\.conversations, clientProfiles\)/);
});

test("the two-pane redesign keeps its messaging affordances", () => {
  // Added 2026-08-30 with the premium messaging redesign: the queue rail
  // folded into chips, threads render as grouped bubbles under day dividers,
  // and below lg the desk stacks list-then-thread with a back button.
  const unified = read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");
  assert.match(unified, /aria-label="Back to conversations"/); // mobile stacking exists
  assert.match(unified, /function relativeTime/); // relative-time rows
  assert.match(unified, /function dayLabel/); // day dividers
  // The hex body was the one surface the dark class sweep could not invert.
  assert.doesNotMatch(unified, /#fbfbfa/);
});

test("unified composers send through each source system", () => {
  const unified = read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");
  const enquiry = read("src/app/portal/agency/inbox/_EnquiryCommunications.tsx");
  assert.match(unified, /\/api\/portal\/inbox\/messages/);
  assert.match(unified, /\/api\/tenants\/client-requests/);
  assert.match(enquiry, /\/api\/portal\/website-enquiries\/communications/);
  assert.match(enquiry, /id: "call"/);
  assert.match(enquiry, /Call mode active/);
  assert.match(unified, /ownerPhone/);
});

test("images, files and voice notes use durable inbox media", () => {
  const unified = read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");
  const enquiry = read("src/app/portal/agency/inbox/_EnquiryCommunications.tsx");
  const upload = read("src/app/api/portal/inbox/media/route.ts");
  const content = read("src/app/api/portal/inbox/media/content/route.ts");
  const token = read("src/lib/server/inbox/inboxMedia.ts");
  const recorder = read("src/app/portal/agency/inbox/_voiceRecorder.ts");
  for (const source of [unified, enquiry]) {
    // Microphone capture goes through the one shared recorder helper, which is
    // also the only place allowed to ask for the stream — see issues #145.
    assert.match(source, /beginRecording\(\{/);
    assert.doesNotMatch(source, /navigator\.mediaDevices/);
    assert.match(source, /\/api\/portal\/inbox\/media/);
    assert.match(source, /Record voice note|voice-note-/);
    assert.match(source, /accept="image\/\*,audio\/\*,video\/\*/);
  }
  assert.match(recorder, /navigator\.mediaDevices/);
  assert.match(recorder, /devices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(upload, /20 \* 1024 \* 1024/);
  assert.match(upload, /storePrivateUpload/);
  assert.match(upload, /targetKind !== "website" && targetKind !== "social" && targetKind !== "client"/);
  assert.match(token, /createHmac\("sha256"/);
  assert.match(content, /verifyInboxMediaToken/);
});

test("outbound providers receive real attachments", () => {
  const communications = read("src/app/api/portal/website-enquiries/communications/route.ts");
  const email = read("src/lib/server/email/transactionalEmail.ts");
  const phone = read("src/lib/server/email/outboundCommunications.ts");
  const social = read("src/lib/server/inbox/inboxService.ts");
  const client = read("src/app/api/tenants/client-requests/route.ts");
  assert.match(communications, /attachments: media\.map/);
  assert.match(communications, /mediaUrls: attachments\.map/);
  assert.match(email, /attachments\?: Array/);
  assert.match(phone, /form\.append\("MediaUrl", url\)/);
  assert.match(social, /sendMetaAttachmentMessage/);
  assert.match(client, /targetKind !== "client"/);
  assert.match(client, /attachments,/);
});
