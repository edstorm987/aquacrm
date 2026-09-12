import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "public-auth-link-delivery-test-secret";

import { signMagicToken } from "../src/lib/server/auth/magicLink";
import { signPasswordResetToken } from "../src/lib/server/auth/passwordReset";
import {
  markPublicAuthLinkConsumed,
  preparePublicAuthLinkDelivery,
  recordPublicAuthLinkDelivery,
} from "../src/server/publicAuthLinkDelivery";
import { getState, reset } from "../src/server/storage";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = mkdtempSync(join(tmpdir(), "aqua-public-auth-link-"));

beforeEach(async () => {
  await reset();
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function magicBearer(operation: Awaited<ReturnType<typeof preparePublicAuthLinkDelivery>>): string {
  return signMagicToken({
    email: operation.email,
    agencyId: operation.agencyId,
    clientId: operation.clientId!,
    sessionRev: operation.expectedSessionRev,
    nonce: operation.tokenNonce,
    exp: operation.tokenExpiresAt,
  }).token;
}

function resetBearer(operation: Awaited<ReturnType<typeof preparePublicAuthLinkDelivery>>): string {
  return signPasswordResetToken({
    userId: operation.userId,
    email: operation.email,
    clientId: operation.clientId,
    sessionRev: operation.expectedSessionRev,
    nonce: operation.tokenNonce,
    exp: operation.tokenExpiresAt,
  }).token;
}

describe("durable public-auth link delivery generations", () => {
  it("reuses one magic bearer and provider key until consumption, then rotates once", async () => {
    const input = {
      kind: "magic-link" as const,
      userId: "usr_magic_subject",
      email: "Magic.Subject@Example.Test",
      agencyId: "agency_magic_subject",
      clientId: "client_magic_subject",
      sessionRev: 4,
      presentation: "/portal/customer?tab=files",
      now: 1_000_000,
    };
    const first = await preparePublicAuthLinkDelivery(input);
    const retry = await preparePublicAuthLinkDelivery({
      ...input,
      presentation: "/attacker-selected-change",
      now: input.now + 1_000,
    });
    assert.equal(retry.generation, first.generation);
    assert.equal(retry.tokenNonce, first.tokenNonce);
    assert.equal(retry.providerOperationRef, first.providerOperationRef);
    assert.equal(retry.presentation, input.presentation, "a live generation keeps its first safe presentation");
    assert.equal(magicBearer(retry), magicBearer(first));

    await recordPublicAuthLinkDelivery(first.id, first.generation, { delivered: true });
    await recordPublicAuthLinkDelivery(first.id, first.generation, {
      delivered: false,
      outcomeUnknown: true,
    });
    assert.equal(getState().publicAuthLinkDeliveryOperations[first.id]?.deliveryStatus, "delivered",
      "a late ambiguous failure cannot replace the success receipt");

    await markPublicAuthLinkConsumed({
      kind: "magic-link",
      email: first.email,
      agencyId: first.agencyId,
      clientId: first.clientId,
      nonce: first.tokenNonce,
      now: input.now + 2_000,
    });
    const replacement = await preparePublicAuthLinkDelivery({ ...input, now: input.now + 3_000 });
    assert.equal(replacement.generation, first.generation + 1);
    assert.notEqual(replacement.tokenNonce, first.tokenNonce);
    assert.notEqual(magicBearer(replacement), magicBearer(first));
  });

  it("reconstructs the same password-reset bearer without persisting it", async () => {
    const input = {
      kind: "password-reset" as const,
      userId: "usr_reset_subject",
      email: "reset-subject@example.test",
      agencyId: "agency_reset_subject",
      clientId: null,
      sessionRev: 2,
      presentation: "aquacrm",
      now: 2_000_000,
    };
    const first = await preparePublicAuthLinkDelivery(input);
    const retry = await preparePublicAuthLinkDelivery({
      ...input,
      presentation: "attacker-selected-change",
      now: input.now + 10,
    });
    const bearer = resetBearer(first);
    assert.equal(resetBearer(retry), bearer);
    assert.equal(retry.presentation, input.presentation,
      "a current live generation never changes provider bytes under its existing key");
    assert.doesNotMatch(JSON.stringify(getState().publicAuthLinkDeliveryOperations), new RegExp(bearer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(Object.keys(getState().publicAuthLinkDeliveryOperations).length, 1);
    assert.equal(first.deliveryContentVersion, 2);

    await markPublicAuthLinkConsumed({
      kind: first.kind,
      email: first.email,
      agencyId: first.agencyId,
      clientId: first.clientId,
      nonce: first.tokenNonce,
      now: input.now + 20,
    });
    const replacement = await preparePublicAuthLinkDelivery({ ...input, now: input.now + 30 });
    assert.equal(replacement.generation, first.generation + 1);
    assert.notEqual(resetBearer(replacement), bearer);
  });

  it("rotates a seeded pre-correction reset row before using corrected provider bytes", async () => {
    const input = {
      kind: "password-reset" as const,
      userId: "usr_legacy_reset_subject",
      email: "legacy-reset@example.test",
      agencyId: "agency_exact_reset",
      clientId: null,
      sessionRev: 3,
      presentation: "agency_exact_reset",
      now: 2_500_000,
    };
    const seeded = await preparePublicAuthLinkDelivery(input);
    const seededBearer = resetBearer(seeded);
    getState().publicAuthLinkDeliveryOperations[seeded.id] = {
      ...seeded,
      presentation: "milesymedia",
      deliveryContentVersion: undefined,
    };

    const corrected = await preparePublicAuthLinkDelivery({ ...input, now: input.now + 1_000 });
    assert.equal(corrected.generation, seeded.generation + 1);
    assert.equal(corrected.presentation, input.agencyId);
    assert.equal(corrected.deliveryContentVersion, 2);
    assert.notEqual(corrected.tokenNonce, seeded.tokenNonce);
    assert.notEqual(corrected.providerOperationRef, seeded.providerOperationRef,
      "corrected bytes must never reuse the legacy provider idempotency key");
    assert.notEqual(resetBearer(corrected), seededBearer);
  });

  it("fences a late old-generation receipt after post-consumption resend", async () => {
    const input = {
      kind: "magic-link" as const,
      userId: "usr_late_subject",
      email: "late-subject@example.test",
      agencyId: "agency_late_subject",
      clientId: "client_late_subject",
      sessionRev: 0,
      presentation: "/portal/customer",
      now: 3_000_000,
    };
    const first = await preparePublicAuthLinkDelivery(input);
    await markPublicAuthLinkConsumed({
      kind: first.kind,
      email: first.email,
      agencyId: first.agencyId,
      clientId: first.clientId,
      nonce: first.tokenNonce,
      now: input.now + 1,
    });
    const second = await preparePublicAuthLinkDelivery({ ...input, now: input.now + 2 });
    await recordPublicAuthLinkDelivery(first.id, first.generation, { delivered: true }, input.now + 3);
    const current = getState().publicAuthLinkDeliveryOperations[first.id]!;
    assert.equal(current.generation, second.generation);
    assert.equal(current.deliveryStatus, "pending");
  });
});

describe("cross-process public-auth delivery generation", () => {
  it("two file-backed processes converge on one nonce and operation key", async () => {
    const dataFile = join(sandbox, `portal-state-${Date.now()}.json`);
    const worker = join(ROOT, "scripts", "fixtures", "public-auth-link-worker.ts");
    const run = (presentation: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn(process.execPath, [
        "--conditions=react-server",
        "--import",
        "tsx",
        worker,
        presentation,
      ], {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_ENV: "test",
          PORTAL_BACKEND: "file",
          PORTAL_STORAGE_BACKEND: "file",
          PORTAL_ALLOW_SHARED_STATE: "1",
          PORTAL_DATA_FILE: dataFile,
          PORTAL_SESSION_SECRET: "public-auth-cross-process-secret",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += String(chunk); });
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", code => {
        if (code !== 0) reject(new Error(stderr || `worker exited ${code}`));
        else resolve(JSON.parse(stdout) as Record<string, unknown>);
      });
    });

    const [first, second] = await Promise.all([
      run("/portal/customer?first=1"),
      run("/portal/customer?second=1"),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(first.generation, 1);
    assert.equal(second.generation, 1);
    assert.equal(first.nonce, second.nonce);
    assert.equal(first.exp, second.exp);
    assert.equal(first.providerOperationRef, second.providerOperationRef);
    assert.equal(first.presentation, second.presentation);
    assert.ok(
      ["/portal/customer?first=1", "/portal/customer?second=1"].includes(String(first.presentation)),
      "the first transaction wins presentation without creating a second bearer",
    );
    assert.doesNotMatch(readFileSync(dataFile, "utf8"), /"token"\s*:/);
  });
});
