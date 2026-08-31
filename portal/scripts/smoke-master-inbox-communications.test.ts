import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { extensionForMime, uploadContentType } from "@/app/portal/agency/inbox/_voiceRecorder";

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
  assert.match(route, /The selected send-as account is not available for this client/);
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
  // A mounted recording seeks, so delivery goes through the shared byte-range
  // contract (206/416) rather than a whole-object 200 — see issues #144.
  assert.match(content, /privateMediaResponse/);
  assert.match(content, /request\.headers\.get\("range"\)/);
});

test("every recorder site negotiates its format through the one shared helper", () => {
  const composer = read("src/app/portal/agency/inbox/_EnquiryCommunications.tsx");
  const workspace = read("src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx");
  const helper = read("src/app/portal/agency/inbox/_voiceRecorder.ts");
  // One negotiation, not four hardcoded WebM requests. Safari records MP4 and
  // has no WebM at all, so a forced "audio/webm" is a NotSupportedError.
  for (const [name, source] of [["composer", composer], ["workspace", workspace]] as const) {
    assert.doesNotMatch(source, /isTypeSupported/, `${name} must not negotiate its own MIME`);
    assert.doesNotMatch(source, /new MediaRecorder\(/, `${name} must not construct a recorder itself`);
    // Nothing may be named .webm regardless of what was actually recorded.
    assert.doesNotMatch(source, /\.webm`/, `${name} must name uploads from the actual MIME`);
    assert.match(source, /extensionForMime\(/, `${name} must derive the extension from the recorder MIME`);
    assert.match(source, /from "\.\/_voiceRecorder"/, `${name} must use the shared recorder helper`);
  }
  assert.match(helper, /"audio\/webm;codecs=opus", "audio\/webm", "audio\/mp4"/);
  // A recorder that cannot be constructed is not a denied permission.
  assert.match(helper, /kind: "capability"|recorderFailure\("capability"\)/);
  assert.match(helper, /stopStreamTracks\(options\.stream\)/);
});

test("a recording declares a container type the upload routes actually accept", () => {
  for (const path of ["src/app/portal/agency/inbox/_EnquiryCommunications.tsx", "src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx"]) {
    assert.match(read(path), /uploadContentType\(/, `${path} must declare the container, not the codec string`);
  }
  // Both routes match the WHOLE File.type against their audio allowlist, so a
  // recorder MIME sent verbatim ("audio/webm;codecs=opus" in Chrome and
  // Firefox) is rejected with 415 and the operator loses the audio.
  const recordingRoute = read("src/app/api/portal/website-enquiries/calls/recording/route.ts");
  const setLiteral = recordingRoute.match(/const AUDIO_TYPES = new Set\((\[[^\]]*\])\)/);
  assert.ok(setLiteral, "the call recording route must declare an AUDIO_TYPES allowlist");
  const callAllowlist = new Set(JSON.parse(setLiteral[1]) as string[]);

  const mediaRoute = read("src/app/api/portal/inbox/media/route.ts");
  const regexLiteral = mediaRoute.match(/const ALLOWED_TYPES = \/(.+)\/i;/);
  assert.ok(regexLiteral, "the inbox media route must declare an ALLOWED_TYPES allowlist");
  const mediaAllowlist = new RegExp(regexLiteral[1], "i");

  for (const recorded of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"]) {
    const declared = uploadContentType(recorded);
    assert.equal(callAllowlist.has(declared), true, `a call recorded as ${recorded} must be accepted, not 415`);
    assert.equal(mediaAllowlist.test(declared), true, `a voice note recorded as ${recorded} must be accepted, not 415`);
    // A real File keeps the type it is given, so this is the string sent.
    assert.equal(new File([new Uint8Array([1])], `voice-note.${extensionForMime(declared)}`, { type: declared }).type, declared);
  }
});

test("a recorder that fails never strands the busy UI, the microphone or the active call", () => {
  const composer = read("src/app/portal/agency/inbox/_EnquiryCommunications.tsx");
  // The call is persisted server-side before the recorder starts, so the
  // operator must always be shown it — with the recording failure named.
  assert.match(composer, /const recordingProblem = stream \? attachCallRecorder\(stream\) : "";\n\s*setActiveCall\(payload\.call\);/);
  assert.match(composer, /setBusy\(false\);\n\s*if \(recordingProblem\)/);
  assert.match(composer, /is NOT being recorded/);
  // A failed upload keeps the audio so "End and save call" can be retried.
  assert.match(composer, /pendingRecordingRef\.current \?\? \(recordingActive \? await stopRecorder\(\) : null\)/);
  assert.match(composer, /await uploadRecording\(activeCall\.id, recording\);\n\s*pendingRecordingRef\.current = null;/);
  // Microphone permission is asked for through the classifying helper only.
  assert.doesNotMatch(composer, /getUserMedia/);
  assert.match(composer, /requestMicrophoneStream\(\)/);
});

test("reply and call history participate in universal search", () => {
  const search = read("src/app/api/portal/search/route.ts");
  assert.match(search, /enquiry\.replies\.flatMap/);
  assert.match(search, /enquiry\.calls\.flatMap/);
  assert.match(search, /category: "Contact"/);
  assert.match(search, /matchLabel: "Enquiry reply"/);
});
