// ABUSE-002 — the mounted Health Check completion is the only anonymous
// capture admission. It requires a purpose/host-bound managed challenge before
// victim/shared budgets or mutations; the old query-selected plugin routes are
// retired. All provider answers below are in-process stubs.

import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND ??= "memory";
process.env.FOUNDER_PASSWORD ??= "AquaHealthCheck2026!";

import { POST } from "../src/app/api/public/health-check/complete/route";
import { ROUTES } from "../src/built-ins/modules/public-funnel/src/api/routes";
import {
  ensurePublicFunnelFoundationRegistered,
  FunnelInputError,
  publicFunnelContainerFor,
} from "../src/built-ins/runtime/foundation-adapters/publicFunnelFoundation";
import {
  pendingCaptureErasurePort,
  pendingCapturePromotionAuthorityPort,
} from "../src/built-ins/runtime/foundation-adapters/leadFunnelPorts";
import {
  createAutomationWorkflow,
  listAutomationRuns,
  runAutomationWorkflow,
} from "../src/server/automations";
import { makePluginStorage } from "../src/lib/server/pluginStorage";
import { issueSession } from "../src/lib/server/auth/auth";
import { previewRetentionSweep, runRetentionSweep } from "../src/lib/server/compliance/retention";
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";
import { _resetFounderSeedForTests, seedFounder } from "../src/lib/server/seeds/founderSeed";
import { getInstall, upsertInstall } from "../src/server/pluginInstalls";
import { getState, mutate, reset } from "../src/server/storage";
import { createAgency, getAgencyBySlug } from "../src/server/tenants";
import { createUser, getUser, rotateUserSession } from "../src/server/users";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://localhost:3030/api/public/health-check/complete";
const SITE_KEY = "1x00000000000000000000AA";
const SECRET_KEY = "1x0000000000000000000000000000000AA";

let realFetch: typeof fetch;
let savedEnv: Record<string, string | undefined> = {};
let providerCalls = 0;

function body(email: string, completionId: string, captchaToken?: string): Record<string, unknown> {
  return {
    email,
    completionId,
    slot: { slot: 3, summary: { percentage: 61 } },
    sourceUrl: "http://localhost:3030/health-check/index.html",
    ...(captchaToken ? { captchaToken } : {}),
  };
}

