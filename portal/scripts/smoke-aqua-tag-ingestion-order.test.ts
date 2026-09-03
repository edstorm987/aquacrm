process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_SESSION_SECRET ??= "aqua-tag-ingestion-order-secret";

import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AGENCY_ID = "agency_ingestion_test";
const SUBMISSION_ID = "aqua_sub_0123456789abcdef";

type Row = Record<string, unknown> & {
  id: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

let rows: Row[] = [];
let failNextInsert = false;
let failNextUpdate = false;
let sequence = 0;
const effects = { lead: 0, identity: 0, activity: 0, notification: 0, automation: 0 };

function queryValue(row: Row, column: string): unknown {
  if (column === "metadata->>submissionId") return row.metadata?.submissionId;
  return row[column];
}

function fakeSupabase() {
  return {
    // This suite pins the PROCESS-LOCAL path: the database answers "no such
    // function" for the delivery migration, exactly as a project that has not
    // applied it yet. The migrated path is proven by
    // smoke-aqua-tag-ingestion-durability and -durable-processes.
    async rpc(fn: string) {
      return {
        data: null,
        error: {
          code: "PGRST202",
          message: `Could not find the function public.${fn} in the schema cache`,
          details: null,
          hint: null,
        },
      };
    },
    from(table: string) {
      assert.equal(table, "brand_enquiries");
      let operation: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const filters: Array<(row: Row) => boolean> = [];
      let limit = Number.POSITIVE_INFINITY;

      const execute = () => {
        if (operation === "insert") {
          if (failNextInsert) {
            failNextInsert = false;
            return { data: null, error: { code: "XX000", message: "forced insert failure" } };
          }
          const row = {
            id: `enq_${++sequence}`,
            created_at: new Date().toISOString(),
            ...payload,
          } as Row;
          rows.push(row);
          return { data: row, error: null };
        }

        const matches = rows.filter(row => filters.every(filter => filter(row))).slice(0, limit);
        if (operation === "update") {
          if (failNextUpdate) {
            failNextUpdate = false;
            return { data: null, error: { code: "XX000", message: "forced update failure" } };
          }
          for (const row of matches) Object.assign(row, payload);
        }
        return { data: matches, error: null };
      };

      const builder = {
        select() { return builder; },
        insert(value: Record<string, unknown>) { operation = "insert"; payload = value; return builder; },
        update(value: Record<string, unknown>) { operation = "update"; payload = value; return builder; },
        eq(column: string, value: unknown) { filters.push(row => queryValue(row, column) === value); return builder; },
        gte(column: string, value: string) { filters.push(row => String(queryValue(row, column) ?? "") >= value); return builder; },
        order() { return builder; },
        limit(value: number) { limit = value; return builder; },
        async single() {
          const result = execute();
          return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
        },
        async maybeSingle() {
          const result = execute();
          return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
        },
        then(resolve: (value: ReturnType<typeof execute>) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function stub(modulePath: string, exports: Record<string, unknown>) {
  const id = require.resolve(modulePath);
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    paths: [],
    children: [],
    exports,
  } as never;
}

let formCapturePost: typeof import("../src/app/api/public/form-capture/route").POST;
let brandEnquiryPost: typeof import("../src/app/api/public/brand-enquiry/route").POST;
let NextRequest: typeof import("next/server").NextRequest;

before(() => {
  stub("../src/lib/supabase/admin", { createSupabaseAdminClient: fakeSupabase });
  stub("../src/lib/server/rateLimit", {
    clientIpFromHeaders: () => "127.0.0.1",
    rateLimit: () => ({ allowed: true, remaining: 100, retryAfterSec: 0 }),
  });
  stub("../src/server/websiteSources", {
    resolveAgencyByMasterSiteKey: () => AGENCY_ID,
    resolveWebsiteSourceRouting: () => ({ kind: "inbox" }),
  });
  stub("../src/lib/server/clients/clientRecordLedger", { upsertClientRecordLedgerEvent: () => ({}) });
  stub("../src/built-ins/modules/leads-pipeline/src/server/index", {
    containerFor: () => ({
      leads: {
        upsert: async () => {
          effects.lead += 1;
          return { lead: { id: "lead_ingestion_test" } };
        },
      },
    }),
  });
  stub("../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation", {
    ensureLeadsPipelineFoundationRegistered: () => undefined,
  });
  stub("../src/lib/server/seeds/founderSeed", {
    FOUNDER_AGENCY_SLUG: "milesymedia",
    FOUNDER_EMAIL: "founder@example.test",
    seedFounder: async () => undefined,
  });
  stub("../src/lib/server/pluginStorage", { makePluginStorage: () => ({}) });
  stub("../src/server/pluginInstalls", { getInstall: () => ({ id: "install_test", enabled: true }) });
  stub("../src/server/activity", { logActivity: () => { effects.activity += 1; return {}; } });
  stub("../src/server/storage", {
    ensureHydrated: async () => undefined,
    flushPendingWrites: async () => undefined,
  });
  stub("../src/server/tenants", { getAgencyBySlug: () => ({ id: AGENCY_ID, name: "Test Agency" }) });
  stub("../src/server/users", { getUser: () => ({ id: "founder_test", email: "founder@example.test" }) });
  stub("../src/server/zimanteTradingCompanies", {
    ensureZimanteTradingCompanies: () => ({ milesymedia: { id: "company_milesymedia" } }),
  });
  stub("../src/lib/server/email/enquiryNotifications", {
    notifyBrandEnquiry: async () => { effects.notification += 1; return { attempted: true, sent: true }; },
  });
  stub("../src/server/automations", {
    triggerAutomations: async () => { effects.automation += 1; return []; },
  });
  stub("../src/lib/server/identityResolution", {
    resolveContactIdentity: () => ({
      status: "unmatched",
      confidence: 0,
      explanation: "No client matched.",
      resolvedAt: Date.now(),
    }),
    upsertIdentityResolutionReview: () => { effects.identity += 1; },
  });

  ({ NextRequest } = require("next/server"));
  ({ POST: formCapturePost } = require("../src/app/api/public/form-capture/route"));
  ({ POST: brandEnquiryPost } = require("../src/app/api/public/brand-enquiry/route"));
});

beforeEach(() => {
  rows = [];
  failNextInsert = false;
  failNextUpdate = false;
  sequence = 0;
  Object.assign(effects, { lead: 0, identity: 0, activity: 0, notification: 0, automation: 0 });
});

function captureRequest() {
  return new NextRequest("http://localhost/api/public/form-capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteKey: "aqua_public_milesymedia_v1",
      submissionId: SUBMISSION_ID,
      pageUrl: "https://milesymedia.com/contact",
      pagePath: "/contact",
      formName: "Website enquiry",
      fields: [
        { key: "name", value: "Taylor" },
        { key: "email", value: "taylor@example.test" },
        { key: "budget", value: "£5,000" },
      ],
    }),
  });
}

function brandRequest() {
  return new NextRequest("http://localhost/api/public/brand-enquiry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      brand: "milesymedia",
      submissionId: SUBMISSION_ID,
      name: "Taylor",
      email: "taylor@example.test",
      contactMethod: "email",
      services: ["Photography"],
      message: "A launch shoot",
      sourceUrl: "https://milesymedia.com/contact",
      consent: true,
    }),
  });
}

