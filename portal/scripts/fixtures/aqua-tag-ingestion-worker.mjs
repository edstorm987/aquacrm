#!/usr/bin/env node
// Aqua Tag ingestion test fixture (issues #87).
//
// Two things live here so the in-process and the real-process suites cannot
// drift onto different models of the database:
//
//   1. `createSubmissionStoreModel()` — a reference model of the two tables the
//      public routes touch (`brand_enquiries`, `aqua_tag_submissions`) and of
//      the four RPCs in `20260902093000_aqua_tag_submission_delivery.sql`,
//      written to mirror that SQL statement for statement: identity
//      insert-or-reuse, immutable-fact merge with AQ409 on contradiction,
//      atomic create/promote/attach, owner+token fenced claims with lease
//      expiry, bounded retries with exponential backoff, and terminal
//      dead-letter. It has a controllable clock and fault injection. It is a
//      MODEL: the SQL itself is proven only by
//      smoke-aqua-tag-ingestion-live-postgres against a real database.
//
//   2. Run as a program, a WORKER: a separate Node process that drives the
//      real route handlers (with the same module stubs the ingestion-order
//      suite uses) against a coordinator that owns one model over HTTP, so
//      several processes race one submission. It can die with SIGKILL right
//      after a named effect has happened and before it is acknowledged —
//      the crash the delivery boundary exists to survive.
//
//   AQUA_TEST_INPUT='{"action":"brand", "coordinatorUrl":"http://127.0.0.1:NNN", ...}'
//     node --conditions=react-server --import tsx scripts/fixtures/aqua-tag-ingestion-worker.mjs

import { randomUUID } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const AGENCY_ID = "agency_ingestion_test";
export const SITE_KEY = "aqua_public_milesymedia_v1";

const CONFLICT_CODE = "AQ409";
const MISSING_FUNCTION = fn => ({
  code: "PGRST202",
  message: `Could not find the function public.${fn} in the schema cache`,
  details: null,
  hint: null,
});

const SUBMISSION_ID = /^aqua_sub_[A-Za-z0-9_-]{12,100}$/;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const iso = ms => new Date(ms).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// The reference model
// ─────────────────────────────────────────────────────────────────────────────