function request(payload: Record<string, unknown>, ip: string, hostname = "localhost"): NextRequest {
  return new NextRequest(`http://${hostname}:3030/api/public/health-check/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(payload),
  });
}

function verdict(token: string): Record<string, unknown> {
  if (token.startsWith("wrong-action")) {
    return { success: true, action: "login", hostname: "localhost", challenge_ts: new Date().toISOString() };
  }
  if (token.startsWith("wrong-host")) {
    return { success: true, action: "health-check-complete", hostname: "evil.example", challenge_ts: new Date().toISOString() };
  }
  return {
    success: token.startsWith("valid-"),
    action: "health-check-complete",
    hostname: "localhost",
    challenge_ts: new Date().toISOString(),
  };
}

before(async () => {
  savedEnv = {
    site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    secret: process.env.TURNSTILE_SECRET_KEY,
    founderPassword: process.env.FOUNDER_PASSWORD,
  };
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
  process.env.FOUNDER_PASSWORD = "AquaHealthCheck2026!";
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const target = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (!target.includes("challenges.cloudflare.com/turnstile")) {
      throw new Error(`ABUSE-002 test refused unexpected network target: ${target}`);
    }
    providerCalls += 1;
    const token = new URLSearchParams(typeof init?.body === "string" ? init.body : "").get("response") ?? "";
    return new Response(JSON.stringify(verdict(token)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

beforeEach(() => {
  providerCalls = 0;
  __resetBotChallengeForTest();
});

after(() => {
  globalThis.fetch = realFetch;
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", savedEnv.site);
  restore("TURNSTILE_SECRET_KEY", savedEnv.secret);
  restore("FOUNDER_PASSWORD", savedEnv.founderPassword);
});

async function resetUnconfiguredFixture(): Promise<void> {
  await reset();
  _resetFounderSeedForTests();
}

async function provisionConfiguredFixture(): Promise<void> {
  await resetUnconfiguredFixture();
  await seedFounder();
}

describe("mounted Health Check managed-challenge admission", () => {
  it("fails closed on fresh state without bootstrapping privileged identities", async () => {
    await resetUnconfiguredFixture();
    const byteIdenticalBefore = JSON.stringify(getState());

    const response = await POST(request(
      body("hc-unconfigured@example.com", "hc_unconfigured_01", "valid-unconfigured"),
      "42.0.0.200",
    ));
    assert.equal(response.status, 503);

    const state = getState();
    assert.equal(Object.keys(state.users).length, 0, "public completion created an authenticatable User");
    assert.equal(Object.keys(state.agencies).length, 0, "public completion bootstrapped an Agency");
    assert.equal(Object.keys(state.pluginInstalls).length, 0, "public completion installed a plugin");
    assert.equal(Object.keys(state.outbox).length, 0, "public completion queued an identity outbox event");
    assert.equal(state.activity.length, 0, "public completion created an auth/system actor trail");
    assert.equal(Object.keys(state.accessGrants).length, 0);
    assert.equal(Object.keys(state.securityControl?.sessions ?? {}).length, 0);
    assert.equal(JSON.stringify(state), byteIdenticalBefore,
      "unconfigured anonymous completion changed fresh portal state");

  });

  it("requires proof without spending a victim budget or preclaiming signup identity", async () => {
    await provisionConfiguredFixture();
    const victim = "hc-abuse-victim@example.com";
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const denied = await POST(request(
        body(victim, `hc_abuse_victim_${attempt.toString().padStart(2, "0")}`),
        `42.0.0.${attempt + 1}`,
      ));
      assert.equal(denied.status, 403);
    }
    assert.equal(providerCalls, 0, "missing tokens must not spend a provider call");

    const allowed = await POST(request(
      body(victim, "hc_abuse_victim_real", "valid-victim"),
      "42.0.0.99",
    ));
    assert.notEqual(allowed.status, 429, "tokenless attempts must not spend the victim address budget");
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("set-cookie"), null);
    assert.equal(getUser(victim), null, "anonymous Health Check created a global authenticatable User");

    const canonicalRepeat = await POST(request(
      body("  HC-ABUSE-VICTIM@EXAMPLE.COM ", "hc_abuse_victim_repeat", "valid-victim-repeat"),
      "42.0.0.100",
    ));
    assert.equal(canonicalRepeat.status, 400, "canonical address repeat appended a second capture");
    assert.equal(getUser(victim), null);

    // The verified signup boundary must remain able to claim this address.
    const agency = createAgency({ name: "Victim signup succeeds", slug: "victim-signup-succeeds" });
    const signedUp = createUser({
      email: victim,
      password: "VictimSignupSecret42!",
      role: "agency-owner",
      agencyId: agency.id,
    });
    assert.equal(signedUp.email, victim);
    assert.equal(getUser(victim)?.id, signedUp.id);
  });

  it("atomically refuses one canonical address across two agency installs", async () => {
    await provisionConfiguredFixture();
    ensurePublicFunnelFoundationRegistered();
    const agencyA = createAgency({ name: "Capture namespace A", slug: "capture-namespace-a" });
    const agencyB = createAgency({ name: "Capture namespace B", slug: "capture-namespace-b" });
    const installA = upsertInstall({
      scope: { agencyId: agencyA.id },
      pluginId: "public-funnel",
      enabled: true,
      config: {},
      features: {},
      installedBy: "abuse-002-test",
    });
    const installB = upsertInstall({
      scope: { agencyId: agencyB.id },
      pluginId: "public-funnel",
      enabled: true,
      config: {},
      features: {},
      installedBy: "abuse-002-test",
    });
    const funnelA = publicFunnelContainerFor({
      agencyId: agencyA.id,
      install: installA,
      storage: makePluginStorage(installA.id),
    }).funnel;
    const funnelB = publicFunnelContainerFor({
      agencyId: agencyB.id,
      install: installB,
      storage: makePluginStorage(installB.id),
    }).funnel;
    const email = "hc-global-pending@example.com";

    const settled = await Promise.allSettled([
      funnelA.captureHcCompletion({
        email,
        completionId: "hc_global_pending_a",
        slot: { slot: 2 },
      }),
      funnelB.captureHcCompletion({
        email: "  HC-GLOBAL-PENDING@EXAMPLE.COM ",
        completionId: "hc_global_pending_b",
        slot: { slot: 4 },
      }),
    ]);
    assert.equal(settled.filter(result => result.status === "fulfilled").length, 1);
    const refused = settled.find(result => result.status === "rejected");
    assert.ok(refused?.status === "rejected");
    assert.ok(refused.reason instanceof FunnelInputError);
    assert.equal(refused.reason.message, "identity_unavailable");
    const [rowsA, rowsB] = await Promise.all([
      funnelA.listByEmail(email),
      funnelB.listByEmail(email),
    ]);
    assert.equal(rowsA.length + rowsB.length, 1, "the canonical address was admitted in two tenants");
    assert.equal(getUser(email), null, "global pending uniqueness reserved the User namespace");
  });

  it("rejects tokens minted for another action or hostname before capture", async () => {
    await provisionConfiguredFixture();
    const wrongActionEmail = "hc-wrong-action@example.com";
    const wrongAction = await POST(request(
      body(wrongActionEmail, "hc_wrong_action_001", "wrong-action-001"),
      "42.0.1.1",
    ));
    assert.equal(wrongAction.status, 403);
    assert.equal(getUser(wrongActionEmail), null);

    const wrongHostEmail = "hc-wrong-host@example.com";
    const wrongHost = await POST(request(
      body(wrongHostEmail, "hc_wrong_host_0001", "wrong-host-001"),
      "42.0.1.2",
    ));
    assert.equal(wrongHost.status, 403);
    assert.equal(getUser(wrongHostEmail), null);
  });

  it("burns a successful proof once, even when replayed with new capture data", async () => {
    await provisionConfiguredFixture();
    const firstEmail = "hc-replay-first@example.com";
    const token = "valid-replay-once";
    const first = await POST(request(body(firstEmail, "hc_replay_first_01", token), "42.0.2.1"));
    assert.equal(first.status, 200);

    const secondEmail = "hc-replay-second@example.com";
    const replay = await POST(request(body(secondEmail, "hc_replay_second_1", token), "42.0.2.2"));
    assert.equal(replay.status, 403);
    assert.equal(getUser(secondEmail), null);
    assert.equal(providerCalls, 1, "the local replay guard must reject before another provider call");
  });

  it("ignores query/body tenant hints and writes only to the fixed founder install", async () => {
    await provisionConfiguredFixture();
    const decoy = createAgency({ name: "ABUSE-002 decoy", slug: "abuse-002-decoy" });
    const decoyInstall = upsertInstall({
      scope: { agencyId: decoy.id },
      pluginId: "public-funnel",
      enabled: true,
      config: {},
      features: {},
      installedBy: "abuse-002-test",
    });
    const email = "hc-tenant-proof@example.com";
    const response = await POST(request({
      ...body(email, "hc_tenant_proof_001", "valid-tenant-proof"),
      agencyId: decoy.id,
      installId: decoyInstall.id,
    }, "42.0.3.1"));
    assert.equal(response.status, 200);

    ensurePublicFunnelFoundationRegistered();
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const founderInstall = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(founderInstall);
    const founderRows = await publicFunnelContainerFor({
      agencyId: founder.id,
      install: founderInstall,
      storage: makePluginStorage(founderInstall.id),
    }).funnel.listByEmail(email);
    const decoyRows = await publicFunnelContainerFor({
      agencyId: decoy.id,
      install: decoyInstall,
      storage: makePluginStorage(decoyInstall.id),
    }).funnel.listByEmail(email);
    assert.equal(founderRows.length, 1);
    assert.equal(decoyRows.length, 0);
  });

  it("does not strand a capture when availability fails and a fresh proof retries", async () => {
    await provisionConfiguredFixture();
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(install);
    upsertInstall({
      scope: { agencyId: founder.id },
      pluginId: install.pluginId,
      enabled: false,
      config: install.config,
      features: install.features,
      setupAnswers: install.setupAnswers,
      installedBy: install.installedBy,
    });

    const email = "hc-rollback-retry@example.com";
    const unavailable = await POST(request(
      body(email, "hc_rollback_retry_01", "valid-rollback-first"),
      "42.0.4.1",
    ));
    assert.equal(unavailable.status, 503);
    assert.equal(getUser(email), null);

    upsertInstall({
      scope: { agencyId: founder.id },
      pluginId: install.pluginId,
      enabled: true,
      config: install.config,
      features: install.features,
      setupAnswers: install.setupAnswers,
      installedBy: install.installedBy,
    });
    const retry = await POST(request(
      body(email, "hc_rollback_retry_01", "valid-rollback-second"),
      "42.0.4.2",
    ));
    assert.equal(retry.status, 200);
    assert.equal(getUser(email), null, "successful retry minted a global User");
  });

  it("erases an exact pending capture without auth residue or collateral rows", async () => {
    await provisionConfiguredFixture();
    const email = "hc-exact-pending-erasure@example.com";
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const actor = Object.values(getState().users).find(user => user.agencyIds.includes(founder.id));
    assert.ok(actor);
    const workflow = createAutomationWorkflow(founder.id, {
      name: "Minimal Health Check capture event",
      status: "active",
      nodes: [
        {
          id: "trigger",
          kind: "trigger",
          position: { x: 0, y: 0 },
          config: {
            label: "Pending Health Check captured",
            triggerType: "custom.event",
            eventName: "public-funnel.capture.pending",
          },
        },
        {
          id: "activity",
          kind: "action",
          position: { x: 240, y: 0 },
          config: { label: "Record receipt", actionType: "log-activity", message: "Health Check received." },
        },
      ],
      edges: [{ id: "trigger-to-activity", source: "trigger", target: "activity" }],
    }, actor.id);
    const unrelatedRun = await runAutomationWorkflow(
      founder.id,
      workflow.id,
      "test",
      actor.id,
      { marker: "preserve-unrelated-run" },
    );
    const unrelatedBefore = JSON.stringify(unrelatedRun);
    const leadsInstall = getInstall({ agencyId: founder.id }, "leads-pipeline");
    assert.ok(leadsInstall);
    const derivativeCountsBefore = {
      leadKeys: Object.keys(getState().pluginData[leadsInstall.id] ?? {})
        .filter(key => key.startsWith("lead:") || key.startsWith("leads/email/") || key.startsWith("prospect:")).length,
      persons: Object.keys(getState().persons).length,
      cards: Object.keys(getState().pipelineCards).length,
      personOutbox: Object.values(getState().outbox).filter(event => event.name === "person.created").length,
    };
    const privateAnswer = "hc-private-answer-erasure-marker";

    const response = await POST(request(
      {
        ...body(email, "hc_exact_pending_erasure_01", "valid-exact-erasure"),
        slot: { slot: 3, summary: { percentage: 61 }, answers: { privateAnswer } },
      },
      "42.0.5.1",
    ));
    assert.equal(response.status, 200);

    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(install);
    const store = makePluginStorage(install.id);
    const funnel = publicFunnelContainerFor({ agencyId: founder.id, install, storage: store }).funnel;
    const rows = await funnel.listByEmail(email);
    assert.equal(rows.length, 1);
    const capture = rows[0]!;
    assert.ok(capture.pendingLeadId);
    assert.equal(capture.leadUserId, undefined);

    let matchingRun = listAutomationRuns(founder.id).find(run =>
      run.workflowId === workflow.id
      && run.id !== unrelatedRun.id
      && run.eventData.captureId === capture.id);
    for (let attempt = 0; !matchingRun && attempt < 25; attempt += 1) {
      await new Promise<void>(resolve => setImmediate(resolve));
      matchingRun = listAutomationRuns(founder.id).find(run =>
        run.workflowId === workflow.id
        && run.id !== unrelatedRun.id
        && run.eventData.captureId === capture.id);
    }
    assert.ok(matchingRun, "active matching automation did not receive the capture event");
    assert.equal(matchingRun.eventData.email, undefined);
    assert.equal(matchingRun.eventData.pendingLeadId, undefined);
    assert.equal(matchingRun.eventData.slot, undefined);
    assert.equal(JSON.stringify(matchingRun).includes(email), false);
    assert.equal(JSON.stringify(matchingRun).includes(capture.pendingLeadId!), false);
    assert.equal(JSON.stringify(matchingRun).includes(privateAnswer), false);
    const currentState = getState();
    const derivativeCountsAfter = {
      leadKeys: Object.keys(currentState.pluginData[leadsInstall.id] ?? {})
        .filter(key => key.startsWith("lead:") || key.startsWith("leads/email/") || key.startsWith("prospect:")).length,
      persons: Object.keys(currentState.persons).length,
      cards: Object.keys(currentState.pipelineCards).length,
      personOutbox: Object.values(currentState.outbox).filter(event => event.name === "person.created").length,
    };
    assert.deepEqual(derivativeCountsAfter, derivativeCountsBefore,
      "anonymous completion created CRM identity or pipeline derivatives");
    assert.equal(JSON.stringify(currentState).split(email).length - 1, 1,
      "submitted email must exist only in the exact pending capture row");
    assert.equal(JSON.stringify(currentState).split(capture.pendingLeadId!).length - 1, 1,
      "pending identity escaped its exact capture row");

    const erased = await funnel.eraseExactCapture(capture.id);
    const replay = await funnel.eraseExactCapture(capture.id);
    assert.equal(erased.erased, true);
    assert.ok(erased.recordsErased >= 4,
      "capture, two audit rows and its automation run should be exact lineage");
    assert.deepEqual(replay, { erased: false, recordsErased: 0 }, "exact erasure must be idempotent");
    assert.equal((await funnel.listByEmail(email)).length, 0);
    assert.equal(getUser(email), null);
    assert.equal(getState().activity.some(entry =>
      (entry.metadata as { captureId?: string } | undefined)?.captureId === capture.id), false,
    "exact capture activity survived erasure");
    assert.equal(JSON.stringify(getState().automationRuns[unrelatedRun.id]), unrelatedBefore,
      "exact capture erasure changed an unrelated automation run");
    assert.equal(getState().automationRuns[matchingRun.id], undefined,
      "exact capture erasure left its durable automation receipt");
    const durableRuns = JSON.stringify(getState().automationRuns);
    assert.equal(durableRuns.includes(email), false, "capture email survived in an automation run");
    assert.equal(durableRuns.includes(capture.pendingLeadId!), false,
      "pending identity survived in an automation run");
    const erasedState = JSON.stringify(getState());
    assert.equal(erasedState.includes(email), false, "capture email survived exact erasure");
    assert.equal(erasedState.includes(capture.pendingLeadId!), false, "pending identity survived exact erasure");
    assert.equal(erasedState.includes(privateAnswer), false, "full Health Check answers survived exact erasure");
  });

  it("ages out natural capture lineage without deleting the pending source or unrelated runs", async () => {
    await provisionConfiguredFixture();
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const actor = Object.values(getState().users).find(user =>
      user.role === "agency-owner" && user.agencyIds.includes(founder.id));
    assert.ok(actor);
    const workflow = createAutomationWorkflow(founder.id, {
      name: "Retention proof for pending capture",
      status: "active",
      nodes: [
        {
          id: "trigger",
          kind: "trigger",
          position: { x: 0, y: 0 },
          config: {
            label: "Pending capture retention proof",
            triggerType: "custom.event",
            eventName: "public-funnel.capture.pending",
          },
        },
        {
          id: "activity",
          kind: "action",
          position: { x: 240, y: 0 },
          config: { label: "Record receipt", actionType: "log-activity", message: "Pending capture retained." },
        },
      ],
      edges: [{ id: "trigger-to-activity", source: "trigger", target: "activity" }],
    }, actor.id);
    const unrelatedRun = await runAutomationWorkflow(
      founder.id,
      workflow.id,
      "test",
      actor.id,
      { captureId: "unrelated-capture-id", marker: "preserve-unrelated-retention-run" },
    );
    const email = "hc-natural-retention@example.com";
    const response = await POST(request(
      body(email, "hc_natural_retention_01", "valid-natural-retention"),
      "42.0.5.2",
    ));
    assert.equal(response.status, 200);

    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(install);
    const publicStore = makePluginStorage(install.id);
    const funnel = publicFunnelContainerFor({
      agencyId: founder.id,
      install,
      storage: publicStore,
    }).funnel;
    const capture = (await funnel.listByEmail(email))[0];
    assert.ok(capture?.pendingLeadId);
    let matchingRun = listAutomationRuns(founder.id).find(run =>
      run.workflowId === workflow.id && run.eventData.captureId === capture.id);
    for (let attempt = 0; !matchingRun && attempt < 25; attempt += 1) {
      await new Promise<void>(resolve => setImmediate(resolve));
      matchingRun = listAutomationRuns(founder.id).find(run =>
        run.workflowId === workflow.id && run.eventData.captureId === capture.id);
    }
    assert.ok(matchingRun, "natural pending event did not create a durable automation receipt");

    const old = Date.now() - 60 * 24 * 60 * 60 * 1000;
    mutate(state => {
      for (const entry of state.activity) {
        if ((entry.metadata as { captureId?: string } | undefined)?.captureId === capture.id) entry.ts = old;
      }
      state.automationRuns[matchingRun.id]!.createdAt = old;
      state.automationRuns[matchingRun.id]!.updatedAt = old;
      state.automationRuns[unrelatedRun.id]!.createdAt = old;
      state.automationRuns[unrelatedRun.id]!.updatedAt = old;
      const current = state.agencySettings[founder.id] ?? { agencyId: founder.id };
      state.agencySettings[founder.id] = {
        ...current,
        retention: { ...(current.retention ?? {}), activityDays: 30 },
      };
    });

    const preview = previewRetentionSweep(founder.id);
    assert.equal(preview.removed.publicFunnelAutomationRuns, 1);
    assert.ok(preview.removed.activityDays >= 2);
    assert.ok(getState().automationRuns[matchingRun.id], "preview mutated a matching run");
    const applied = runRetentionSweep(founder.id);
    assert.equal(applied.total, preview.total, "retention preview drifted from its sweep");
    assert.equal(getState().automationRuns[matchingRun.id], undefined,
      "retention left the capture-linked automation receipt");
    assert.ok(getState().automationRuns[unrelatedRun.id],
      "retention removed a run without an owned Public Funnel event lineage");
    assert.equal(getState().activity.some(entry =>
      (entry.metadata as { captureId?: string } | undefined)?.captureId === capture.id), false,
    "retention left aged capture activity");
    assert.equal((await funnel.listByEmail(email)).length, 1,
      "activity retention deleted the pending source without an erasure decision");
    assert.equal(getUser(email), null);
  });

  it("promotes one exact pending capture only from a fresh signed agency session", async () => {
    await provisionConfiguredFixture();
    const email = "hc-mailbox-promoted@example.com";
    const response = await POST(request(
      body(email, "hc_mailbox_promotion_01", "valid-mailbox-promotion"),
      "42.0.6.1",
    ));
    assert.equal(response.status, 200);

    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const funnelInstall = getInstall({ agencyId: founder.id }, "public-funnel");
    const leadsInstall = getInstall({ agencyId: founder.id }, "leads-pipeline");
    assert.ok(funnelInstall);
    assert.ok(leadsInstall);
    const funnel = publicFunnelContainerFor({
      agencyId: founder.id,
      install: funnelInstall,
      storage: makePluginStorage(funnelInstall.id),
    }).funnel;
    const pending = (await funnel.listByEmail(email))[0];
    assert.ok(pending?.pendingLeadId);
    const actor = Object.values(getState().users).find(user =>
      user.role === "agency-owner" && user.agencyIds.includes(founder.id));
    assert.ok(actor);
    const staleActorToken = issueSession({
      userId: actor.id,
      email: actor.email,
      role: actor.role,
      agencyId: founder.id,
      agencyIds: actor.agencyIds,
      activeAgencyId: founder.id,
      sessionRev: actor.sessionRev,
      accessRev: actor.accessRev,
    });

    const derivativeSnapshot = () => ({
      leadKeys: Object.keys(getState().pluginData[leadsInstall.id] ?? {})
        .filter(key => key.startsWith("lead:") || key.startsWith("leads/email/") || key.startsWith("prospect:")).length,
      persons: Object.keys(getState().persons).length,
      cards: Object.keys(getState().pipelineCards).length,
    });
    const beforeProof = derivativeSnapshot();
    await assert.rejects(
      () => funnel.promotePendingCapture({
        captureId: pending.id,
        credential: { kind: "mailbox-proof", receiptId: "caller-invented-receipt" },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "promotion_authority_refused",
    );
    await assert.rejects(
      () => funnel.promotePendingCapture({
        captureId: pending.id,
        credential: {
          kind: "authenticated",
          sessionToken: "not-a-real-user",
          operationId: "forged-actor-command-001",
        },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "promotion_authority_refused",
    );

    const otherAgency = createAgency({ name: "Promotion authority other", slug: "promotion-authority-other" });
    const otherOwner = createUser({
      email: "other-promotion-owner@example.com",
      password: "OtherPromotionSecret42!",
      role: "agency-owner",
      agencyId: otherAgency.id,
    });
    const wrongTenantToken = issueSession({
      userId: otherOwner.id,
      email: otherOwner.email,
      role: otherOwner.role,
      agencyId: otherAgency.id,
      agencyIds: otherOwner.agencyIds,
      activeAgencyId: otherAgency.id,
      sessionRev: otherOwner.sessionRev,
      accessRev: otherOwner.accessRev,
    });
    await assert.rejects(
      () => funnel.promotePendingCapture({
        captureId: pending.id,
        credential: {
          kind: "authenticated",
          sessionToken: wrongTenantToken,
          operationId: "wrong-tenant-command-001",
        },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "promotion_authority_refused",
    );

    const clientScopedToken = issueSession({
      userId: actor.id,
      email: actor.email,
      role: actor.role,
      agencyId: founder.id,
      agencyIds: actor.agencyIds,
      activeAgencyId: founder.id,
      clientId: "client_scope_must_not_promote",
      sessionRev: actor.sessionRev,
      accessRev: actor.accessRev,
    });
    await assert.rejects(
      () => funnel.promotePendingCapture({
        captureId: pending.id,
        credential: {
          kind: "authenticated",
          sessionToken: clientScopedToken,
          operationId: "wrong-client-command-001",
        },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "promotion_authority_refused",
    );
    const rotated = rotateUserSession(actor.id);
    assert.ok(rotated);
    await assert.rejects(
      () => funnel.promotePendingCapture({
        captureId: pending.id,
        credential: {
          kind: "authenticated",
          sessionToken: staleActorToken,
          operationId: "stale-session-command-001",
        },
      }),
      (error: unknown) => error instanceof FunnelInputError && error.message === "promotion_authority_refused",
    );
    assert.deepEqual(derivativeSnapshot(), beforeProof, "failed proof created CRM derivatives");

    const actorToken = issueSession({
      userId: rotated.id,
      email: rotated.email,
      role: rotated.role,
      agencyId: founder.id,
      agencyIds: rotated.agencyIds,
      activeAgencyId: founder.id,
      sessionRev: rotated.sessionRev,
      accessRev: rotated.accessRev,
    });

    const command = {
      captureId: pending.id,
      credential: {
        kind: "authenticated" as const,
        sessionToken: actorToken,
        operationId: "operator-command-001",
      },
    };
    const raced = await Promise.all([
      funnel.promotePendingCapture(command),
      funnel.promotePendingCapture(command),
    ]);
    const promoted = raced.find(result => result.promoted);
    const concurrentReplay = raced.find(result => !result.promoted);
    assert.ok(promoted);
    assert.ok(concurrentReplay);
    assert.deepEqual(concurrentReplay.promotion, promoted.promotion);
    assert.equal(promoted.promoted, true);
    assert.equal(promoted.capture.pendingLeadId, undefined);
    assert.equal(promoted.capture.clientId, undefined, "promotion widened an unscoped capture to a client");
    assert.equal(promoted.capture.personId, promoted.promotion.personId);
    const leadStore = makePluginStorage(leadsInstall.id);
    const lead = await leadStore.get<{
      id: string;
      agencyId: string;
      email: string;
      personId?: string;
      pipelineCardId?: string;
      customFields?: Record<string, unknown>;
    }>(`lead:${promoted.promotion.leadId}`);
    assert.ok(lead);
    assert.equal(lead.agencyId, founder.id);
    assert.equal(lead.email, email);
    assert.equal(lead.personId, promoted.promotion.personId);
    assert.equal(lead.pipelineCardId, promoted.promotion.pipelineCardId);
    assert.equal(lead.customFields?.publicFunnelCaptureId, pending.id);
    const promotedPerson = getState().persons[promoted.promotion.personId];
    assert.equal(promotedPerson?.agencyId, founder.id);
    assert.deepEqual(promotedPerson?.facets.clientIds ?? [], [],
      "promotion attached the Person to an unrelated client scope");
    const promotedCard = getState().pipelineCards[promoted.promotion.pipelineCardId ?? ""];
    assert.ok(promotedCard);
    assert.equal(getState().pipelines[promotedCard.pipelineId]?.agencyId, founder.id);
    assert.ok(await leadStore.get(`prospect:${promoted.promotion.prospectId}`));
    assert.equal(getUser(email), null, "CRM promotion minted an authenticatable User");

    const afterPromotion = derivativeSnapshot();
    const replay = await funnel.promotePendingCapture(command);
    assert.equal(replay.promoted, false);
    assert.deepEqual(replay.promotion, promoted.promotion);
    assert.deepEqual(derivativeSnapshot(), afterPromotion, "promotion replay duplicated CRM lineage");

    const decoy = createAgency({ name: "Promotion scope decoy", slug: "promotion-scope-decoy" });
    const decoyInstall = upsertInstall({
      scope: { agencyId: decoy.id },
      pluginId: "public-funnel",
      enabled: true,
      config: {},
      features: {},
      installedBy: "abuse-002-test",
    });
    const decoyFunnel = publicFunnelContainerFor({
      agencyId: decoy.id,
      install: decoyInstall,
      storage: makePluginStorage(decoyInstall.id),
    }).funnel;
    await assert.rejects(
      () => decoyFunnel.promotePendingCapture(command),
      (error: unknown) => error instanceof FunnelInputError && error.message === "capture_not_found",
    );
    assert.deepEqual(derivativeSnapshot(), afterPromotion, "cross-install promotion widened lineage");

    const realErase = pendingCaptureErasurePort.erase;
    pendingCaptureErasurePort.erase = async input => {
      await realErase(input);
      throw new Error("injected_erasure_failure_after_crm_mutation");
    };
    try {
      await assert.rejects(
        () => funnel.eraseExactCapture(pending.id),
        /injected_erasure_failure_after_crm_mutation/,
      );
    } finally {
      pendingCaptureErasurePort.erase = realErase;
    }
    assert.ok(await leadStore.get(`lead:${promoted.promotion.leadId}`),
      "failed erasure did not roll the exact Lead back");
    assert.ok(await leadStore.get(`prospect:${promoted.promotion.prospectId}`),
      "failed erasure did not roll the exact Prospect back");
    assert.ok(getState().persons[promoted.promotion.personId],
      "failed erasure did not roll the exact Person back");
    assert.ok(getState().pipelineCards[promoted.promotion.pipelineCardId ?? ""],
      "failed erasure did not roll the exact card back");
    assert.ok(await makePluginStorage(funnelInstall.id).get(`captures/by-id/${pending.id}`),
      "failed erasure discarded the capture retry handle");

    const erased = await funnel.eraseExactCapture(pending.id);
    assert.equal(erased.erased, true);
    assert.equal(await leadStore.get(`lead:${promoted.promotion.leadId}`), undefined);
    assert.equal(await leadStore.get(`prospect:${promoted.promotion.prospectId}`), undefined);
    assert.equal(getState().persons[promoted.promotion.personId], undefined);
    assert.equal(getState().pipelineCards[promoted.promotion.pipelineCardId ?? ""], undefined);
    assert.equal((await funnel.listByEmail(email)).length, 0);
    assert.equal(JSON.stringify(getState()).includes(email), false,
      "promoted subject email survived exact graph erasure");
    assert.deepEqual(await funnel.eraseExactCapture(pending.id), { erased: false, recordsErased: 0 },
      "promoted graph erasure was not idempotent");
  });

  it("revalidates a session inside the promotion ledger after it is revoked while waiting", async () => {
    await provisionConfiguredFixture();
    const email = "hc-revoked-in-lane@example.com";
    assert.equal((await POST(request(
      body(email, "hc_revoked_in_lane_01", "valid-revoked-in-lane"),
      "42.0.6.2",
    ))).status, 200);
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    const leadsInstall = getInstall({ agencyId: founder.id }, "leads-pipeline");
    assert.ok(install);
    assert.ok(leadsInstall);
    const publicStore = makePluginStorage(install.id);
    const funnel = publicFunnelContainerFor({
      agencyId: founder.id,
      install,
      storage: publicStore,
    }).funnel;
    const capture = (await funnel.listByEmail(email))[0];
    assert.ok(capture);
    const actor = Object.values(getState().users).find(user =>
      user.role === "agency-owner" && user.agencyIds.includes(founder.id));
    assert.ok(actor);
    const token = issueSession({
      userId: actor.id,
      email: actor.email,
      role: actor.role,
      agencyId: founder.id,
      agencyIds: actor.agencyIds,
      activeAgencyId: founder.id,
      sessionRev: actor.sessionRev,
      accessRev: actor.accessRev,
    });
    const crmBefore = JSON.stringify({
      slice: getState().pluginData[leadsInstall.id],
      persons: getState().persons,
      cards: getState().pipelineCards,
    });
    const realVerify = pendingCapturePromotionAuthorityPort.verify;
    let checks = 0;
    let firstVerificationResolved!: () => void;
    const firstVerification = new Promise<void>(resolve => { firstVerificationResolved = resolve; });
    pendingCapturePromotionAuthorityPort.verify = async input => {
      checks += 1;
      const grant = await realVerify(input);
      if (checks === 1 && grant) firstVerificationResolved();
      return grant;
    };
    assert.ok(publicStore.runExclusive);
    let releasePromotionLane!: () => void;
    let promotionLaneHeld!: () => void;
    const promotionLaneEntered = new Promise<void>(resolve => { promotionLaneHeld = resolve; });
    const releasePromotionLaneGate = new Promise<void>(resolve => { releasePromotionLane = resolve; });
    const heldLane = publicStore.runExclusive("capture-promotion-ledger", async () => {
      promotionLaneHeld();
      await releasePromotionLaneGate;
    });
    await promotionLaneEntered;
    try {
      const refused = assert.rejects(
        funnel.promotePendingCapture({
          captureId: capture.id,
          credential: {
            kind: "authenticated",
            sessionToken: token,
            operationId: "revoked-while-waiting-command-001",
          },
        }),
        (error: unknown) => error instanceof FunnelInputError && error.message === "promotion_authority_refused",
      );
      await firstVerification;
      rotateUserSession(actor.id);
      releasePromotionLane();
      await heldLane;
      await refused;
    } finally {
      releasePromotionLane();
      await heldLane;
      pendingCapturePromotionAuthorityPort.verify = realVerify;
    }
    assert.equal(checks, 2, "authority was not resolved again inside the durable lane");
    assert.equal(JSON.stringify({
      slice: getState().pluginData[leadsInstall.id],
      persons: getState().persons,
      cards: getState().pipelineCards,
    }), crmBefore, "revoked authority created CRM derivatives");
    const retained = await publicStore.get<{ pendingLeadId?: string; promotion?: unknown }>(
      `captures/by-id/${capture.id}`,
    );
    assert.ok(retained?.pendingLeadId);
    assert.equal(retained?.promotion, undefined);
    assert.deepEqual(await publicStore.list("promotion-claims/"), [],
      "revoked authority reserved a durable command claim");
  });

  it("binds one authenticated subject and operation to only one exact capture", async () => {
    await provisionConfiguredFixture();
    const emailA = "hc-command-bound-a@example.com";
    const emailB = "hc-command-bound-b@example.com";
    assert.equal((await POST(request(
      body(emailA, "hc_command_bound_a_01", "valid-command-bound-a"),
      "42.0.6.3",
    ))).status, 200);
    assert.equal((await POST(request(
      body(emailB, "hc_command_bound_b_01", "valid-command-bound-b"),
      "42.0.6.4",
    ))).status, 200);
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const install = getInstall({ agencyId: founder.id }, "public-funnel");
    const leadsInstall = getInstall({ agencyId: founder.id }, "leads-pipeline");
    assert.ok(install);
    assert.ok(leadsInstall);
    const store = makePluginStorage(install.id);
    const funnel = publicFunnelContainerFor({ agencyId: founder.id, install, storage: store }).funnel;
    const captureA = (await funnel.listByEmail(emailA))[0];
    const captureB = (await funnel.listByEmail(emailB))[0];
    assert.ok(captureA);
    assert.ok(captureB);
    const actor = Object.values(getState().users).find(user =>
      user.role === "agency-owner" && user.agencyIds.includes(founder.id));
    assert.ok(actor);
    const token = issueSession({
      userId: actor.id,
      email: actor.email,
      role: actor.role,
      agencyId: founder.id,
      agencyIds: actor.agencyIds,
      activeAgencyId: founder.id,
      sessionRev: actor.sessionRev,
      accessRev: actor.accessRev,
    });
    const operationId = "one-subject-one-operation-001";
    const settled = await Promise.allSettled([captureA, captureB].map(capture =>
      funnel.promotePendingCapture({
        captureId: capture.id,
        credential: { kind: "authenticated", sessionToken: token, operationId },
      })));
    assert.equal(settled.filter(result => result.status === "fulfilled").length, 1);
    const rejected = settled.find(result => result.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assert.ok(rejected.reason instanceof FunnelInputError);
    assert.equal(rejected.reason.message, "promotion_operation_conflict");
    assert.equal((await store.list("promotion-claims/")).length, 1,
      "one operation produced more than one durable claim");
    const promotedRows = (await funnel.list()).filter(row => row.promotion);
    assert.equal(promotedRows.length, 1);
    const exactLeadRows = Object.entries(getState().pluginData[leadsInstall.id] ?? {})
      .filter(([key, value]) => key.startsWith("lead:")
        && value
        && typeof value === "object"
        && [captureA.id, captureB.id].includes(
          String((value as { customFields?: { publicFunnelCaptureId?: string } }).customFields?.publicFunnelCaptureId),
        ));
    assert.equal(exactLeadRows.length, 1, "one command promoted two CRM Leads");
    assert.equal(JSON.stringify(getState()).includes(token), false,
      "the bearer session token was persisted in durable state");
  });
});

describe("alternate-path retirement and ordering contract", () => {
  it("exposes no query-selected anonymous capture route from the plugin dispatcher", () => {
    assert.deepEqual(ROUTES.map(route => route.path), ["me-context"]);
    assert.equal(ROUTES.some(route => route.public === true), false);
  });

  it("keeps address/install budgets and every mutation below exact proof", () => {
    const source = readFileSync(path.join(
      ROOT,
      "src/app/api/public/health-check/complete/route.ts",
    ), "utf8");
    const proof = source.indexOf("await verifyBotChallenge");
    const address = source.indexOf("health-check-complete-address:");
    const hydrate = source.indexOf("await ensureHydrated");
    const install = source.indexOf("health-check-complete-install:");
    const capture = source.indexOf(".funnel.captureHcCompletion");
    assert.ok(proof > 0);
    assert.ok(address > proof, "victim address quota moved above human proof");
    assert.ok(hydrate > proof, "hydration moved above human proof");
    assert.ok(install > proof, "shared install budget moved above human proof");
    assert.ok(capture > install, "capture must remain below every admission budget");
    assert.match(source, /health-check-complete-ip:/);
    assert.match(source, /addressDigest\(email\)/);
    assert.doesNotMatch(source, /seedFounder/, "public completion may not provision privileged state");
  });

  it("mounts a dedicated purpose-bound challenge and forwards/resets its token", () => {
    const html = readFileSync(path.join(ROOT, "public/health-check/index.html"), "utf8");
    const loader = readFileSync(path.join(ROOT, "public/aqua-bot-challenge.js"), "utf8");
    assert.match(html, /data-hc-completion-proof[^>]+data-hc-challenge-action="health-check-complete"/);
    assert.match(html, /setAttribute\('data-aqua-challenge-action', 'health-check-complete'\)/);
    assert.match(html, /AquaBotChallenge\?\.mount\(proofForm\)/);
    assert.match(loader, /mount:\s*function \(form\)/);
    assert.match(html, /captchaToken:\s*captchaToken/);
    assert.match(html, /challenge\.reset\(proofForm\)/);
  });
});