function assertOneCompleteEnquiry() {
  assert.equal(rows.length, 1, "one browser submission must have one database row");
  assert.equal(rows[0].consent, true);
  assert.equal(rows[0].contact_method, "email");
  assert.equal(rows[0].metadata.submissionId, SUBMISSION_ID);
  assert.equal(rows[0].metadata.ingestionState, "complete");
  assert.ok(rows[0].metadata.formCapture, "the complete row lost the tag's richer field capture");
}

describe("the real public handlers reconcile one Aqua submission (process-local fallback)", () => {
  it("promotes a tag-first row and runs downstream effects once, and says which boundary held it", async () => {
    const captured = await formCapturePost(captureRequest());
    assert.equal(captured.status, 200);
    assert.equal((await captured.json() as { boundary?: string }).boundary, "process-local",
      "without the migration the receipt must name the weaker guarantee");
    const accepted = await brandEnquiryPost(brandRequest());
    assert.equal(accepted.status, 200);
    const acceptedBody = await accepted.json() as { boundary?: string; delivery?: string; submissionId?: string };
    assert.equal(acceptedBody.boundary, "process-local");
    assert.equal(acceptedBody.delivery, "complete");
    assert.equal(acceptedBody.submissionId, SUBMISSION_ID, "the receipt must name the exact id the tag sent");
    assertOneCompleteEnquiry();

    const replay = await brandEnquiryPost(brandRequest());
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { deduped?: boolean }).deduped, true);
    assert.deepEqual(effects, { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
  });

  it("attaches a later tag capture without replacing the completed enquiry", async () => {
    assert.equal((await brandEnquiryPost(brandRequest())).status, 200);
    assert.equal((await formCapturePost(captureRequest())).status, 200);
    assertOneCompleteEnquiry();
    assert.deepEqual(effects, { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
  });

  it("serialises simultaneous delivery by the shared submission id", async () => {
    const responses = await Promise.all([
      formCapturePost(captureRequest()),
      brandEnquiryPost(brandRequest()),
    ]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assertOneCompleteEnquiry();
    assert.deepEqual(effects, { lead: 1, identity: 1, activity: 1, notification: 1, automation: 1 });
  });

  it("reports an insert failure as retryable and recovers with the same id", async () => {
    failNextInsert = true;
    const failed = await formCapturePost(captureRequest());
    assert.equal(failed.status, 503);
    assert.equal((await failed.json() as { ok?: boolean }).ok, false);
    assert.equal(rows.length, 0);

    const recovered = await formCapturePost(captureRequest());
    assert.equal(recovered.status, 200);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].metadata.submissionId, SUBMISSION_ID);
  });

  it("does not acknowledge a failed promotion and can resume it", async () => {
    assert.equal((await formCapturePost(captureRequest())).status, 200);
    failNextUpdate = true;
    const failed = await brandEnquiryPost(brandRequest());
    assert.equal(failed.status, 503);
    assert.equal(rows[0].consent, false, "the failed update must not look promoted");

    assert.equal((await brandEnquiryPost(brandRequest())).status, 200);
    assertOneCompleteEnquiry();
  });
});