export function createSubmissionStoreModel() {
  const state = {
    enquiries: [],
    submissions: new Map(),
    sequence: 0,
    clockOffset: 0,
    faults: [],
    effects: [],
    mode: "database",
  };
  const now = () => Date.now() + state.clockOffset;
  const key = (scope, id) => `${scope}|${id}`;

  function consumeFault(target, args) {
    const index = state.faults.findIndex(fault => fault.target === target && (!fault.match || fault.match(args)));
    if (index < 0) return null;
    const fault = state.faults[index];
    fault.times -= 1;
    if (fault.times <= 0) state.faults.splice(index, 1);
    return fault;
  }

  function columnValue(row, column) {
    if (column === "metadata->>submissionId") return row.metadata?.submissionId;
    return row[column];
  }

  // A PostgREST-shaped query against one of the two tables.
  function query(op) {
    const table = op.table === "brand_enquiries" ? state.enquiries
      : op.table === "aqua_tag_submissions" ? [...state.submissions.values()]
      : null;
    if (!table) return { data: null, error: { code: "42P01", message: `relation "${op.table}" does not exist` } };
    const filters = (op.filters ?? []).map(filter => row => {
      const value = columnValue(row, filter.column);
      if (filter.type === "eq") return value === filter.value;
      if (filter.type === "gte") return String(value ?? "") >= String(filter.value);
      if (filter.type === "lt") return String(value ?? "") < String(filter.value);
      return true;
    });
    const fault = consumeFault(op.operation, op);
    if (fault) return { data: null, error: { code: "XX000", message: fault.message ?? `forced ${op.operation} failure` } };
    if (op.operation === "insert") {
      if (op.table !== "brand_enquiries") return { data: null, error: { code: "42501", message: "insert refused" } };
      const row = { id: `enq_${++state.sequence}`, created_at: iso(now()), ...clone(op.payload) };
      state.enquiries.push(row);
      return finish(op, [row]);
    }
    const matches = table.filter(row => filters.every(filter => filter(row))).slice(0, op.limit ?? Number.POSITIVE_INFINITY);
    if (op.operation === "update") {
      for (const row of matches) Object.assign(row, clone(op.payload));
    }
    return finish(op, matches);
  }

  function finish(op, rows) {
    const data = clone(rows);
    if (op.single) return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }

  function rpc(fn, args) {
    if (state.mode === "legacy") return { data: null, error: MISSING_FUNCTION(fn) };
    const fault = consumeFault(`rpc:${fn}`, args);
    if (fault?.mode === "throw") throw new Error(fault.message ?? `forced ${fn} transport failure`);
    if (fault) return { data: null, error: { code: "XX000", message: fault.message ?? `forced ${fn} failure` } };
    if (fn === "ingest_aqua_tag_submission") return ingest(args);
    if (fn === "claim_aqua_tag_submission_work") return claim(args);
    if (fn === "checkpoint_aqua_tag_submission_work") return checkpoint(args);
    if (fn === "settle_aqua_tag_submission_work") return settle(args);
    return { data: null, error: MISSING_FUNCTION(fn) };
  }

  function mergeFacts(existing, incoming) {
    const merged = { ...(existing ?? {}) };
    if (!isObject(incoming)) return merged;
    for (const [name, value] of Object.entries(incoming)) {
      if (value === null || value === undefined) continue;
      if (name in merged && merged[name] !== null && merged[name] !== undefined && !same(merged[name], value)) {
        const error = new Error(`aqua_tag_submission_conflict:${name}`);
        error.code = CONFLICT_CODE;
        error.details = `The submission reference was already used with a different ${name}.`;
        throw error;
      }
      merged[name] = clone(value);
    }
    return merged;
  }

  function enquiryFromRow(row, metadata) {
    return {
      id: `enq_${++state.sequence}`,
      created_at: iso(now()),
      brand_slug: row.brand_slug ?? null,
      name: row.name || "Unknown",
      email: row.email ?? null,
      phone: row.phone ?? null,
      contact_method: row.contact_method ?? null,
      services: Array.isArray(row.services) ? [...row.services] : [],
      message: row.message ?? null,
      source_url: row.source_url ?? null,
      campaign: row.campaign ?? null,
      consent: row.consent === true,
      agency_id: row.agency_id || null,
      metadata,
    };
  }

  function ingest(args) {
    const scope = args.p_tenant_scope;
    const id = args.p_submission_id;
    if (!scope || !String(scope).trim()) return { data: null, error: { code: "P0001", message: "tenant scope is required" } };
    if (!SUBMISSION_ID.test(String(id ?? ""))) return { data: null, error: { code: "P0001", message: "submission id is invalid" } };
    if (!args.p_site_key) return { data: null, error: { code: "P0001", message: "site key is required" } };
    if (args.p_arrival !== "tag" && args.p_arrival !== "brand") return { data: null, error: { code: "P0001", message: "arrival must be tag or brand" } };
    if (!isObject(args.p_enquiry_row)) return { data: null, error: { code: "P0001", message: "enquiry row must be an object" } };

    const existing = state.submissions.get(key(scope, id));
    const submission = existing ? clone(existing) : {
      tenant_scope: scope, submission_id: id, site_key: args.p_site_key, enquiry_id: null,
      facts: {}, capture: null, brand: null, state: "capture-only", work_status: "idle",
      claim_owner: null, claim_token: null, lease_expires_at: null, attempts: 0, max_attempts: 6,
      available_at: iso(now()), last_error: null, effects: {}, completed_at: null, dead_lettered_at: null,
      created_at: iso(now()), updated_at: iso(now()),
    };
    // Everything below is a transaction: work on copies and commit at the end.
    const enquiries = clone(state.enquiries);
    let created = false; let promoted = false; let attached = false; let replay = false;
    try {
      submission.facts = mergeFacts(submission.facts, args.p_facts);
    } catch (error) {
      return { data: null, error: { code: error.code, message: error.message, details: error.details ?? null, hint: null } };
    }
    const incomingMetadata = isObject(args.p_enquiry_row.metadata) ? clone(args.p_enquiry_row.metadata) : {};
    if (args.p_arrival === "tag") {
      if (!isObject(args.p_capture)) return { data: null, error: { code: "P0001", message: "capture must be an object" } };
      if (submission.capture === null) submission.capture = clone(args.p_capture);
      if (submission.enquiry_id === null) {
        const row = enquiryFromRow(args.p_enquiry_row, { ...incomingMetadata, submissionId: id, formCapture: clone(submission.capture) });
        enquiries.push(row);
        submission.enquiry_id = row.id;
        created = true;
      } else {
        const row = enquiries.find(entry => entry.id === submission.enquiry_id);
        if (row) row.metadata = { ...(row.metadata ?? {}), submissionId: id, formCapture: clone(submission.capture) };
        attached = true;
      }
    } else {
      if (!isObject(args.p_brand)) return { data: null, error: { code: "P0001", message: "brand payload must be an object" } };
      if (submission.brand !== null) {
        replay = true;
      } else {
        submission.brand = clone(args.p_brand);
        if (submission.enquiry_id === null) {
          const metadata = { ...incomingMetadata, submissionId: id };
          delete metadata.captureOnly;
          const row = enquiryFromRow(args.p_enquiry_row, metadata);
          enquiries.push(row);
          submission.enquiry_id = row.id;
          created = true;
        } else {
          const row = enquiries.find(entry => entry.id === submission.enquiry_id);
          const incoming = args.p_enquiry_row;
          if (row) {
            row.brand_slug = incoming.brand_slug || row.brand_slug;
            row.name = incoming.name || row.name;
            row.email = incoming.email ?? row.email;
            row.phone = incoming.phone ?? row.phone;
            row.contact_method = incoming.contact_method ?? row.contact_method;
            row.services = "services" in incoming ? [...(incoming.services ?? [])] : row.services;
            row.message = incoming.message ?? row.message;
            row.source_url = incoming.source_url ?? row.source_url;
            row.campaign = incoming.campaign ?? row.campaign;
            row.consent = typeof incoming.consent === "boolean" ? incoming.consent : row.consent;
            row.agency_id = incoming.agency_id || row.agency_id;
            const metadata = { ...(row.metadata ?? {}), ...incomingMetadata, submissionId: id };
            delete metadata.captureOnly;
            row.metadata = metadata;
          }
          promoted = true;
        }
        submission.state = "ingesting";
        submission.work_status = "pending";
        submission.available_at = iso(now());
        submission.attempts = 0;
        submission.last_error = null;
      }
    }
    submission.updated_at = iso(now());
    state.enquiries = enquiries;
    state.submissions.set(key(scope, id), submission);
    return {
      data: {
        enquiryId: submission.enquiry_id, state: submission.state, workStatus: submission.work_status,
        created, promoted, attached, replay, attempts: submission.attempts, effects: clone(submission.effects),
      },
      error: null,
    };
  }

  function claim(args) {
    const owner = String(args.p_owner ?? "").trim();
    if (!owner) return { data: null, error: { code: "P0001", message: "claim owner is required" } };
    const leaseMs = Math.max(1000, Math.min(Number(args.p_lease_ms ?? 90000), 300000));
    const inScope = row => (!args.p_tenant_scope || row.tenant_scope === args.p_tenant_scope)
      && (!args.p_submission_id || row.submission_id === args.p_submission_id);
    const expired = row => row.work_status === "processing" && Date.parse(row.lease_expires_at ?? "1970-01-01T00:00:00Z") <= now();
    for (const row of state.submissions.values()) {
      if (inScope(row) && expired(row) && row.attempts >= row.max_attempts) {
        Object.assign(row, {
          work_status: "dead", state: "dead-letter", dead_lettered_at: iso(now()),
          claim_owner: null, claim_token: null, lease_expires_at: null,
          last_error: row.last_error ?? "The delivery lease expired after the final attempt.", updated_at: iso(now()),
        });
      }
    }
    const due = [...state.submissions.values()]
      .filter(row => inScope(row)
        && ((row.work_status === "pending" && Date.parse(row.available_at) <= now()) || expired(row))
        && row.attempts < row.max_attempts)
      .sort((left, right) => left.available_at.localeCompare(right.available_at) || left.created_at.localeCompare(right.created_at))
      .slice(0, Math.max(1, Math.min(Number(args.p_limit ?? 1), 50)));
    for (const row of due) {
      Object.assign(row, {
        work_status: "processing", attempts: row.attempts + 1, claim_owner: owner.slice(0, 160),
        claim_token: randomUUID(), lease_expires_at: iso(now() + leaseMs), updated_at: iso(now()),
      });
    }
    return { data: clone(due), error: null };
  }

  function fenced(args) {
    const row = state.submissions.get(key(args.p_tenant_scope, args.p_submission_id));
    if (!row) return null;
    if (row.work_status !== "processing") return null;
    if (row.claim_owner !== args.p_owner || row.claim_token !== args.p_token) return null;
    if (Date.parse(row.lease_expires_at ?? "1970-01-01T00:00:00Z") <= now()) return null;
    return row;
  }

  function checkpoint(args) {
    if (!args.p_effect) return { data: null, error: { code: "P0001", message: "effect name is required" } };
    const row = fenced(args);
    if (!row) return { data: false, error: null };
    row.effects = { ...(row.effects ?? {}), [args.p_effect]: clone(args.p_record ?? {}) };
    row.updated_at = iso(now());
    return { data: true, error: null };
  }

  function settle(args) {
    if (!["complete", "retry", "dead"].includes(args.p_outcome)) {
      return { data: null, error: { code: "P0001", message: "outcome must be complete, retry or dead" } };
    }
    const row = fenced(args);
    if (!row) return { data: { settled: false, reason: "lease_lost" }, error: null };
    let nextStatus; let nextState;
    if (args.p_outcome === "complete") { nextStatus = "complete"; nextState = "complete"; }
    else if (args.p_outcome === "dead" || row.attempts >= row.max_attempts) { nextStatus = "dead"; nextState = "dead-letter"; }
    else { nextStatus = "pending"; nextState = "ingesting"; }
    const backoffMs = Math.min(3600, 2 ** Math.max(row.attempts - 1, 0) * 30) * 1000;
    Object.assign(row, {
      work_status: nextStatus, state: nextState,
      effects: { ...(row.effects ?? {}), ...(isObject(args.p_effects) ? clone(args.p_effects) : {}) },
      last_error: nextStatus === "complete" ? null : String(args.p_error ?? "Delivery failed.").slice(0, 1000),
      available_at: nextStatus === "pending" ? iso(now() + backoffMs) : row.available_at,
      completed_at: nextStatus === "complete" ? iso(now()) : row.completed_at,
      dead_lettered_at: nextStatus === "dead" ? iso(now()) : row.dead_lettered_at,
      claim_owner: null, claim_token: null, lease_expires_at: null, updated_at: iso(now()),
    });
    if (row.enquiry_id && isObject(args.p_metadata_patch)) {
      const enquiry = state.enquiries.find(entry => entry.id === row.enquiry_id);
      if (enquiry) enquiry.metadata = { ...(enquiry.metadata ?? {}), ...clone(args.p_metadata_patch) };
    }
    return {
      data: {
        settled: true, workStatus: row.work_status, state: row.state, attempts: row.attempts,
        availableAt: Date.parse(row.available_at), lastError: row.last_error,
      },
      error: null,
    };
  }

  return {
    state,
    now,
    query,
    rpc,
    advanceClock(ms) { state.clockOffset += ms; },
    setMode(mode) { state.mode = mode; },
    injectFault(fault) { state.faults.push({ times: 1, ...fault }); },
    recordEffect(entry) { state.effects.push({ ...entry, at: now() }); },
    setMaxAttempts(scope, id, max) { const row = state.submissions.get(key(scope, id)); if (row) row.max_attempts = max; },
    submission(scope, id) { return clone(state.submissions.get(key(scope, id)) ?? null); },
    dump() {
      return { enquiries: clone(state.enquiries), submissions: clone([...state.submissions.values()]), effects: clone(state.effects) };
    },
    reset() {
      state.enquiries = []; state.submissions.clear(); state.sequence = 0; state.clockOffset = 0;
      state.faults = []; state.effects = []; state.mode = "database";
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase-shaped clients over the model
// ─────────────────────────────────────────────────────────────────────────────

function builderFor(table, execute) {
  const op = { table, operation: "select", payload: undefined, filters: [], limit: undefined, single: false };
  const builder = {
    select() { return builder; },
    insert(value) { op.operation = "insert"; op.payload = value; return builder; },
    update(value) { op.operation = "update"; op.payload = value; return builder; },
    delete() { op.operation = "delete"; return builder; },
    eq(column, value) { op.filters.push({ type: "eq", column, value }); return builder; },
    gte(column, value) { op.filters.push({ type: "gte", column, value }); return builder; },
    lt(column, value) { op.filters.push({ type: "lt", column, value }); return builder; },
    order() { return builder; },
    limit(value) { op.limit = value; return builder; },
    async single() { op.single = true; return execute(op); },
    async maybeSingle() { op.single = true; return execute(op); },
    then(resolve, reject) { return Promise.resolve().then(() => execute(op)).then(resolve, reject); },
  };
  return builder;
}

/** In-process client: the routes talk to the model directly. */
export function createModelClient(model) {
  return {
    async rpc(fn, args) { return model.rpc(fn, args); },
    from(table) { return builderFor(table, async op => model.query(op)); },
  };
}

/** Cross-process client: the routes talk to a coordinator that owns the model. */
export function createProxyClient(baseUrl) {
  const call = async body => {
    const response = await fetch(`${baseUrl}/op`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (parsed && parsed.__thrown) throw new Error(parsed.__thrown);
    return parsed;
  };
  return {
    async rpc(fn, args) { return call({ kind: "rpc", fn, args }); },
    from(table) { return builderFor(table, op => call({ kind: "query", op })); },
    control(control) { return call({ kind: "control", ...control }); },
  };
}

/** One coordinator process owns the model; workers reach it over loopback. */
export async function startCoordinator(model) {
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      let payload = null;
      try {
        const message = JSON.parse(body || "{}");
        if (message.kind === "query") payload = model.query(message.op);
        else if (message.kind === "rpc") payload = model.rpc(message.fn, message.args);
        else if (message.kind === "control") payload = control(model, message);
        else payload = { error: "unknown message" };
      } catch (error) {
        payload = { __thrown: error instanceof Error ? error.message : String(error) };
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload ?? null));
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

function control(model, message) {
  if (message.op === "advanceClock") { model.advanceClock(message.ms); return { ok: true }; }
  if (message.op === "effect") { model.recordEffect(message.entry); return { ok: true }; }
  if (message.op === "dump") return model.dump();
  if (message.op === "reset") { model.reset(); return { ok: true }; }
  if (message.op === "mode") { model.setMode(message.mode); return { ok: true }; }
  if (message.op === "maxAttempts") { model.setMaxAttempts(message.scope, message.id, message.max); return { ok: true }; }
  if (message.op === "fault") { model.injectFault(message.fault); return { ok: true }; }
  return { error: "unknown control" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module stubs shared by the in-process suite and the worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stub every module the two public routes reach that is not the subject of
 * the proof, exactly as smoke-aqua-tag-ingestion-order does. `report(name,
 * detail)` is called once per downstream effect so a test can count what
 * happened across processes; `afterEffect(name)` runs right after it and is
 * where a worker kills itself to simulate a crash before acknowledgement.
 */
export const fixtureRequire = createRequire(import.meta.url);

export function installRouteStubs(options) {
  const require_ = fixtureRequire;
  const { client, report, afterEffect = async () => {}, flags = {} } = options;
  const stub = (modulePath, exports) => {
    const id = require_.resolve(modulePath);
    require_.cache[id] = { id, filename: id, loaded: true, paths: [], children: [], exports };
  };
  const effect = async (name, detail) => {
    await report(name, detail);
    await afterEffect(name);
  };
  stub("../../src/lib/supabase/admin", { createSupabaseAdminClient: () => client });
  stub("../../src/lib/server/rateLimit", {
    clientIpFromHeaders: () => "127.0.0.1",
    rateLimit: () => ({ allowed: true, remaining: 100, retryAfterSec: 0 }),
  });
  stub("../../src/server/websiteSources", {
    resolveAgencyByMasterSiteKey: () => AGENCY_ID,
    resolveWebsiteSourceRouting: () => ({ kind: "inbox" }),
  });
  stub("../../src/lib/server/clients/clientRecordLedger", {
    upsertClientRecordLedgerEvent: () => ({}),
  });
  stub("../../src/built-ins/modules/leads-pipeline/src/server/index", {
    containerFor: () => ({
      leads: {
        upsert: async input => {
          // A storage/provider failure inside a step that is NOT swallowed by
          // the route (notification and automation failures are recorded as
          // statuses, never thrown) — the case bounded retries exist for.
          if (flags.failLead) throw new Error("lead store unavailable: token=sk_live_abcdefghijklmnop\n    at somewhere.js:1:1");
          await effect("lead", { email: input.email });
          return { lead: { id: `lead_${input.customFields?.enquiryId ?? "x"}` } };
        },
      },
    }),
  });
  stub("../../src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation", {
    ensureLeadsPipelineFoundationRegistered: () => undefined,
  });
  stub("../../src/lib/server/seeds/founderSeed", {
    FOUNDER_AGENCY_SLUG: "milesymedia",
    FOUNDER_EMAIL: "founder@example.test",
    seedFounder: async () => undefined,
  });
  stub("../../src/lib/server/pluginStorage", { makePluginStorage: () => ({}) });
  stub("../../src/server/pluginInstalls", { getInstall: () => ({ id: "install_test", enabled: true }) });
  stub("../../src/server/activity", { logActivity: () => { void effect("activity", {}); return {}; } });
  stub("../../src/server/storage", {
    ensureHydrated: async () => undefined,
    flushPendingWrites: async () => undefined,
  });
  stub("../../src/server/tenants", { getAgencyBySlug: () => ({ id: AGENCY_ID, name: "Test Agency" }) });
  stub("../../src/server/users", { getUser: () => ({ id: "founder_test", email: "founder@example.test" }) });
  stub("../../src/server/zimanteTradingCompanies", {
    ensureZimanteTradingCompanies: () => ({ milesymedia: { id: "company_milesymedia" } }),
  });
  stub("../../src/lib/server/email/enquiryNotifications", {
    notifyBrandEnquiry: async input => {
      if (flags.failNotification) throw new Error("mail provider refused: Bearer sk_live_1234567890abcdef");
      await effect("notification", { enquiryId: input.id });
      return { attempted: true, sent: true };
    },
  });
  stub("../../src/server/automations", {
    triggerAutomations: async () => {
      if (flags.failAutomation) throw new Error("automation provider down: token=sk_live_abcdefghijklmnop\n    at somewhere.js:1:1");
      await effect("automation", {});
      return [];
    },
  });
  stub("../../src/lib/server/identityResolution", {
    resolveContactIdentity: () => ({
      status: "unmatched",
      confidence: 0,
      explanation: "No client matched.",
      resolvedAt: Date.now(),
    }),
    upsertIdentityResolutionReview: () => { void effect("identity", {}); },
  });
}

export function captureBody(submissionId, overrides = {}) {
  return {
    siteKey: SITE_KEY,
    submissionId,
    pageUrl: "https://milesymedia.com/contact",
    pagePath: "/contact",
    formName: "Website enquiry",
    fields: [
      { key: "name", value: "Taylor" },
      { key: "email", value: "taylor@example.test" },
      { key: "budget", value: "£5,000" },
    ],
    ...overrides,
  };
}

export function brandBody(submissionId, overrides = {}) {
  return {
    brand: "milesymedia",
    submissionId,
    name: "Taylor",
    email: "taylor@example.test",
    contactMethod: "email",
    services: ["Photography"],
    message: "A launch shoot",
    sourceUrl: "https://milesymedia.com/contact",
    consent: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The worker
// ─────────────────────────────────────────────────────────────────────────────

async function runWorker() {
  const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
  const require_ = createRequire(import.meta.url);
  const client = createProxyClient(input.coordinatorUrl);
  const report = (name, detail) => client.control({ op: "effect", entry: { name, detail, submissionId: input.submissionId ?? null, pid: process.pid, worker: input.label ?? null } });
  installRouteStubs({
    client,
    report,
    flags: { failLead: input.failLead === true, failAutomation: input.failAutomation === true, failNotification: input.failNotification === true },
    afterEffect: async name => {
      if (input.crashAfterEffect === name) {
        // The effect has happened and been observed; the acknowledgement that
        // would record it never arrives. This is the crash, not a throw.
        process.stdout.write(JSON.stringify({ ok: true, crashed: name }));
        process.kill(process.pid, "SIGKILL");
        await new Promise(() => {});
      }
    },
  });

  const { NextRequest } = require_("next/server");
  const formCapture = require_("../../src/app/api/public/form-capture/route");
  const brandEnquiry = require_("../../src/app/api/public/brand-enquiry/route");
  const delivery = require_("../../src/lib/server/enquirySubmissionDelivery");
  const claims = require_("../../src/lib/supabase/enquirySubmissionClaims");

  if (input.readyPath) {
    await writeFile(input.readyPath, "ready", "utf8");
    for (;;) {
      try { await access(input.goPath); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 10)); }
    }
  }

  const post = async (handler, url, body) => {
    const response = await handler(new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
  };

  let result;
  if (input.action === "capture") {
    result = await post(formCapture.POST, "http://localhost/api/public/form-capture", captureBody(input.submissionId, input.captureOverrides ?? {}));
  } else if (input.action === "brand") {
    result = await post(brandEnquiry.POST, "http://localhost/api/public/brand-enquiry", brandBody(input.submissionId, input.brandOverrides ?? {}));
  } else if (input.action === "sweep") {
    result = await delivery.processAquaTagSubmissionDeliveries({ client, limit: input.limit ?? 10, leaseMs: input.leaseMs ?? 90_000 });
  } else if (input.action === "claim") {
    result = await claims.claimAquaTagSubmissionWork(client, {
      owner: input.owner ?? `worker-${process.pid}`,
      leaseMs: input.leaseMs ?? 90_000,
      tenantScope: input.tenantScope,
      submissionId: input.submissionId,
      limit: 1,
    });
  } else if (input.action === "settle") {
    result = await claims.settleAquaTagSubmissionWork(client, input.claim, {
      outcome: input.outcome ?? "complete",
      error: input.error,
      metadataPatch: input.metadataPatch,
    });
  } else {
    throw new Error(`unknown action ${input.action}`);
  }
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

const invokedAsProgram = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsProgram) {
  runWorker().catch(error => {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }));
    process.exitCode = 1;
  });
}
