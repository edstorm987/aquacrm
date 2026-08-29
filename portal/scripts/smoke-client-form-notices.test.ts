// A client's form data must stay in the client's database.
//
// Ed, 2026-08-27: *"we just get a notification to say they got the form so we
// can track enquiries without merging or breaching data."*
//
// That sentence is a privacy boundary, not a preference, and it is one line of
// code away from being broken at any time — the Supabase webhook body contains
// the whole submitted row, so keeping it would be easier than dropping it.
// These tests are what makes dropping it the path of least resistance.
//
// They are BEHAVIOURAL where it matters: the notice store is driven for real
// and the resulting record inspected, rather than the source being grepped for
// reassuring words.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a notice can hold a pointer and cannot hold a person", () => {
  // The input type is the guard. If somebody adds `email` or `name` here, this
  // fails and they have to argue for it rather than slip it in.
  const store = stripComments(read("src/lib/server/clientForms/clientFormNotices.ts"));
  const types = stripComments(read("src/server/types.ts"));

  const input = store.match(/export interface RecordClientFormNoticeInput \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(input, "RecordClientFormNoticeInput must exist");
  for (const forbidden of ["email", "name", "phone", "message", "record", "payload", "fields", "values"]) {
    assert.doesNotMatch(
      input, new RegExp(`\\b${forbidden}\\??:`, "i"),
      `RecordClientFormNoticeInput must not accept "${forbidden}" — the customer's data stays in the client's database`,
    );
  }

  const notice = types.match(/export interface ClientFormNotice \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(notice, "ClientFormNotice must exist");
  for (const forbidden of ["email", "name", "phone", "message", "fields", "values"]) {
    assert.doesNotMatch(
      notice, new RegExp(`\\b${forbidden}\\??:`, "i"),
      `ClientFormNotice must not store "${forbidden}"`,
    );
  }
});

