// Durable Aqua Tag ingestion — the database boundary, in one process (issues #87).
//
// Drives the REAL public handlers and the REAL delivery orchestrator against
// the reference model in scripts/fixtures/aqua-tag-ingestion-worker.mjs, which
// mirrors `20260902093000_aqua_tag_submission_delivery.sql` with a controllable
// clock and fault injection. What is proven here:
//
//   - one non-null identity per (tenant, submission id), whichever half of the
//     submission arrives first, and when both arrive at once;
//   - a replay is deduped without repeating effects; contradictory reuse of an
//     id is refused (409) and leaves the first submission untouched;
//   - a crash after an effect and before its acknowledgement is replayed by the
//     sweep WITHOUT repeating the non-idempotent effect, and the canonical row
//     says "unknown" rather than "sent";
//   - a stale owner can neither checkpoint nor settle once another owner has
//     reclaimed the expired lease;
//   - failures retry with bounded attempts and end in a terminal dead-letter
//     that carries a safe error and truthful metadata;
//   - the public receipt says the enquiry is durable and, separately, whether
//     delivery finished — and the fallback names its weaker guarantee.
//
// The SQL itself is only exercised by smoke-aqua-tag-ingestion-live-postgres,
// which needs a disposable database; the model is its stand-in, not its proof.
process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "aqua-tag-ingestion-durability-secret";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const SUBMISSION_ID = "aqua_sub_durability0000000001";

type Fixture = typeof import("./fixtures/aqua-tag-ingestion-worker.mjs");
type Model = ReturnType<Fixture["createSubmissionStoreModel"]>;

let fixture: Fixture;
let model: Model;
let client: ReturnType<Fixture["createModelClient"]>;
let NextRequest: typeof import("next/server").NextRequest;
let formCapturePost: typeof import("../src/app/api/public/form-capture/route").POST;
let brandEnquiryPost: typeof import("../src/app/api/public/brand-enquiry/route").POST;
let delivery: typeof import("../src/lib/server/enquirySubmissionDelivery");
let claims: typeof import("../src/lib/supabase/enquirySubmissionClaims");
const effects: Record<string, number> = {};
const flags = { failLead: false, failAutomation: false, failNotification: false };

before(async () => {
  fixture = await import("./fixtures/aqua-tag-ingestion-worker.mjs");
  model = fixture.createSubmissionStoreModel();
  client = fixture.createModelClient(model);
  fixture.installRouteStubs({
    client,
    flags,
    report: async (name: string) => { effects[name] = (effects[name] ?? 0) + 1; },
  });
  ({ NextRequest } = require_("next/server"));
  ({ POST: formCapturePost } = require_("../src/app/api/public/form-capture/route"));
  ({ POST: brandEnquiryPost } = require_("../src/app/api/public/brand-enquiry/route"));
  delivery = require_("../src/lib/server/enquirySubmissionDelivery");
  claims = require_("../src/lib/supabase/enquirySubmissionClaims");
});

beforeEach(() => {
  model.reset();
  for (const key of Object.keys(effects)) delete effects[key];
  flags.failLead = false;
  flags.failAutomation = false;
  flags.failNotification = false;
});

