// Scouting quotas — self-set targets with DERIVED progress.
//
// Ed, 2026-08-30: *"quotas as well like number of prospects as well set myself
// a target."* The store is the per-user goal/target calendar entry with the
// new recurrence + metric fields; progress is computed from the records that
// already capture the work, never written back into `currentValue`.

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

type Quota = typeof import("../src/lib/server/intelligence/scoutingQuota");
type Calendar = typeof import("../src/server/commandCalendar");
let scoutingQuotaProgress: Quota["scoutingQuotaProgress"];
let createCommandCalendarEntry: Calendar["createCommandCalendarEntry"];

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  ({ scoutingQuotaProgress } = await import("../src/lib/server/intelligence/scoutingQuota"));
  ({ createCommandCalendarEntry } = await import("../src/server/commandCalendar"));
});

const AGENCY = "quota-agency";
const ME = "user_me";
const COLLEAGUE = "user_colleague";

function attempt(at: number, channel: string, actorUserId?: string) {
  return { at, channel, ...(actorUserId ? { actorUserId } : {}) };
}

describe("quota fields ride the goal/target sanitisation", () => {
  it("stores recurrence and metric on a target, drops them elsewhere", () => {
    const target = createCommandCalendarEntry(AGENCY, ME, {
      type: "target", title: "20 calls a day", startsAt: 1,
      targetValue: 20, recurrence: "daily", metric: "calls-made",
    });
    assert.equal(target.recurrence, "daily");
    assert.equal(target.metric, "calls-made");

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

describe("progress derives from the outreach records", () => {
  it("counts my attempts in the period — never a colleague's, never unattributed", () => {
    const now = Date.UTC(2026, 5, 10, 14, 0, 0); // June: UK is UTC+1, exercises the zone maths
    const todayCall = attempt(now - 60_000, "call", ME);
    const colleagueCall = attempt(now - 120_000, "call", COLLEAGUE);
    const unattributed = attempt(now - 180_000, "call");
    const yesterdayCall = attempt(now - 86_400_000 * 1.5, "call", ME);
    const todayEmail = attempt(now - 200_000, "email", ME);

    const prospects = [
      { outreachAttempts: [todayCall, colleagueCall, unattributed, yesterdayCall] },
      { outreachAttempts: [todayEmail] },
    ];
    const { quotas } = scoutingQuotaProgress(AGENCY, ME, prospects, now);
    const calls = quotas.find(quota => quota.metric === "calls-made");
    assert.ok(calls, "the calls quota from the previous test should be visible");
    assert.equal(calls!.current, 1,
      "a daily calls quota must count exactly MY calls from TODAY — not colleagues', not unattributed ones, not yesterday's");
  });

  it("resets at the day boundary and counts streaks by consecutive days", () => {
    const now = Date.UTC(2026, 5, 10, 14, 0, 0);
    const prospects = [{
      outreachAttempts: [
        attempt(now - 3_000, "call", ME),
        attempt(now - 86_400_000, "call", ME),
        attempt(now - 86_400_000 * 2, "email", ME),
        // A gap: nothing three days ago, so the streak stops at 3.
        attempt(now - 86_400_000 * 5, "call", ME),
      ],
    }];
    const { streakDays } = scoutingQuotaProgress(AGENCY, ME, prospects, now);
    assert.equal(streakDays, 3, "the streak must stop at the first day with no attempt");
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
