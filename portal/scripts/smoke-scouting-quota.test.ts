// Scouting quotas — self-set targets with DERIVED progress.
//
// Ed, 2026-08-30: *"quotas as well like number of prospects as well set myself
// a target."* The store is the per-user goal/target calendar entry with the
// new recurrence + metric fields; progress is computed from the records that
// already capture the work, never written back into `currentValue`.

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

type Quota = typeof import("../src/lib/server/intelligence/scoutingQuota");
type Calendar = typeof import("../src/server/commandCalendar");
type Storage = typeof import("../src/server/storage");
type Activity = typeof import("../src/server/activity");
let scoutingQuotaProgress: Quota["scoutingQuotaProgress"];
let createCommandCalendarEntry: Calendar["createCommandCalendarEntry"];
let logActivity: Activity["logActivity"];
let storage: Storage;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  await storage.reset();
  ({ scoutingQuotaProgress } = await import("../src/lib/server/intelligence/scoutingQuota"));
  ({ createCommandCalendarEntry } = await import("../src/server/commandCalendar"));
  ({ logActivity } = await import("../src/server/activity"));
});

const AGENCY = "quota-agency";
const ME = "user_me";
const COLLEAGUE = "user_colleague";

function activity(
  id: string,
  ts: number,
  action: string,
  actorUserId?: string,
  metadata?: Record<string, unknown>,
) {
  return {
    id,
    ts,
    agencyId: AGENCY,
    category: "leads" as const,
    action,
    message: action,
    ...(actorUserId ? { actorUserId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

describe("quota fields ride the goal/target sanitisation", () => {
  it("stores recurrence and metric on a target, drops them elsewhere", () => {
    const target = createCommandCalendarEntry(AGENCY, ME, {
      type: "target", title: "20 calls a day", startsAt: 1,
      targetValue: 20, recurrence: "daily", metric: "calls-made",
    });
    assert.equal(target.recurrence, "daily");
    assert.equal(target.metric, "calls-made");

    for (const metric of ["emails-sent", "prospects-scouted", "leads-qualified", "clients-converted"] as const) {
      createCommandCalendarEntry(AGENCY, ME, {
        type: "target",
        title: `Daily ${metric}`,
        startsAt: 1,
        targetValue: 5,
        recurrence: "daily",
        metric,
      });
    }
    createCommandCalendarEntry(AGENCY, ME, {
      type: "target",
      title: "Weekly calls",
      startsAt: 1,
      targetValue: 25,
      recurrence: "weekly",
      metric: "calls-made",
    });

    const note = createCommandCalendarEntry(AGENCY, ME, {
      type: "note", title: "Not a quota", startsAt: 1,
      recurrence: "daily", metric: "calls-made",
    } as never);
    assert.equal(note.recurrence, undefined, "a note stored a recurrence");
    assert.equal(note.metric, undefined, "a note stored a metric");

    const junk = createCommandCalendarEntry(AGENCY, ME, {
      type: "target", title: "Junk", startsAt: 1, targetValue: 5,
      recurrence: "hourly", metric: "steps-walked",
    } as never);
    assert.equal(junk.recurrence, undefined, "an unknown recurrence was stored");
    assert.equal(junk.metric, undefined, "an unknown metric was stored");
  });
});

describe("progress derives from the personal activity ledger", () => {
  it("projects only actor-owned production evidence into durable personal metric days", () => {
    const now = Date.UTC(2026, 5, 10, 14, 0, 0);
    storage.mutate(state => {
      state.activity = [];
      state.personalMetricDays = {};
    });
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      for (const [id, action, metadata] of [
        ["prospect", "leads.prospect.created", { prospectId: "prospect-1" }],
        ["call", "leads.prospect.outreach-recorded", { channel: "call", attemptId: "call-1", contactedAt: now }],
        ["email", "leads.prospect.outreach-recorded", { channel: "email", attemptId: "email-1", contactedAt: now }],
        ["qualified", "leads.prospect.qualified", { prospectId: "prospect-1", leadId: "lead-1" }],
        ["converted", "leads.contact.converted", { contactId: "contact-1", clientId: "client-1" }],
      ] as const) {
        logActivity({
          idempotencyKey: `quota-${id}`,
          agencyId: AGENCY,
          actorUserId: ME,
          category: "leads",
          action,
          message: action,
          metadata,
        });
      }
      logActivity({
        idempotencyKey: "quota-colleague",
        agencyId: AGENCY,
        actorUserId: COLLEAGUE,
        category: "leads",
        action: "leads.prospect.created",
        message: "colleague prospect",
        metadata: { prospectId: "prospect-colleague" },
      });
      logActivity({
        idempotencyKey: "quota-unattributed",
        agencyId: AGENCY,
        category: "leads",
        action: "leads.prospect.created",
        message: "unattributed prospect",
        metadata: { prospectId: "prospect-unattributed" },
      });
      logActivity({
        idempotencyKey: "quota-generic-client",
        agencyId: AGENCY,
        actorUserId: ME,
        category: "clients",
        action: "client.created",
        message: "generic client record",
        metadata: { clientId: "generic-client" },
      });
      for (const [id, action, metadata] of [
        ["generic-qualified-update", "leads.prospect.updated", { prospectId: "prospect-2", fields: ["qualifiedLeadId"] }],
        ["generic-converted-update", "leads.contact.updated", { contactId: "contact-2", fields: ["type", "tags"] }],
        ["legacy-promoted", "leads.contact.promoted", { contactId: "contact-3" }],
      ] as const) {
        logActivity({
          idempotencyKey: `quota-${id}`,
          agencyId: AGENCY,
          actorUserId: ME,
          category: "leads",
          action,
          message: action,
          metadata,
        });
      }
    } finally {
      Date.now = originalNow;
    }

    const mine = Object.values(storage.getState().personalMetricDays)
      .find(row => row.agencyId === AGENCY && row.userId === ME);
    assert.ok(mine, "central activity recording must populate the person's durable metric projection");
    assert.deepEqual(mine.counts, {
      "prospects-scouted": 1,
      "calls-made": 1,
      "emails-sent": 1,
      "leads-qualified": 1,
      "clients-converted": 1,
    }, "compact counters must count only the five dedicated personal facts");
    const projectedRows = Object.values(storage.getState().personalMetricDays);
    assert.equal(projectedRows.length, 2,
      "only the two identified actors may acquire projection rows; unattributed activity must not create one");
    assert.ok(projectedRows.some(row => row.userId === COLLEAGUE));
  });

  it("round-trips personal metric evidence through the canonical state parser", async () => {
    const state = storage.createEmptyPortalState();
    const key = `${AGENCY}\u0000${ME}\u00002026-06-10`;
    state.personalMetricDays[key] = {
      agencyId: AGENCY,
      userId: ME,
      date: "2026-06-10",
      counts: { "calls-made": 7 },
      evidenceIds: ["0123456789abcdef01234567"],
      updatedAt: 123,
    };
    await storage.replaceDataRealmState("quota-projection-roundtrip", state);
    const restored = storage.runInDataRealm("quota-projection-roundtrip", () =>
      structuredClone(storage.getState().personalMetricDays[key]));
    assert.deepEqual(restored, state.personalMetricDays[key],
      "the compact projection must survive the same JSON parser used during hydration");
  });

  it("keeps qualification evidence retry-safe after the general audit row is evicted", () => {
    const now = Date.UTC(2026, 5, 11, 10, 0, 0);
    storage.mutate(state => {
      state.activity = [];
      state.personalMetricDays = {};
    });
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      const qualification = {
        agencyId: AGENCY,
        actorUserId: ME,
        category: "leads" as const,
        action: "leads.prospect.qualified",
        message: "Qualified retry-safe prospect",
        metadata: { prospectId: "prospect-retry-safe", leadId: "lead-retry-safe" },
      };
      logActivity({ ...qualification, idempotencyKey: "personal-metric:prospect-qualified:prospect-retry-safe:lead-retry-safe" });
      const first = Object.values(storage.getState().personalMetricDays)[0];
      assert.equal(first?.counts["leads-qualified"], 1);
      assert.equal(first?.evidenceIds?.length, 1);
      assert.match(first?.evidenceIds?.[0] ?? "", /^[a-f0-9]{24}$/,
        "retry receipts must be compact hashes rather than retained prospect identifiers");
      assert.ok(!first?.evidenceIds?.includes("prospect-retry-safe"));

      // The bounded audit is allowed to forget the old row. Replaying the
      // same committed qualification must rebuild that audit row without
      // incrementing the durable personal counter a second time.
      storage.mutate(state => { state.activity = []; });
      logActivity({ ...qualification, idempotencyKey: "personal-metric:prospect-qualified:prospect-retry-safe:lead-retry-safe" });
      // Even a changed transport key cannot double-count the same domain fact.
      logActivity({ ...qualification, idempotencyKey: "qualification-retry-with-new-request-id" });
    } finally {
      Date.now = originalNow;
    }

    const restored = Object.values(storage.getState().personalMetricDays)[0];
    assert.equal(restored?.counts["leads-qualified"], 1);
    assert.equal(restored?.evidenceIds?.length, 1);
  });

  it("merges newly-due evidence into an already projected business day", () => {
    const before = Date.UTC(2026, 5, 12, 10, 0, 0);
    const due = before + 60_000;
    storage.mutate(state => {
      state.activity = [];
      state.personalMetricDays = {};
    });
    const originalNow = Date.now;
    Date.now = () => before;
    try {
      logActivity({
        idempotencyKey: "same-day-call",
        agencyId: AGENCY,
        actorUserId: ME,
        category: "leads",
        action: "leads.prospect.outreach-recorded",
        message: "Call completed",
        metadata: { channel: "call", attemptId: "same-day-call", contactedAt: before },
      });
      logActivity({
        idempotencyKey: "same-day-future-email",
        agencyId: AGENCY,
        actorUserId: ME,
        category: "leads",
        action: "leads.prospect.outreach-recorded",
        message: "Email scheduled",
        metadata: { channel: "email", attemptId: "same-day-future-email", contactedAt: due },
      });
    } finally {
      Date.now = originalNow;
    }

    const beforeDue = scoutingQuotaProgress(AGENCY, ME, due - 1);
    const afterDue = scoutingQuotaProgress(AGENCY, ME, due + 1);
    assert.equal(beforeDue.quotas.find(item => item.metric === "emails-sent")?.current, 0);
    assert.equal(afterDue.quotas.find(item => item.metric === "emails-sent")?.current, 1,
      "a date that already has a projected call must not suppress its later-due email evidence");
  });

  it("counts all five metrics from my audit events — never a colleague's or unattributed activity", () => {
    const now = Date.UTC(2026, 5, 10, 14, 0, 0); // June: UK is UTC+1, exercises the zone maths
    const mine = [
      activity("mine-prospect", now - 50_000, "leads.prospect.created", ME),
      activity("mine-call", now - 60_000, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
      activity("mine-email", now - 70_000, "leads.prospect.outreach-recorded", ME, { channel: "email" }),
      activity("mine-qualified", now - 80_000, "leads.prospect.qualified", ME, { prospectId: "prospect-mine", leadId: "lead-mine" }),
      activity("mine-converted", now - 90_000, "leads.contact.converted", ME, { contactId: "contact-mine", clientId: "client-mine" }),
    ];
    const notMine = [
      activity("colleague-prospect", now - 100_000, "leads.prospect.created", COLLEAGUE),
      activity("colleague-call", now - 110_000, "leads.prospect.outreach-recorded", COLLEAGUE, { channel: "call" }),
      activity("colleague-email", now - 120_000, "leads.prospect.outreach-recorded", COLLEAGUE, { channel: "email" }),
      activity("colleague-qualified", now - 130_000, "leads.prospect.qualified", COLLEAGUE, { prospectId: "prospect-colleague" }),
      activity("colleague-converted", now - 140_000, "leads.contact.converted", COLLEAGUE, { contactId: "contact-colleague" }),
      activity("unattributed-prospect", now - 150_000, "leads.prospect.created"),
      activity("unattributed-call", now - 160_000, "leads.prospect.outreach-recorded", undefined, { channel: "call" }),
      activity("old-call", now - 86_400_000 * 1.5, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
      activity("generic-qualified-update", now - 170_000, "leads.prospect.updated", ME, { fields: ["qualifiedLeadId"] }),
      activity("generic-converted-update", now - 180_000, "leads.contact.updated", ME, { fields: ["type", "tags"] }),
      activity("legacy-promoted", now - 190_000, "leads.contact.promoted", ME),
    ];
    const { quotas } = scoutingQuotaProgress(AGENCY, ME, [...mine, ...notMine], now);
    for (const metric of ["prospects-scouted", "calls-made", "emails-sent", "leads-qualified", "clients-converted"] as const) {
      const quota = quotas.find(candidate => candidate.metric === metric);
      assert.ok(quota, `${metric} quota should be visible`);
      assert.equal(quota.current, 1,
        `${metric} must count exactly this person's audit event — never a colleague, unattributed row, or workspace aggregate`);
    }
  });

  it("resets at the day boundary and counts streaks by consecutive days", () => {
    const now = Date.UTC(2026, 5, 10, 14, 0, 0);
    const events = [
      activity("today", now - 3_000, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
      activity("yesterday", now - 86_400_000, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
      activity("two-days", now - 86_400_000 * 2, "leads.prospect.outreach-recorded", ME, { channel: "email" }),
      // A gap: nothing three days ago, so the streak stops at 3.
      activity("five-days", now - 86_400_000 * 5, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
    ];
    const { streakDays } = scoutingQuotaProgress(AGENCY, ME, events, now);
    assert.equal(streakDays, 3, "the streak must stop at the first day with no attempt");
  });

  it("uses London calendar boundaries for daily and Monday-weekly quotas across DST changes", () => {
    const boundaries = [
      {
        label: "spring-forward BST midnight",
        now: Date.parse("2026-03-30T00:30:00.000Z"),
        before: Date.parse("2026-03-29T22:59:59.000Z"),
        after: Date.parse("2026-03-29T23:00:01.000Z"),
      },
      {
        label: "autumn-back GMT midnight",
        now: Date.parse("2026-10-26T00:30:00.000Z"),
        before: Date.parse("2026-10-25T23:59:59.000Z"),
        after: Date.parse("2026-10-26T00:00:01.000Z"),
      },
    ];

    for (const boundary of boundaries) {
      const events = [
        activity(`${boundary.label}-before`, boundary.before, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
        activity(`${boundary.label}-after`, boundary.after, "leads.prospect.outreach-recorded", ME, { channel: "call" }),
      ];
      const { quotas } = scoutingQuotaProgress(AGENCY, ME, events, boundary.now);
      const daily = quotas.find(quota => quota.metric === "calls-made" && quota.recurrence === "daily");
      const weekly = quotas.find(quota => quota.metric === "calls-made" && quota.recurrence === "weekly");
      assert.equal(daily?.current, 1, `${boundary.label}: daily quota crossed the London midnight boundary incorrectly`);
      assert.equal(weekly?.current, 1, `${boundary.label}: weekly quota crossed the London Monday boundary incorrectly`);
    }
  });

  it("never opens plugin prospects, foundation services, or aggregate client state", () => {
    const source = read("src/lib/server/intelligence/scoutingQuota.ts");
    const activitySource = read("src/server/activity.ts");
    const handlers = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");
    const types = read("src/server/types.ts");
    assert.match(source, /personalMetricDays/,
      "quota progress should use the durable personal metric projection rather than rely on the capped audit log");
    assert.match(source, /row\.agencyId\s*===\s*agencyId|day\.agencyId\s*===\s*agencyId/,
      "the metric projection must be agency-scoped");
    assert.match(source, /row\.userId\s*===\s*userId|day\.userId\s*===\s*userId/,
      "the metric projection must be person-scoped before metrics are counted");
    assert.doesNotMatch(source, /@aqua\/plugin|FOUNDATION_SERVICES|makePluginStorage|getInstall\(|containerFor\(|prospects\.list\(|getState\(\)\.clients/,
      "calendar access must not become a side door into plugin prospects, foundation services, or whole-workspace CRM aggregates");
    const projector = activitySource.slice(activitySource.indexOf("function personalMetricEvidence"), activitySource.indexOf("function projectPersonalMetric"));
    const legacyReader = source.slice(source.indexOf("function activityEvidenceForMetric"), source.indexOf("function storedCountForMetric"));
    for (const segment of [projector, legacyReader]) {
      assert.match(segment, /leads\.prospect\.qualified/);
      assert.match(segment, /leads\.contact\.converted/);
      assert.doesNotMatch(segment, /leads\.prospect\.updated|leads\.contact\.updated|qualifiedLeadId|includes\("type"\)|includes\("tags"\)/,
        "generic field-update names must never masquerade as qualification or conversion facts");
      assert.doesNotMatch(segment, /leads\.contact\.promoted/,
        "the canonical contact-converted event must be counted exactly once");
    }
    const metricDay = types.slice(types.indexOf("export interface PersonalMetricDay"), types.indexOf("export type CommandCalendarConnectionStatus"));
    assert.match(metricDay, /counts:\s*Partial<Record<PersonalMetricKey, number>>/);
    assert.match(metricDay, /evidenceIds\?:\s*string\[\]/,
      "the compact projection needs hashed receipts so retries remain safe after audit eviction");
    assert.doesNotMatch(metricDay, /prospectId|contactId|attemptId/,
      "the projection schema must not retain raw CRM identifiers");
    assert.match(handlers, /action:\s*"leads\.prospect\.qualified"[\s\S]*metadata:\s*\{\s*prospectId:/,
      "qualification must emit the dedicated actor-stamped fact at the real handler");
    assert.match(handlers, /prospect\.status === "qualified" && prospect\.qualifiedLeadId[\s\S]*recordQualificationActivity\(lead\.id\)[\s\S]*repaired:\s*true/,
      "a retry after the lead commit must repair missing qualification evidence idempotently");
    assert.match(handlers, /action:\s*"leads\.contact\.converted"[\s\S]*metadata:\s*\{\s*contactId:/,
      "conversion must emit the dedicated actor-stamped fact at the real handler");
  });

  it("never writes progress back into the entry", () => {
    // Two counters for one truth disagree by Friday. The helper derives; the
    // stored currentValue stays whatever the person hand-set.
    const source = read("src/lib/server/intelligence/scoutingQuota.ts");
    assert.doesNotMatch(source, /mutate\(|currentValue\s*=/,
      "the quota helper writes state — progress must stay derived");
  });
});

describe("the scouting header renders the game", () => {
  const scouting = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");

  it("shows rings, the streak, and a set-a-target affordance", () => {
    assert.match(scouting, /<ScoutingQuotaStrip quota=\{quota\} \/>/);
    assert.match(scouting, /strokeDasharray=/, "the progress ring is gone");
    assert.match(scouting, /-day streak/, "the streak flame is gone");
    assert.match(scouting, /Set a target/, "there is no way to create a quota");
  });

  it("creates quotas through the ONE existing calendar store", () => {
    assert.match(scouting, /fetch\("\/api\/portal\/calendar"/,
      "the quota form no longer posts to the shared goal/target store — a second store will drift");
  });

  it("celebrates a weekly win by pointing at You deserve it", () => {
    assert.match(scouting, /you-deserve-it/,
      "hitting a weekly quota no longer connects to the reward surface");
  });
});