function post(handler: typeof formCapturePost, url: string, body: Record<string, unknown>) {
  return handler(new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}
const capture = (overrides: Record<string, unknown> = {}) =>
  post(formCapturePost, "http://localhost/api/public/form-capture", fixture.captureBody(SUBMISSION_ID, overrides));
const brand = (overrides: Record<string, unknown> = {}) =>
  post(brandEnquiryPost, "http://localhost/api/public/brand-enquiry", fixture.brandBody(SUBMISSION_ID, overrides));

type Receipt = { ok?: boolean; boundary?: string; delivery?: string; deduped?: boolean; submissionId?: string; enquiryId?: string; attached?: boolean; error?: string };
const json = async (response: Response) => await response.json() as Receipt;

function submission() {
  const row = model.submission(fixture.AGENCY_ID, SUBMISSION_ID);
  assert.ok(row, "the identity row must exist");
  return row as Record<string, any>;
}

function theOneEnquiry() {
  const rows = model.dump().enquiries as Array<Record<string, any>>;
  assert.equal(rows.length, 1, `one browser submission must have one database row (got ${rows.length})`);
  return rows[0];
}

function assertCompleteDelivery(options: { capture?: boolean } = {}) {
  const row = theOneEnquiry();
  assert.equal(row.consent, true);
  assert.equal(row.contact_method, "email");
  assert.equal(row.metadata.submissionId, SUBMISSION_ID);
  if (options.capture !== false) assert.ok(row.metadata.formCapture, "the tag's richer capture must survive promotion");
  assert.equal(row.metadata.ingestionState, "complete");
  assert.equal(row.metadata.deliveryState, "complete");
  assert.equal(row.metadata.notification, "sent");
  const identity = submission();
  assert.equal(identity.state, "complete");
  assert.equal(identity.work_status, "complete");
  assert.equal(identity.enquiry_id, row.id);
  assert.equal(identity.claim_owner, null, "a settled claim releases its owner");
  assert.deepEqual(effects, { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
}

describe("the durable boundary: one identity, atomic merge, honest receipts", () => {
  it("tag-first: the hold row is promoted in place and the receipt names the database boundary", async () => {
    const held = await json(await capture());
    assert.equal(held.ok, true);
    assert.equal(held.boundary, "database");
    assert.equal(held.attached, false);
    assert.equal(held.submissionId, SUBMISSION_ID);
    assert.equal(submission().state, "capture-only");
    assert.equal(theOneEnquiry().consent, false, "a hold row is not a consented enquiry yet");

    const accepted = await json(await brand());
    assert.equal(accepted.ok, true);
    assert.equal(accepted.boundary, "database");
    assert.equal(accepted.delivery, "complete");
    assert.equal(accepted.submissionId, SUBMISSION_ID);
    assertCompleteDelivery();
  });

  it("brand-first: a later tag capture attaches to the completed enquiry without a second row", async () => {
    assert.equal((await json(await brand())).delivery, "complete");
    const attached = await json(await capture());
    assert.equal(attached.attached, true);
    assert.equal(attached.boundary, "database");
    assertCompleteDelivery();
  });

  it("simultaneous arrival of both halves still yields one row and one effect set", async () => {
    const [held, accepted] = await Promise.all([capture(), brand()]);
    assert.deepEqual([held.status, accepted.status], [200, 200]);
    assertCompleteDelivery();
  });

  it("a replayed brand submission is deduped: nothing changes and no effect repeats", async () => {
    await brand();
    const replay = await json(await brand());
    assert.equal(replay.ok, true);
    assert.equal(replay.deduped, true);
    assert.equal(replay.delivery, "complete");
    assertCompleteDelivery({ capture: false });
  });

  it("the same id reused for a different contact is refused and the first submission is untouched", async () => {
    await brand();
    const before = JSON.stringify(model.dump());
    const refused = await brand({ email: "someone-else@example.test" });
    assert.equal(refused.status, 409);
    assert.equal((await json(refused)).ok, false);
    assert.equal(JSON.stringify(model.dump()), before, "a refused reuse must change nothing");
    assert.deepEqual(effects, { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
  });

  it("the same id reused by the tag for different answers is refused, and a fresh id under conflict leaves no identity row", async () => {
    await capture();
    const refused = await capture({ fields: [{ key: "email", value: "other@example.test" }] });
    assert.equal(refused.status, 409);
    assert.equal(model.dump().enquiries.length, 1);
    assert.equal(model.dump().submissions.length, 1);
  });

  it("a retried tag capture with the same answers is a no-op receipt for the same id", async () => {
    const first = await json(await capture());
    const again = await json(await capture());
    assert.equal(again.enquiryId, first.enquiryId);
    assert.equal(again.submissionId, SUBMISSION_ID);
    assert.equal(model.dump().enquiries.length, 1);
  });
});

describe("crash recovery, fencing and bounded retries", () => {
  it("a crash after the notification went out and before its acknowledgement is replayed without a second send", async () => {
    // The acknowledgement that would record "notification done" never lands:
    // the connection dies right there. The row keeps its lease; the handler
    // must not report success it cannot see.
    model.injectFault({
      target: "rpc:checkpoint_aqua_tag_submission_work",
      mode: "throw",
      match: (args: Record<string, any>) => args.p_effect === "notification" && args.p_record?.status === "done",
    });
    const interrupted = await json(await brand());
    assert.equal(interrupted.ok, true, "the enquiry itself is durable");
    assert.equal(interrupted.delivery, "pending", "delivery must not be reported complete");
    assert.equal(effects.notification, 1);
    let row = submission();
    assert.equal(row.work_status, "processing", "the claim stays leased by the dead owner");
    assert.equal(row.effects.notification.status, "attempted");
    assert.equal(theOneEnquiry().metadata.ingestionState, "processing");

    // Before the lease expires nobody else may touch it.
    const early = await delivery.processAquaTagSubmissionDeliveries({ client, limit: 5 });
    assert.equal(early.claimed, 0);

    model.advanceClock(91_000);
    const sweep = await delivery.processAquaTagSubmissionDeliveries({ client, limit: 5 });
    assert.equal(sweep.claimed, 1);
    assert.equal(sweep.completed, 1);
    assert.equal(effects.notification, 1, "the notification must never be sent twice");
    assert.equal(effects.automation, 1, "the effect after the crash point runs exactly once");
    assert.equal(effects.lead, 1, "checkpointed effects before the crash are not repeated");
    row = submission();
    assert.equal(row.work_status, "complete");
    assert.equal(row.effects.notification.status, "unknown");
    const enquiry = theOneEnquiry();
    assert.equal(enquiry.metadata.ingestionState, "complete");
    assert.equal(enquiry.metadata.notification, "unknown", "the row must not claim the email was sent");
    assert.equal(enquiry.metadata.automation, "not-configured");
  });

  it("a stale owner can neither checkpoint nor settle after another owner reclaimed its expired lease", async () => {
    // Keep the work pending: the inline claim fails once, so the row is
    // enqueued but unrun, and the receipt says so.
    model.injectFault({ target: "rpc:claim_aqua_tag_submission_work", mode: "error" });
    const pending = await json(await brand());
    assert.equal(pending.delivery, "pending");
    assert.equal(submission().work_status, "pending");

    const first = await claims.claimAquaTagSubmissionWork(client, { owner: "owner-a", leaseMs: 1_000, tenantScope: fixture.AGENCY_ID, submissionId: SUBMISSION_ID });
    assert.equal(first?.length, 1);
    const held = await claims.claimAquaTagSubmissionWork(client, { owner: "owner-b", leaseMs: 1_000, tenantScope: fixture.AGENCY_ID, submissionId: SUBMISSION_ID });
    assert.equal(held?.length, 0, "a live lease is not claimable");

    model.advanceClock(1_500);
    const second = await claims.claimAquaTagSubmissionWork(client, { owner: "owner-b", leaseMs: 90_000, tenantScope: fixture.AGENCY_ID, submissionId: SUBMISSION_ID });
    assert.equal(second?.length, 1);
    assert.notEqual(second![0].token, first![0].token, "a reclaim mints a new fencing token");
    assert.equal(second![0].attempts, 2);

    assert.equal(await claims.checkpointAquaTagSubmissionWork(client, first![0], "lead", { status: "done" }), false);
    const stale = await claims.settleAquaTagSubmissionWork(client, first![0], { outcome: "complete", metadataPatch: { ingestionState: "complete" } });
    assert.equal(stale.settled, false);
    assert.equal(stale.reason, "lease_lost");
    assert.equal(theOneEnquiry().metadata.ingestionState, "processing", "a refused settle must not patch the canonical row");

    const live = await claims.settleAquaTagSubmissionWork(client, second![0], { outcome: "complete", metadataPatch: { ingestionState: "complete" } });
    assert.equal(live.settled, true);
    assert.equal(submission().work_status, "complete");
    assert.equal(theOneEnquiry().metadata.ingestionState, "complete");
  });

  it("failures retry with bounded attempts and end in a terminal dead-letter with a safe error", async () => {
    // The lead store is down. (An automation or notification failure is
    // recorded as a status and does not fail the delivery — unchanged.)
    flags.failLead = true;
    const first = await json(await brand());
    assert.equal(first.ok, true);
    assert.equal(first.delivery, "pending");
    let row = submission();
    assert.equal(row.work_status, "pending");
    assert.equal(row.attempts, 1);
    assert.ok(Date.parse(row.available_at) > model.now(), "a retry is scheduled after a backoff, not immediately");

    const tooEarly = await delivery.processAquaTagSubmissionDeliveries({ client, limit: 5 });
    assert.equal(tooEarly.claimed, 0, "backoff must be honoured");

    for (let attempt = 2; attempt <= 6; attempt += 1) {
      model.advanceClock(3_600_000);
      const sweep = await delivery.processAquaTagSubmissionDeliveries({ client, limit: 5 });
      assert.equal(sweep.claimed, 1, `attempt ${attempt} should be claimable after its backoff`);
      row = submission();
      assert.equal(row.attempts, attempt);
    }
    assert.equal(row.work_status, "dead");
    assert.equal(row.state, "dead-letter");
    assert.ok(row.dead_lettered_at);
    assert.match(String(row.last_error), /^lead: lead store unavailable/);
    assert.doesNotMatch(String(row.last_error), /sk_live|at somewhere/, "a stored error must carry no secret and no stack");
    // Nothing downstream of the failing first step ever ran, on any attempt.
    assert.deepEqual(effects, {});
    const enquiry = theOneEnquiry();
    assert.equal(enquiry.metadata.ingestionState, "failed");
    assert.equal(enquiry.metadata.deliveryState, "dead-letter");
    assert.doesNotMatch(String(enquiry.metadata.deliveryError), /sk_live/);

    model.advanceClock(3_600_000);
    const after = await delivery.processAquaTagSubmissionDeliveries({ client, limit: 5 });
    assert.equal(after.claimed, 0, "dead-letter is terminal");

    // A replay of the same submission neither restarts the work nor claims success.
    const replay = await json(await brand());
    assert.equal(replay.deduped, true);
    assert.equal(replay.delivery, "failed");
  });

  it("the sweep reports absent configuration and an absent migration as statuses, not failures", async () => {
    model.setMode("legacy");
    const unavailable = await delivery.processAquaTagSubmissionDeliveries({ client, limit: 5 });
    assert.equal(unavailable.status, "unavailable");
    const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    try {
      assert.equal((await delivery.processAquaTagSubmissionDeliveries({ limit: 5 })).status, "not-configured");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url ?? "";
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key ?? "";
    }
  });
});

describe("the fallback and the static contract", () => {
  it("without the migration both routes still work and name the weaker process-local guarantee", async () => {
    model.setMode("legacy");
    const held = await json(await capture());
    assert.equal(held.ok, true);
    assert.equal(held.boundary, "process-local");
    const accepted = await json(await brand());
    assert.equal(accepted.ok, true);
    assert.equal(accepted.boundary, "process-local");
    assert.equal(accepted.delivery, "complete");
    assert.equal(model.dump().submissions.length, 0, "the fallback has no database identity to write");
    assert.equal(model.dump().enquiries.length, 1);
    assert.deepEqual(effects, { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
  });

  it("the migration, the sweep wiring and the tag receipt rule are the shape the runtime relies on", () => {
    const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
    const migration = read("../../supabase/migrations/20260902093000_aqua_tag_submission_delivery.sql");
    assert.match(migration, /create table if not exists public\.aqua_tag_submissions/);
    assert.match(migration, /primary key \(tenant_scope, submission_id\)/);
    assert.match(migration, /tenant_scope text not null check \(length\(btrim\(tenant_scope\)\) > 0\)/);
    assert.match(migration, /errcode = 'AQ409'/);
    assert.match(migration, /on conflict \(tenant_scope, submission_id\) do nothing/);
    assert.match(migration, /for update skip locked/);
    assert.match(migration, /claim_token = gen_random_uuid\(\)/);
    assert.match(migration, /and s\.claim_owner = p_owner\s+and s\.claim_token = p_token\s+and s\.lease_expires_at > now\(\)/);
    assert.match(migration, /submission\.attempts >= submission\.max_attempts then/);
    assert.match(migration, /revoke all on table public\.aqua_tag_submissions from public, anon, authenticated/);
    assert.match(migration, /update public\.brand_enquiries e\s+set metadata = e\.metadata \|\| p_metadata_patch/);

    const cron = read("../src/app/api/cron/inbox/route.ts");
    assert.match(cron, /import "@\/app\/api\/public\/brand-enquiry\/route"/);
    assert.match(cron, /processAquaTagSubmissionDeliveries\(\{ limit: 25 \}\)/);
    assert.match(cron, /aquaTagDeliveries/);

    const tag = read("../src/lib/integrations/aquaTagSource.ts");
    assert.match(tag, /if \(result\.submissionId !== submissionId\) throw new Error\("capture receipt mismatch"\)/);

    const orchestrator = read("../src/lib/server/enquirySubmissionDelivery.ts");
    assert.match(orchestrator, /NON_IDEMPOTENT_EFFECTS[^;]*new Set\(\["notification"\]\)/);
    const wrapper = read("../src/lib/supabase/enquirySubmissionClaims.ts");
    assert.doesNotMatch(wrapper, /createSupabaseAdminClient\(/, "the wrapper must be handed a client, never mint the service role itself");
    assert.doesNotMatch(orchestrator, /createSupabaseAdminClient\(/);
  });
});