test("the webhook reads the row's KEY and throws the rest of the body away", () => {
  const route = stripComments(read("src/app/api/public/client-forms/[connectionId]/route.ts"));

  // `record` may be touched exactly once, by the key extractor.
  assert.match(route, /function rowIdFrom\(record: unknown\)/, "the key extractor must exist");
  assert.match(route, /rowIdFrom\(body\.record\)/, "the row key must come from the payload's record");

  // …and nothing else may be lifted out of it.
  //
  // COUNTED, not pattern-matched. The first version of this assertion looked
  // for `body.record.<field>` and duly passed when the probe inserted
  // `(body.record as any)?.email` — a cast and an optional chain were enough to
  // walk straight through it. A test that green-lights the leak it exists to
  // prevent is worse than no test, so the invariant is now arithmetic: the
  // payload's record may be MENTIONED exactly once in the whole route, in the
  // call that extracts the key. Any second use fails, whatever it looks like.
  const recordMentions = [...route.matchAll(/body\.record\b/g)].length;
  assert.equal(
    recordMentions, 1,
    `the payload record may be touched exactly once (by rowIdFrom) — found ${recordMentions} uses`,
  );
  assert.doesNotMatch(route, /record\[["'](email|name|phone|message)/i, "no personal field may be read");

  // The table comes from our stored config, never the payload — otherwise a
  // forged webhook could aim a notice at a table the client never authorised.
  assert.match(route, /table: connection\.submissionsTable/, "the table must come from the stored connection");
  assert.doesNotMatch(route, /table: [^\n]*body\./, "the table must not be taken from the request body");
});

test("the secret is compared in constant time, and unknown ids are not distinguishable", () => {
  const route = stripComments(read("src/app/api/public/client-forms/[connectionId]/route.ts"));
  assert.match(route, /timingSafeEqual/, "the shared secret must be compared in constant time");
  assert.match(route, /rateLimit\(/, "an unauthenticated write must be rate limited");
  // Both "no such connection" and "wrong secret" return the same thing, so
  // status codes cannot be used to enumerate which connection ids exist.
  assert.doesNotMatch(route, /status: 404/, "an unknown connection must not answer 404");
  assert.doesNotMatch(route, /status: 401/, "a bad secret must not answer 401");
});

test("the vault entry offers an anon key and no service-role key", async () => {
  // A service-role key bypasses row-level security — it is root on the client's
  // whole database. Holding one per client would make this vault a far more
  // valuable target than it needs to be.
  const { INTEGRATION_CATALOG } = await import("../src/lib/integrations/catalog.ts");
  const supabase = INTEGRATION_CATALOG.find(entry => entry.id === "client-supabase");
  assert.ok(supabase, "the client-supabase provider must exist");

  const fieldIds = supabase.fields.map(field => field.id);
  assert.ok(fieldIds.includes("anonKey"), "the anon key must be collected");
  for (const field of fieldIds) {
    assert.doesNotMatch(field, /service.?role/i, `"${field}" looks like a service-role key — that must never be stored`);
  }

  const anon = supabase.fields.find(field => field.id === "anonKey");
  assert.equal(anon?.secret, true, "the anon key must be stored as a secret");
  assert.match(anon?.help ?? "", /never the service-role key/i, "the field must warn against pasting the wrong key");
});

test("a retried webhook delivery does not become a second enquiry", async () => {
  // Supabase retries. Counting a retry twice would inflate every enquiry figure
  // in the agency inbox — the kind of quiet wrongness nobody notices until they
  // are reporting on it.
  process.env.PORTAL_BACKEND = "memory";
  const { recordClientFormNotice, listClientFormNotices, countUnseenClientFormNotices, markClientFormNoticeSeen } =
    await import("../src/lib/server/clientForms/clientFormNotices.ts");

  const input = {
    agencyId: "agency_test",
    clientId: "cli_test",
    connectionId: "conn_test",
    table: "form_submissions",
    rowId: "row_1",
  };

  const first = recordClientFormNotice(input);
  const second = recordClientFormNotice(input);
  assert.equal(second.id, first.id, "a retried delivery must resolve to the same notice");
  assert.equal(listClientFormNotices("agency_test", "cli_test").length, 1, "one submission, one notice");

  // A different row IS a different enquiry.
  recordClientFormNotice({ ...input, rowId: "row_2" });
  assert.equal(listClientFormNotices("agency_test", "cli_test").length, 2);
  assert.equal(countUnseenClientFormNotices("agency_test", "cli_test"), 2);

  // …and a retry after somebody dealt with it must not mark it unseen again.
  markClientFormNoticeSeen("agency_test", first.id);
  assert.equal(countUnseenClientFormNotices("agency_test", "cli_test"), 1);
  const retried = recordClientFormNotice(input);
  assert.ok(retried.seenAt, "a retry must not resurrect a notice somebody has already handled");
  assert.equal(countUnseenClientFormNotices("agency_test", "cli_test"), 1);
});

test("a notice cannot be marked seen from another tenant", async () => {
  process.env.PORTAL_BACKEND = "memory";
  const { recordClientFormNotice, markClientFormNoticeSeen, countUnseenClientFormNotices } =
    await import("../src/lib/server/clientForms/clientFormNotices.ts");

  const mine = recordClientFormNotice({
    agencyId: "agency_a", clientId: "cli_a", connectionId: "conn_a", table: "t", rowId: "iso_1",
  });
  markClientFormNoticeSeen("agency_b", mine.id);
  assert.equal(
    countUnseenClientFormNotices("agency_a", "cli_a"), 1,
    "another agency must not be able to touch this notice, even holding its id",
  );
});

test("the reader never writes what it reads", () => {
  // The whole design rests on this: values are fetched when somebody looks and
  // are not kept. A cache added here — however reasonable it looked — would
  // make AquaCRM a controller of every client's customer data.
  const reader = stripComments(read("src/lib/server/clientForms/clientFormReader.ts"));

  assert.doesNotMatch(reader, /\bmutate\s*\(/, "the reader must not write to state");
  // WRITES, not reads. The first version of this forbade any mention of
  // `clientFormNotices[`, which also caught the legitimate lookup of the notice
  // being opened — an assertion so blunt it banned the module doing its job.
  assert.doesNotMatch(reader, /recordClientFormNotice/, "the reader must not create notices");
  assert.doesNotMatch(reader, /clientFormNotices\[[^\]]*\]\s*=/, "the reader must not write into the notice store");
  // No logging of what came back, either — an error string carrying the row
  // ends up in a log file, which is a copy by another name.
  assert.doesNotMatch(reader, /console\.(log|info|warn|error)/, "the reader must not log the response");
  assert.match(reader, /cache: "no-store"/, "the fetch must not be cached");
  assert.match(reader, /AbortController/, "a call into somebody else's database must be bounded");
});

test("the reader filters on the column the webhook actually matched", () => {
  // Supabase does not promise the key is called `id`. Guessing at read time
  // turns "we looked in the wrong column" into a silent "that enquiry is gone".
  const reader = stripComments(read("src/lib/server/clientForms/clientFormReader.ts"));
  assert.match(reader, /notice\.rowKey/, "the reader must use the recorded key column");

  const route = stripComments(read("src/app/api/public/client-forms/[connectionId]/route.ts"));
  assert.match(route, /rowKey: row\.key/, "the webhook must record which column it matched");
});

test("opening an enquiry is gated on the client it belongs to", () => {
  const route = stripComments(read("src/app/api/portal/client-forms/[noticeId]/route.ts"));

  // The gate names the notice's client, never anything from the request.
  assert.match(
    route, /requireCurrentClientWorkspaceElementAccess\(\s*notice\.clientId/,
    "the gate must use the client named by the NOTICE, not by the caller",
  );
  assert.match(route, /"client\.communications"/, "an inbound enquiry is governed as a communication");

  // Auth inside the try — four routes were found answering 500 to an
  // unauthenticated caller today because the throw sat above it.
  const body = route.split("export async function GET")[1] ?? "";
  const tryAt = body.indexOf("try {");
  const authAt = body.indexOf("requireSession(");
  assert.ok(tryAt >= 0 && authAt > tryAt, "requireSession must be inside the try, or its 401 escapes as a 500");
  assert.match(route, /AccessControlError/, "an access refusal must convert to its own status");
});

test("a failed read does not clear the unread badge", () => {
  // A timeout that marked the enquiry seen would quietly lose one nobody ever
  // looked at — the worst possible outcome for an enquiry tracker.
  const route = stripComments(read("src/app/api/portal/client-forms/[noticeId]/route.ts"));
  assert.match(
    route, /submission\.status === "ok" && !notice\.seenAt/,
    "only a successful read may mark a notice seen",
  );
});

test("client submissions land in the SAME words the internal path uses", async () => {
  // Ed, 2026-08-27: "make sure this all complies together please client facing
  // and internal facing and of course dev facing."
  //
  // The risk is a second vocabulary: the internal enquiry path already has
  // `name`/`email`/`phone`/`message` in `CORE_KEYS`, and a client submission
  // arriving in `customerName`/`emailAddress` would give the portal two words
  // for the same thing and make the two inboxes incomparable.
  const { mapClientFormSubmission } = await import("../src/lib/enquiries/clientFormMapping.ts");
  const { isCoreField } = await import("../src/lib/enquiries/formCapture.ts");

  const mapped = mapClientFormSubmission([
    { key: "id", value: "row-1" },
    { key: "full_name", value: "Jane Customer" },
    { key: "e-mail", value: "jane@example.com" },
    { key: "mobile", value: "07700 900000" },
    { key: "enquiry", value: "Please call me" },
    { key: "created_at", value: "2026-08-27T10:00:00Z" },
    { key: "which_branch", value: "Leeds" },
  ]);

  assert.equal(mapped.core.name, "Jane Customer");
  assert.equal(mapped.core.email, "jane@example.com");
  assert.equal(mapped.core.phone, "07700 900000");
  assert.equal(mapped.core.message, "Please call me");
  assert.equal(mapped.core.submittedAt, "2026-08-27T10:00:00Z");

  // The canonical names must be the internal ones, not a parallel set.
  for (const key of ["name", "email", "phone", "message"]) {
    assert.ok(isCoreField(key), `"${key}" must be a core field on the internal path too`);
  }

  // A custom question is KEPT — a portal showing only the four fields it knew
  // would misrepresent what the customer actually said.
  assert.deepEqual(mapped.additional, [{ key: "which_branch", value: "Leeds" }]);
  // …and their table's own bookkeeping is not something the customer said.
  assert.ok(!mapped.additional.some(field => field.key === "id"));
});

test("a configured column beats detection, and a missing one is not quietly replaced", async () => {
  const { mapClientFormSubmission } = await import("../src/lib/enquiries/clientFormMapping.ts");

  // Configured wins over the obvious name.
  const configured = mapClientFormSubmission(
    [{ key: "message", value: "the wrong one" }, { key: "enquiry_body_v2", value: "the right one" }],
    { columnMessage: "enquiry_body_v2" },
  );
  assert.equal(configured.core.message, "the right one");
  assert.equal(configured.provenance.message.source, "configured");

  // Configured but absent must NOT silently fall back to detection: somebody
  // stated which column this was, and answering from a different one would hide
  // a broken configuration behind a plausible value.
  const broken = mapClientFormSubmission(
    [{ key: "message", value: "not what was asked for" }],
    { columnMessage: "no_such_column" },
  );
  assert.equal(broken.core.message, undefined);
  assert.equal(broken.provenance.message.source, "absent");
});

test("email detection does not swallow a consent checkbox", async () => {
  // `email_opt_in` is a consent flag. A loose match would put "true" in the
  // address line, and somebody would reply to it.
  const { mapClientFormSubmission } = await import("../src/lib/enquiries/clientFormMapping.ts");
  const mapped = mapClientFormSubmission([
    { key: "email_opt_in", value: "true" },
    { key: "contact_email", value: "real@example.com" },
  ]);
  assert.equal(mapped.core.email, "real@example.com");
});

test("a name split across two columns keeps the surname", async () => {
  const { mapClientFormSubmission } = await import("../src/lib/enquiries/clientFormMapping.ts");
  const mapped = mapClientFormSubmission([
    { key: "first_name", value: "Jane" },
    { key: "last_name", value: "Customer" },
  ]);
  assert.equal(mapped.core.name, "Jane Customer");
  assert.equal(mapped.provenance.name.column, "first_name + last_name");
});

test("the confirmation cannot write a customer's address into our store", () => {
  // Sending a thank-you needs the one thing this design keeps out of our
  // database. The address is read, used and dropped — and the failure reasons
  // are a FIXED VOCABULARY because "could not send to jane@example.com" is the
  // most natural thing in the world to write into a log.
  const send = stripComments(read("src/lib/server/clientForms/clientFormConfirmation.ts"));
  const types = stripComments(read("src/server/types.ts"));

  // Only codes may be recorded.
  const reasonType = types.match(/confirmationReason\?: ([^;]+);/)?.[1] ?? "";
  assert.ok(reasonType, "confirmationReason must be declared");
  assert.doesNotMatch(reasonType, /\bstring\b/, "the reason must be a fixed set of codes, not free text");

  // Nothing derived from the row may be persisted.
  assert.doesNotMatch(send, /notice\.\w+\s*=\s*(to|name|submission)/, "no value from the row may be stored on the notice");
  assert.doesNotMatch(send, /console\.(log|info|warn|error)/, "the address must not reach a log");
  // The provider reference must not carry the recipient either — it ends up in
  // the email provider's own logs.
  assert.match(send, /externalRef: `client-form-confirmation:\$\{notice\.id\}`/, "the external reference must be the notice id");
});

test("a retried delivery cannot send a second thank-you", () => {
  // Claim BEFORE sending. A check that only recorded success would let two
  // concurrent deliveries both decide they were first.
  const send = stripComments(read("src/lib/server/clientForms/clientFormConfirmation.ts"));
  const claim = send.match(/function claim\(noticeId: string\): boolean \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(claim, "the claim helper must exist");
  assert.match(claim, /if \(!notice \|\| notice\.confirmationAt\) return;/, "an already-claimed notice must not be claimed again");
  assert.match(claim, /notice\.confirmationAt = Date\.now\(\)/, "the claim must be written");

  // …and the claim must happen before the read/send, not after.
  const claimAt = send.indexOf("if (!claim(noticeId)) return;");
  const sendAt = send.indexOf("sendTransactionalEmail(");
  assert.ok(claimAt > 0 && sendAt > claimAt, "the notice must be claimed before anything is sent");
});

test("the confirmation goes out from the CLIENT's own connection", () => {
  // A thank-you to their customer must not arrive from their agency.
  const send = stripComments(read("src/lib/server/clientForms/clientFormConfirmation.ts"));
  assert.match(send, /clientId: notice\.clientId/, "the send must be client-scoped so it uses their sender");
  // Enabled by writing a subject — a checkbox would let somebody switch it on
  // and ship a default nobody read.
  assert.match(send, /if \(!subject\) return;/, "no confirmation may go out until a subject is configured");
});

test("the webhook does not wait for the confirmation", () => {
  // Two outbound calls inline would push past Supabase's webhook timeout, and a
  // slow webhook is a retried one.
  const route = stripComments(read("src/app/api/public/client-forms/[connectionId]/route.ts"));

  // The PROPERTY, not the exact arrow function. The first version of this
  // pinned `after(() => sendClientFormConfirmation(notice.id))` character for
  // character and broke the moment a second task was added to the same
  // callback — a test failing on a shape it had no business caring about.
  const afterBlock = route.split("after(")[1]?.split("return accepted();")[0] ?? "";
  assert.ok(afterBlock, "the route must schedule work with after()");
  assert.match(afterBlock, /sendClientFormConfirmation\(notice\.id\)/, "the confirmation must run inside after()");

  // What must NOT happen is the request path waiting on it.
  const beforeAfter = route.split("after(")[0] ?? "";
  assert.doesNotMatch(beforeAfter, /await sendClientFormConfirmation/, "the webhook must not await the confirmation before responding");
});

test("an arriving form reaches the EXISTING automation engine, not just the built-in", async () => {
  // AquaCRM already has an automation engine — folders, workflows, runs, twelve
  // triggers. "What happens when a form arrives" belongs there. The built-in
  // confirmation is a zero-config default, not a second place to configure
  // enquiry handling that only this route knows about.
  const route = stripComments(read("src/app/api/public/client-forms/[connectionId]/route.ts"));
  assert.match(route, /triggerAutomations\(/, "the webhook must fire the automation engine");
  assert.match(route, /"client-form\.received"/, "with its own trigger, so it is selectable in the workspace");
  // Retries must not re-run workflows.
  assert.match(route, /idempotencyKey: `client-form:\$\{notice\.id\}`/, "the run must be keyed on the notice");

  // The event carries the POINTER only. A workflow needing the customer's
  // details reads them through the connection, so the boundary holds no matter
  // what anybody builds on top.
  const event = route.match(/"client-form\.received",\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.ok(event, "the event payload must be findable");
  for (const forbidden of ["email", "name", "phone", "message"]) {
    assert.doesNotMatch(event, new RegExp(`\\b${forbidden}\\b`, "i"), `the automation event must not carry "${forbidden}"`);
  }

  // …and it must be a first-class trigger, so it appears in the picker rather
  // than needing somebody to know a magic custom event name.
  const { } = await import("../src/server/types.ts");
  const workspace = read("src/app/portal/agency/automations/_AutomationsWorkspace.tsx");
  assert.match(workspace, /"client-form\.received": "Client website form received"/, "the trigger must be labelled in the workspace");
});

test("the client's own portal lists their enquiries without listing their customers", () => {
  // Ed, 2026-08-27: "the client needs an inbox as well… this way they can
  // actually receive stuff effectively."
  //
  // The list must stay a list of POINTERS. If it ever renders names or
  // messages, a portal left open on a screen sits there displaying every
  // customer's details, and the values would have to be fetched for all of them
  // on every page load.
  const views = stripComments(read("src/app/portal/customer/_CustomerPortalViews.tsx"));

  const summary = views.match(/export interface ClientFormNoticeSummary \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(summary, "the summary type must exist");
  for (const forbidden of ["email", "name", "phone", "message", "fields"]) {
    assert.doesNotMatch(
      summary, new RegExp(`\\b${forbidden}\\??:`, "i"),
      `the portal list must not carry "${forbidden}" — it is a pointer list`,
    );
  }

  // Loaded only for this client, only for this section.
  assert.match(views, /listClientFormNotices\(client\.agencyId, client\.id\)/, "notices must be scoped to this client");
  assert.match(views, /section === "enquiries"\s*\?/, "the list must load only for the enquiries section");
});

test("enquiries is a VIEW section, not a stored one", () => {
  // The stored model is `Record<ClientPortalSectionId, …>` — not partial. A
  // ninth stored id would leave every client portal already in the database
  // missing a key it is typed as having. The compiler caught this immediately
  // when the exclusion was missing, which is that Record earning its keep.
  const views = stripComments(read("src/app/portal/customer/_CustomerPortalViews.tsx"));
  assert.match(
    views, /Exclude<CustomerPortalSection, "service" \| "custom" \| "enquiries">/,
    "enquiries must be excluded from the stored-section type",
  );
  // …and the nav link must not go through the label lookup that indexes it.
  const chrome = stripComments(read("src/app/portal/customer/_CustomerPortalChrome.tsx"));
  const nav = chrome.match(/const NAV = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.ok(nav, "the NAV array must exist");
  assert.doesNotMatch(nav, /enquiries/, "enquiries must not join NAV — its label would be looked up in stored pages");
  assert.match(chrome, /\/portal\/customer\/enquiries/, "but the link must still exist");
});

test("a customer can open only their OWN enquiry", () => {
  // The id comes from the URL, so it is not trusted: the notice is looked up
  // scoped to the client this request already resolved to, and anything else
  // 404s. Verified behaviourally too — a notice seeded against another client
  // renders "not found" rather than its contents.
  const views = stripComments(read("src/app/portal/customer/_CustomerPortalViews.tsx"));

  assert.match(
    views, /findClientFormNotice\(client\.agencyId, noticeId\)/,
    "the lookup must be scoped to the resolved client's agency, not the URL",
  );
  assert.match(
    views, /notice\.clientId !== client\.id\) notFound\(\)/,
    "a notice belonging to another client must 404, not render",
  );

  const route = stripComments(read("src/app/portal/customer/[...rest]/page.tsx"));
  assert.match(route, /noticeId=\{rest\[1\]\}/, "the id is passed through for the view to validate");
});

test("a failed read tells the client WHICH failure it was", () => {
  // "Something went wrong" would be useless here: a deleted row, a revoked
  // connection and a timeout need three different actions from the client, and
  // only they can take them.
  const views = stripComments(read("src/app/portal/customer/_CustomerPortalViews.tsx"));
  assert.match(views, /no longer in your database/, "a deleted row must say so");
  assert.match(views, /no longer connected/, "a revoked connection must say so");
  assert.match(views, /did not answer in time/, "a timeout must say so");
  assert.match(views, /refused the request/, "an RLS refusal must point at the policy");
});

test("marking an enquiry read does not happen during a render", () => {
  // Writing in a render is what issue #21 removed, and the read-path analyser
  // flags it on sight — it caught the first version of this within one test run
  // AND flagged `customer/page.tsx`, which cannot reach the write but calls the
  // same function. Declaring a false positive as a deliberate writing render
  // would make that inventory less trustworthy, not more.
  const views = stripComments(read("src/app/portal/customer/_CustomerPortalViews.tsx"));
  assert.doesNotMatch(views, /markClientFormNoticeSeen/, "the customer views must not write while rendering");
  assert.match(views, /<MarkEnquirySeen noticeId=/, "the client marks it read after the page is on screen");

  const marker = stripComments(read("src/app/portal/customer/_MarkEnquirySeen.tsx"));
  // Strict mode runs effects twice, and this one POSTs.
  assert.match(marker, /sent\.current/, "the POST must fire once per view, not twice in strict mode");
  // Failing silently is the safe direction: the enquiry stays unread.
  assert.match(marker, /\.catch\(\(\) => undefined\)/, "a failed mark must not surface an error about a badge");
});

test("the customer's mark-read endpoint derives its tenant from the session", () => {
  const route = stripComments(read("src/app/api/portal/customer/enquiries/seen/route.ts"));

  assert.match(route, /CUSTOMER_PORTAL_ROLES/, "only the client audience may call it");
  // The agency comes off the client RECORD, never the request.
  assert.match(route, /getClient\(session\.clientId\)/, "the client must come from the session");
  assert.match(route, /findClientFormNotice\(client\.agencyId, noticeId\)/, "the agency must come from that client's record");
  assert.match(route, /notice\.clientId !== client\.id/, "another client's notice must not be markable");

  // Auth inside the try, per the four routes that answered 500 today.
  const body = route.split("export async function POST")[1] ?? "";
  const tryAt = body.indexOf("try {");
  const authAt = body.indexOf("requireRole(");
  assert.ok(tryAt >= 0 && authAt > tryAt, "requireRole must sit inside the try");
});

test("the mapping button and the reader agree, because they share one detector", async () => {
  // Ed, 2026-08-27: "aqua tag to scan for form fields perhaps so we can just
  // press a button instant mapping."
  //
  // The risk is two detectors: one that previews a mapping from the scanned
  // markup, and one that maps the submission when it actually arrives. If they
  // ever disagree, the preview shows one thing and the enquiry lands as
  // another — the worst kind of bug, because the preview is what somebody
  // approved.
  const { mapScannedForm, mapClientFormSubmission } = await import(
    "../src/lib/enquiries/clientFormMapping.ts"
  );

  const schema = [
    { name: "full_name", label: "Your name" },
    { name: "e-mail", label: "Email address" },
    { name: "mobile", label: "Phone" },
    { name: "enquiry", label: "How can we help?" },
    { name: "which_branch", label: "Which branch?" },
  ];

  const scanned = mapScannedForm(schema);
  assert.equal(scanned.roles.name.column, "full_name");
  assert.equal(scanned.roles.email.column, "e-mail");
  assert.equal(scanned.roles.phone.column, "mobile");
  assert.equal(scanned.roles.message.column, "enquiry");

  // The same form, now with values, must map identically.
  const submitted = mapClientFormSubmission(schema.map(f => ({ key: f.name, value: `v-${f.name}` })));
  assert.equal(submitted.provenance.name.column, scanned.roles.name.column);
  assert.equal(submitted.provenance.email.column, scanned.roles.email.column);
  assert.equal(submitted.provenance.phone.column, scanned.roles.phone.column);
  assert.equal(submitted.provenance.message.column, scanned.roles.message.column);

  // A preview that silently omitted the question it could not place is how
  // somebody approves a mapping that loses it.
  assert.deepEqual(scanned.unmapped.map(f => f.name), ["which_branch"]);

  // …and they must agree BY CONSTRUCTION, not by coincidence.
  //
  // The first version of this test compared outputs on one example and passed
  // while the two functions ran separate copies of the matching — a probe that
  // loosened the name patterns broke one guard and left the other green. Both
  // now call the same detector, so the source is asserted as well as the
  // behaviour.
  const src = stripComments(read("src/lib/enquiries/clientFormMapping.ts"));
  const submissionFn = src.split("export function mapClientFormSubmission(")[1]?.split("\nexport ")[0] ?? "";
  assert.ok(submissionFn, "the submission mapper must exist");
  assert.match(submissionFn, /detectClientFormFieldRoles\(/, "the submission mapper must use the shared detector");
  assert.doesNotMatch(submissionFn, /COLUMN_PATTERNS/, "it must not run its own copy of the matching");
});

test("a label can rescue a field whose name is meaningless", async () => {
  // Real forms carry `field_7`. The visible label is the only evidence left,
  // and it is prose — so it is a FALLBACK, never preferred over a name that
  // already matched.
  const { mapScannedForm } = await import("../src/lib/enquiries/clientFormMapping.ts");
  const mapped = mapScannedForm([
    { name: "field_7", label: "Email address" },
    { name: "field_8", label: "Your message" },
  ]);
  assert.equal(mapped.roles.email.column, "field_7");
  assert.equal(mapped.roles.message.column, "field_8");
});

test("loose LABEL matching never loosens NAME matching", async () => {
  // Labels are prose and are matched loosely; names are identifiers and stay
  // anchored. Collapsing the two would put "true" from `email_opt_in` into the
  // address line — the exact bug the anchored patterns exist to prevent.
  const { mapScannedForm } = await import("../src/lib/enquiries/clientFormMapping.ts");

  const mapped = mapScannedForm([
    { name: "email_opt_in", label: "Send me offers" },
    { name: "contact_email", label: "Email" },
  ]);
  assert.equal(mapped.roles.email.column, "contact_email", "the consent checkbox must not win the email role");

  // …and a loose label must not steal a field another role already claimed.
  const shared = mapScannedForm([
    { name: "email", label: "Email address" },
    { name: "notes", label: "Email us your details" },
  ]);
  assert.equal(shared.roles.email.column, "email", "an exact name match beats a label mention");
});

test("the mapping is shown where the scanned forms already are", () => {
  // Ed asked for a button; the useful half is that somebody can SEE the
  // proposed mapping next to the form it came from, before anything is saved.
  const panel = stripComments(read("src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx"));

  assert.match(panel, /mapScannedForm\(/, "the panel must compute the mapping");
  // Computed in place: the mapper is pure and has no server dependency, so a
  // round trip would be a request whose only purpose is to call a function.
  //
  // Narrowed 2026-08-28. This used to ban any fetch matching /mapping/, which
  // also banned SAVING one — a different operation that necessarily talks to
  // the server. The intent was always about DERIVING the mapping, so that is
  // what it now says: computed synchronously, and any request to the mapping
  // endpoint must be a write.
  assert.match(panel, /const mapped = mapScannedForm\(fields\);/, "the mapping must be derived synchronously, not awaited");
  for (const call of panel.matchAll(/fetch\("[^"]*mapping"[\s\S]{0,120}/g)) {
    assert.match(call[0], /method: "POST"/, "a request to the mapping endpoint may only ever write, never fetch the mapping itself");
  }

  // The fields must survive `toSummaries` — the panel used to keep only counts.
  assert.match(panel, /fields: ScannedField\[\]/, "the summary must carry the fields, not just a count");

  // The unmapped fields must be shown. A preview that quietly drops three
  // questions is how somebody approves a mapping that loses them.
  assert.match(panel, /Kept as extra answers/, "fields it could not place must be listed");

  // Only for forms the tag would capture — mapping a login is noise about
  // something that will never produce an enquiry.
  assert.match(panel, /form\.capturable && form\.fields\.length/, "only capturable forms should be mapped");
});

test("saving a mapping cannot wipe the connection it is saved onto", () => {
  // `saveIntegrationConnection` rebuilds the whole config and does
  // `delete config[field.id]` for any non-secret field it was NOT given. So the
  // obvious "just save the five column fields" call would silently remove
  // `projectUrl` and `submissionsTable` — the two values without which the
  // connection resolves to nothing and every enquiry stops arriving.
  //
  // The narrow mutator is incapable of that, which is a better guarantee than
  // remembering to send the other fields back every time.
  const mutator = stripComments(read("src/lib/server/clientForms/clientSupabaseMapping.ts"));
  assert.doesNotMatch(mutator, /saveIntegrationConnection/, "the mapping must not go through the whole-config save");
  assert.match(mutator, /COLUMN_KEYS/, "it must touch a named set of keys");
  // A blank must CLEAR one override, not all config.
  assert.match(mutator, /else delete live\.config\[key\]/, "a blank clears that override and returns the field to detection");

  const route = stripComments(read("src/app/api/portal/website-sources/mapping/route.ts"));
  // A client id in the body must not reach another tenant.
  assert.match(route, /client\.agencyId !== agencyId/, "the client must be validated against the caller's agency");
  // Gated as scanning is — whoever may not scan a client's forms should not
  // decide how they are read either.
  assert.match(route, /"fulfilment", "fulfilment\.tags", "use"/, "it must reuse the tag element");
});

test("every portal section the type declares is previewable by the agency", () => {
  // The bug this exists for, found in a browser and not by any test:
  // `CustomerPortalSection` gained "enquiries" and the preview route's
  // hand-written allowlist did not, so `?section=enquiries` fell through to
  // "home". Nothing failed — the agency was silently shown the wrong page, and
  // a responsiveness sweep of that URL measured the home view four times while
  // reporting it had measured the inbox.
  //
  // Two hand-maintained lists of the same thing is the shape of that bug, so
  // this compares them by parsing both rather than trusting either.
  const views = read("src/app/portal/customer/_CustomerPortalViews.tsx");
  const typeLine = /export type CustomerPortalSection =([^;]+);/.exec(views);
  assert.ok(typeLine, "CustomerPortalSection must still be a union literal for this check to mean anything");
  const declared = [...typeLine[1].matchAll(/"([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(declared.length >= 10, `expected the full section union, parsed ${declared.length}`);
  assert.ok(declared.includes("enquiries"), "the union must still carry the section this test was written for");

  const preview = read("src/app/client-preview/[clientId]/page.tsx");
  const allowLine = /new Set<CustomerPortalSection>\(\[([^\]]+)\]\)/.exec(preview);
  assert.ok(allowLine, "the preview route must still build its allowlist as a Set literal");
  const allowed = [...allowLine[1].matchAll(/"([a-z-]+)"/g)].map(match => match[1]);

  const missing = declared.filter(section => !allowed.includes(section));
  assert.deepEqual(missing, [], `sections the agency cannot preview: ${missing.join(", ")}`);

  // And the reverse — an allowlist entry that is not a real section would be a
  // dead string that quietly resolves to "home".
  const unknown = allowed.filter(section => !declared.includes(section));
  assert.deepEqual(unknown, [], `preview allows sections that do not exist: ${unknown.join(", ")}`);
});

test("the preview shows the inbox but never opens an enquiry", () => {
  // The privacy line for this section. The agency may see THAT an enquiry
  // arrived — they are notified by design, and the notice is an id, a
  // timestamp and a seen flag. They may not read the person's name, email or
  // message, which live in the client's own database and are fetched only by
  // the client's own detail view.
  const preview = read("src/app/client-preview/[clientId]/page.tsx");
  assert.match(preview, /listClientFormNotices\(client\.agencyId, client\.id\)/, "the preview must load notices scoped to that agency and client");
  // Pointers only: the preview must not reach the reader that calls out to
  // the client's database.
  assert.doesNotMatch(preview, /readClientFormSubmission/, "the preview must never read submission values");

  const views = stripComments(read("src/app/portal/customer/_CustomerPortalViews.tsx"));
  // The Open link must be behind the readOnly branch, not rendered always.
  assert.match(views, /readOnly \? \([\s\S]{0,400}Client only/, "preview rows must say the detail is client-only");
  assert.match(views, /EnquiriesView notices=\{enquiryNotices\} providerName=\{providerName\} readOnly=\{Boolean\(previewHrefPrefix\)\}/, "readOnly must be derived from preview mode, not passed by hand");
});

test("the detected mapping can be kept, and only where there is somewhere to keep it", () => {
  // The endpoint existed with tests and no way to reach it — the mapping was
  // shown and could not be accepted, so wiring a client's form still ended in
  // a manual edit. This pins the button to the rule that makes it correct.
  const panel = stripComments(read("src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx"));

  assert.match(panel, /fetch\("\/api\/portal\/website-sources\/mapping"/, "the panel must post to the mapping endpoint");

  // A site routed to OUR inbox has no client Supabase connection to store a
  // mapping on — those merge into the internal fields instead. Offering the
  // button there would promise something with nowhere to land.
  assert.match(panel, /clientId=\{source\.destinationClientId\}/, "the mapping must be told which client the site routes to");
  assert.match(panel, /if \(!clientId\) return;/, "saving must be impossible without a client");
  assert.match(panel, /clientId \? \(/, "the control must be hidden for a site that is not routed to a client");

  // All five columns, or a partly-saved mapping silently keeps stale overrides
  // for the roles it left out.
  for (const key of ["columnName", "columnEmail", "columnPhone", "columnMessage", "columnSubmittedAt"]) {
    assert.match(panel, new RegExp(`${key}:`), `the request must carry ${key}`);
  }

  // The server's 409 sentence is shown as-is; nothing else is.
  assert.match(panel, /payload\?\.message \|\| "Could not save this mapping\."/, "an unknown failure must not surface an internal message");
});
