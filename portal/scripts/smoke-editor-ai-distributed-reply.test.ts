import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  createMemoryEditorAiReplyClaimCoordinator,
  editorAiReplyClaimCoordinator,
  editorAiReplyClaimKey,
} from "../src/engines/editor/server/editorAiReplyClaim";
import { getBackendInfo, runInDataRealm } from "../src/server/storage";

describe("Aqua Editor AI — one durable reply claim across server instances", () => {
  it("allows one holder, refuses a concurrent holder, and keeps completion durable", async () => {
    let now = 1_000;
    const coordinator = createMemoryEditorAiReplyClaimCoordinator(() => now);
    const key = editorAiReplyClaimKey({
      agencyId: "agency-a",
      projectId: "project-a",
      threadId: "thread-a",
      messageId: "message-a",
    });

    assert.equal((await coordinator.claim(key, "instance-a", 90_000)).state, "claimed");
    assert.equal((await coordinator.claim(key, "instance-b", 90_000)).state, "held");

    await coordinator.complete(key, "instance-a");
    assert.equal((await coordinator.claim(key, "instance-b", 90_000)).state, "complete");

    // A loser cannot release somebody else's completed claim and reopen the
    // model call. Completion is the durable idempotency record.
    await coordinator.release(key, "instance-b");
    assert.equal((await coordinator.claim(key, "instance-c", 90_000)).state, "complete");

    now += 1;
  });

  it("allows takeover only after an unfinished holder's lease expires", async () => {
    let now = 10_000;
    const coordinator = createMemoryEditorAiReplyClaimCoordinator(() => now);
    const key = "expired-claim";

    const first = await coordinator.claim(key, "instance-a", 1_000);
    assert.equal(first.state, "claimed");
    assert.equal((await coordinator.claim(key, "instance-b", 1_000)).state, "held");

    now = first.leaseExpiresAt + 1;
    assert.equal((await coordinator.claim(key, "instance-b", 1_000)).state, "claimed");
  });

  it("scopes the local fallback claim state by data realm", {
    skip: ["supabase", "postgres"].includes(getBackendInfo().kind),
  }, async () => {
    const coordinator = editorAiReplyClaimCoordinator();
    const key = `same-fixture-ids-${randomUUID()}`;
    const sandboxRealm = `sandbox-editor-ai-claim-${randomUUID()}`;

    const [live, sandbox] = await Promise.all([
      runInDataRealm("live", () => coordinator.claim(key, "live-holder", 90_000)),
      runInDataRealm(sandboxRealm, () => coordinator.claim(key, "sandbox-holder", 90_000)),
    ]);
    assert.equal(live.state, "claimed");
    assert.equal(sandbox.state, "claimed",
      "the same raw claim key in another realm is not held by live");

    await runInDataRealm("live", () => coordinator.complete(key, "live-holder"));
    assert.equal(
      (await runInDataRealm(sandboxRealm, () => coordinator.claim(key, "sandbox-other", 90_000))).state,
      "held",
      "live completion does not complete or release the snapshot claim",
    );
    await runInDataRealm(sandboxRealm, () => coordinator.complete(key, "sandbox-holder"));
    assert.equal(
      (await runInDataRealm("live", () => coordinator.claim(key, "live-other", 90_000))).state,
      "complete",
    );
    assert.equal(
      (await runInDataRealm(sandboxRealm, () => coordinator.claim(key, "sandbox-other", 90_000))).state,
      "complete",
    );
  });

  it("ships the production database claim and completes only after the reply flush", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20260823030000_editor_ai_reply_claims.sql", import.meta.url),
      "utf8",
    );
    const reply = readFileSync(
      new URL("../src/engines/editor/server/editorAiReply.ts", import.meta.url),
      "utf8",
    );
    const supabase = readFileSync(
      new URL("../src/server/storageSupabase.ts", import.meta.url),
      "utf8",
    );
    const postgres = readFileSync(
      new URL("../src/server/storagePostgres.ts", import.meta.url),
      "utf8",
    );
    const genericSchema = readFileSync(
      new URL("../scripts/schema.sql", import.meta.url),
      "utf8",
    );

    assert.match(migration, /primary key \(app_key, claim_key\)/);
    assert.match(migration, /for update/);
    assert.match(migration, /claim\.lease_expires_at <= now\(\)/);
    assert.match(migration, /status = 'complete'/);
    assert.match(supabase, /replyClaimRpc\("claim_editor_ai_reply"/);
    assert.match(supabase, /body: await response\.text\(\)/);
    assert.match(supabase, /response\.body \? JSON\.parse\(response\.body\)/);
    assert.match(postgres, /claim_editor_ai_reply\(\$1, \$2, \$3, \$4\)/);
    assert.match(genericSchema, /CREATE TABLE IF NOT EXISTS public\.editor_ai_reply_claims/);
    assert.match(genericSchema, /CREATE OR REPLACE FUNCTION public\.claim_editor_ai_reply/);
    assert.match(genericSchema, /FOR UPDATE/);

    const flush = reply.indexOf("await (input.flushPendingWritesImpl ?? flushPendingWrites)()");
    const complete = reply.indexOf("await coordinator.complete(claimKey, holderId)", flush);
    assert.ok(flush >= 0 && complete > flush, "the answer is durable before the distributed claim says complete");
    assert.match(reply, /code: "in_progress"/);
    assert.match(reply, /a second model call was not started/);
    const providerWait = reply.indexOf("const text = extractOutputText(payload)");
    const freshRead = reply.indexOf("await ensureHydrated({ fresh: true })", providerWait);
    const staleCheck = reply.indexOf("const freshThread = getEditorAiThread", providerWait);
    assert.ok(providerWait >= 0 && freshRead > providerWait && staleCheck > freshRead,
      "the post-provider stale check must refresh shared storage first");
  });

  const databaseUrl = process.env.DATABASE_URL;
  it("coordinates one claim across independent Node processes when Postgres is available", { skip: !databaseUrl }, async () => {
    const claimKey = `editor-ai-smoke-${randomUUID()}`;
    const holderId = `holder-${randomUUID()}`;
    const run = (expression: string) => {
      const script = `void (async () => { const imported = await import('./src/server/storagePostgres.ts'); const api = imported.default ?? imported; ${expression}; await api.closePool(); })().catch(error => { console.error(error); process.exitCode = 1; });`;
      return execFileSync("npx", ["tsx", "-e", script], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--conditions react-server" },
      }).trim();
    };

    const first = JSON.parse(run(`console.log(JSON.stringify(await api.claimEditorAiReply(${JSON.stringify(claimKey)}, ${JSON.stringify(holderId)}, 90000)))`));
    const second = JSON.parse(run(`console.log(JSON.stringify(await api.claimEditorAiReply(${JSON.stringify(claimKey)}, 'other-holder', 90000)))`));
    assert.equal(first.state, "claimed");
    assert.equal(second.state, "held");
    run(`await api.completeEditorAiReply(${JSON.stringify(claimKey)}, ${JSON.stringify(holderId)})`);
    const completed = JSON.parse(run(`console.log(JSON.stringify(await api.claimEditorAiReply(${JSON.stringify(claimKey)}, 'third-holder', 90000)))`));
    assert.equal(completed.state, "complete");

    const { getPool, closePool, STATE_KEY } = await import("../src/server/storagePostgres");
    await getPool().query(
      "DELETE FROM public.editor_ai_reply_claims WHERE app_key = $1 AND claim_key = $2",
      [STATE_KEY, claimKey],
    );
    await closePool();
  });
});
