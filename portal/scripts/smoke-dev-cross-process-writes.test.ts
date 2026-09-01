// Dev Team source-of-truth writers — REAL cross-process collision proof.
//
// Promise.all inside one imported module only proves a module-local queue. The
// production risk is two Next workers (or the portal plus a command worker),
// each with a separate module cache. Every pair below is therefore launched in
// separate Node processes against the same isolated filesystem.

process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require_.resolve("tsx");
const SANDBOX = mkdtempSync(join(tmpdir(), "aqua-cross-process-"));
const transactions = require_("../src/lib/server/dev/devFileTransaction") as
  typeof import("../src/lib/server/dev/devFileTransaction");

const CHILD_SOURCE = String.raw`
const action = process.env.AQUA_TEST_ACTION;
const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
try {
  process.chdir(process.env.AQUA_TEST_CWD);
  const mod = await import(process.env.AQUA_TEST_MODULE);
  const api = mod.default || mod;
  let value;
  if (action === "roadmap") value = await api.addItem(input, Number(process.env.AQUA_TEST_NOW));
  else if (action === "updates") value = await api.appendUpdateEntry(input, Number(process.env.AQUA_TEST_NOW));
  else if (action === "thoughts") value = await api.addThought(input);
  else if (action === "findings") value = await api.createFinding(input);
  else if (action === "doc") value = await api.saveDevDoc(input);
  else throw new Error("Unknown child action: " + action);
  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}
`;

interface ChildResult {
  ok: boolean;
  value?: Record<string, unknown>;
  error?: string;
}

function moduleUrl(relPath: string): string {
  return pathToFileURL(join(REPO_ROOT, relPath)).href;
}

async function runChild(options: {
  action: string;
  module: string;
  cwd: string;
  input: unknown;
  now?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      TSX_LOADER,
      "--input-type=module",
      "--eval",
      CHILD_SOURCE,
    ], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORTAL_BACKEND: "memory",
        TSX_TSCONFIG_PATH: join(REPO_ROOT, "tsconfig.json"),
        AQUA_TEST_ACTION: options.action,
        AQUA_TEST_MODULE: moduleUrl(options.module),
        AQUA_TEST_CWD: options.cwd,
        AQUA_TEST_INPUT: JSON.stringify(options.input),
        AQUA_TEST_NOW: String(options.now ?? Date.now()),
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) {
        rejectChild(new Error(`child exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolveChild(JSON.parse(stdout) as ChildResult);
      } catch {
        rejectChild(new Error(`child returned non-JSON output: ${stdout}\n${stderr}`));
      }
    });
  });
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function transactionArtifacts(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const abs = join(directory, entry.name);
      if (/\.aqua-lock(?:\.reaper)?$|\.tmp$/.test(entry.name)) out.push(abs);
      if (entry.isDirectory()) await walk(abs);
    }
  }
  await walk(root);
  return out;
}

before(async () => {
  await mkdir(SANDBOX, { recursive: true });
});

after(async () => {
  await rm(SANDBOX, { recursive: true, force: true });
});

describe("separate Node processes preserve every successful write", () => {
  it("keeps both roadmap additions", async () => {
    const root = join(SANDBOX, "roadmap");
    const roadmap = join(root, "roadmap.md");
    await writeText(roadmap, "# Product Roadmap\n\n## Now\n\n## Next\n\n## Later\n\n## Shipped\n");
    const now = Date.parse("2026-08-25T10:00:00Z");
    const common = {
      action: "roadmap",
      module: "src/lib/server/dev/devTeamRoadmap.ts",
      cwd: root,
      now,
      env: { PORTAL_ROADMAP_FILE: roadmap },
    };
    const [a, b] = await Promise.all([
      runChild({ ...common, input: { title: "Cross process alpha", horizon: "now" } }),
      runChild({ ...common, input: { title: "Cross process beta", horizon: "now" } }),
    ]);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    const markdown = await readFile(roadmap, "utf8");
    assert.match(markdown, /Cross process alpha/);
    assert.match(markdown, /Cross process beta/);
  });

  it("keeps both Updates entries", async () => {
    const root = join(SANDBOX, "updates");
    const updates = join(root, "docs", "development", "updates.md");
    await writeText(updates, "# Updates\n\nLive record.\n\n---\n");
    const common = {
      action: "updates",
      module: "src/lib/server/dev/devTeamUpdates.ts",
      cwd: root,
      now: Date.parse("2026-08-25T10:01:00Z"),
    };
    const [a, b] = await Promise.all([
      runChild({ ...common, input: { title: "Process update alpha", bullets: ["alpha survived"] } }),
      runChild({ ...common, input: { title: "Process update beta", bullets: ["beta survived"] } }),
    ]);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    const markdown = await readFile(updates, "utf8");
    assert.match(markdown, /Process update alpha/);
    assert.match(markdown, /Process update beta/);
  });

  it("keeps both thoughts", async () => {
    const root = join(SANDBOX, "thoughts");
    const ledger = join(root, "thoughts.json");
    await writeText(ledger, "[]\n");
    const common = {
      action: "thoughts",
      module: "src/lib/server/dev/devTeamThoughts.ts",
      cwd: root,
      env: { DEV_THOUGHTS_FILE: ledger },
    };
    const [a, b] = await Promise.all([
      runChild({ ...common, input: { text: "thought from alpha", author: "Alpha" } }),
      runChild({ ...common, input: { text: "thought from beta", author: "Beta" } }),
    ]);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    const rows = JSON.parse(await readFile(ledger, "utf8")) as { text: string }[];
    assert.deepEqual(new Set(rows.map(row => row.text)), new Set(["thought from alpha", "thought from beta"]));
  });

  it("allocates distinct files for same-title findings", async () => {
    const root = join(SANDBOX, "findings");
    await mkdir(root, { recursive: true });
    const common = {
      action: "findings",
      module: "src/lib/server/dev/devTeamFindings.ts",
      cwd: root,
    };
    const now = Date.parse("2026-08-25T10:02:00Z");
    const [a, b] = await Promise.all([
      runChild({ ...common, input: { title: "Same collision", note: "alpha note", now } }),
      runChild({ ...common, input: { title: "Same collision", note: "beta note", now } }),
    ]);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    assert.notEqual(a.value?.slug, b.value?.slug);
    const files = await readdir(join(root, "docs", "development", "findings"));
    const markdown = await Promise.all(files.filter(name => name.endsWith(".md")).map(name =>
      readFile(join(root, "docs", "development", "findings", name), "utf8")));
    assert.equal(markdown.length, 2);
    assert.ok(markdown.some(value => value.includes("alpha note")));
    assert.ok(markdown.some(value => value.includes("beta note")));
  });

  it("allows exactly one stale-base doc save and attributes the surviving bytes", async () => {
    const root = join(SANDBOX, "docs");
    const document = join(root, "docs", "shared.md");
    const original = "# Shared\n\noriginal\n";
    await writeText(document, original);
    const originalInfo = await stat(document);
    const originalSha = crypto.createHash("sha256").update(original).digest("hex");
    const session = { email: "ed@aquacrm.test", role: "agency-owner" };
    const common = {
      action: "doc",
      module: "src/lib/server/dev/devDocEdits.ts",
      cwd: root,
    };
    const [a, b] = await Promise.all([
      runChild({ ...common, input: {
        session, relPath: "docs/shared.md", content: "# Shared\n\nalpha wins\n",
        authorName: "Alpha", expectedMtimeMs: originalInfo.mtimeMs, expectedSha256: originalSha,
      } }),
      runChild({ ...common, input: {
        session, relPath: "docs/shared.md", content: "# Shared\n\nbeta wins\n",
        authorName: "Beta", expectedMtimeMs: originalInfo.mtimeMs, expectedSha256: originalSha,
      } }),
    ]);
    assert.equal([a, b].filter(result => result.ok).length, 1, JSON.stringify([a, b]));
    assert.match([a, b].find(result => !result.ok)?.error ?? "", /changed on disk/i);

    const finalBytes = await readFile(document, "utf8");
    const winner = finalBytes.includes("alpha wins") ? "Alpha" : "Beta";
    const ledger = JSON.parse(await readFile(join(root, ".data", "dev-doc-edits.json"), "utf8")) as {
      author: string;
      contentSha256: string;
    }[];
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].author, winner);
    assert.equal(ledger[0].contentSha256, crypto.createHash("sha256").update(finalBytes).digest("hex"));
  });
});

it("compare-and-swap refuses to overwrite a direct writer that ignores Aqua's lock", async () => {
  const target = join(SANDBOX, "direct-writer", "shared.md");
  await writeText(target, "original\n");
  const expected = await transactions.devFileVersion(target);
  assert.ok(expected);

  await writeFile(target, "external bytes survive\n", "utf8");
  await assert.rejects(
    () => transactions.atomicReplaceDevFile(target, "stale Aqua bytes\n", expected),
    (error: unknown) => error instanceof transactions.DevFileConflictError,
  );
  assert.equal(await readFile(target, "utf8"), "external bytes survive\n");
});

it("recovers a document and attribution ledger after a crash between their renames", async () => {
  const root = join(SANDBOX, "journal-between-renames");
  const document = join(root, "docs", "shared.md");
  const ledger = join(root, ".data", "dev-doc-edits.json");
  await writeText(document, "old document\n");
  await writeText(ledger, "[]\n");
  const documentVersion = await transactions.devFileVersion(document);
  const ledgerVersion = await transactions.devFileVersion(ledger);
  assert.ok(documentVersion);
  assert.ok(ledgerVersion);

  await assert.rejects(
    () => transactions.replaceDevFilesWithJournal(ledger, [
      { target: document, content: "new document\n", expected: documentVersion },
      { target: ledger, content: '[{"author":"Ed"}]\n', expected: ledgerVersion },
    ], {
      afterApplied(appliedCount) {
        if (appliedCount === 1) throw new Error("simulated process death");
      },
    }),
    /simulated process death/,
  );

  assert.equal(await readFile(document, "utf8"), "new document\n");
  assert.equal(await readFile(ledger, "utf8"), "[]\n");
  assert.ok(await stat(`${ledger}.aqua-batch-journal.json`));

  const recovered = await transactions.recoverDevFileBatch(ledger, [document, ledger]);
  assert.equal(recovered?.length, 2);
  assert.equal(await readFile(document, "utf8"), "new document\n");
  assert.equal(await readFile(ledger, "utf8"), '[{"author":"Ed"}]\n');
  assert.equal(await stat(`${ledger}.aqua-batch-journal.json`).catch(() => null), null);
});

it("recovers a crash after both renames and removes only the completed journal", async () => {
  const root = join(SANDBOX, "journal-after-renames");
  const document = join(root, "docs", "shared.md");
  const ledger = join(root, ".data", "dev-doc-edits.json");
  await writeText(document, "old document\n");
  await writeText(ledger, "[]\n");
  const documentVersion = await transactions.devFileVersion(document);
  const ledgerVersion = await transactions.devFileVersion(ledger);
  assert.ok(documentVersion);
  assert.ok(ledgerVersion);

  await assert.rejects(
    () => transactions.replaceDevFilesWithJournal(ledger, [
      { target: document, content: "committed document\n", expected: documentVersion },
      { target: ledger, content: '[{"author":"Aqua"}]\n', expected: ledgerVersion },
    ], {
      afterApplied(appliedCount) {
        if (appliedCount === 2) throw new Error("simulated death before cleanup");
      },
    }),
    /simulated death before cleanup/,
  );

  assert.equal(await readFile(document, "utf8"), "committed document\n");
  assert.equal(await readFile(ledger, "utf8"), '[{"author":"Aqua"}]\n');
  assert.ok(await stat(`${ledger}.aqua-batch-journal.json`));
  await transactions.recoverDevFileBatch(ledger, [document, ledger]);
  assert.equal(await stat(`${ledger}.aqua-batch-journal.json`).catch(() => null), null);
});

it("keeps the journal and refuses to overwrite an outside edit during recovery", async () => {
  const root = join(SANDBOX, "journal-conflict");
  const document = join(root, "docs", "shared.md");
  const ledger = join(root, ".data", "dev-doc-edits.json");
  await writeText(document, "old document\n");
  await writeText(ledger, "[]\n");
  const documentVersion = await transactions.devFileVersion(document);
  const ledgerVersion = await transactions.devFileVersion(ledger);
  assert.ok(documentVersion);
  assert.ok(ledgerVersion);

  await assert.rejects(
    () => transactions.replaceDevFilesWithJournal(ledger, [
      { target: document, content: "new document\n", expected: documentVersion },
      { target: ledger, content: '[{"author":"Ed"}]\n', expected: ledgerVersion },
    ], {
      afterApplied(appliedCount) {
        if (appliedCount === 1) throw new Error("simulated process death");
      },
    }),
    /simulated process death/,
  );
  await writeFile(ledger, "outside writer survives\n", "utf8");

  await assert.rejects(
    () => transactions.recoverDevFileBatch(ledger, [document, ledger]),
    (error: unknown) => error instanceof transactions.DevFileConflictError,
  );
  assert.equal(await readFile(document, "utf8"), "new document\n");
  assert.equal(await readFile(ledger, "utf8"), "outside writer survives\n");
  assert.ok(await stat(`${ledger}.aqua-batch-journal.json`));
});

it("rejects a schema-valid journal whose target was changed outside the allowed batch", async () => {
  const root = join(SANDBOX, "journal-target-binding");
  const document = join(root, "docs", "shared.md");
  const ledger = join(root, ".data", "dev-doc-edits.json");
  const outside = join(SANDBOX, "journal-target-escape.md");
  await writeText(document, "original document\n");
  await writeText(ledger, "[]\n");
  const malicious = Buffer.from("outside overwrite\n", "utf8");
  const journal = {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    operations: [{
      target: outside,
      contentBase64: malicious.toString("base64"),
      contentSha256: crypto.createHash("sha256").update(malicious).digest("hex"),
      expected: null,
    }, {
      target: ledger,
      contentBase64: Buffer.from("[]\n", "utf8").toString("base64"),
      contentSha256: crypto.createHash("sha256").update("[]\n").digest("hex"),
      expected: await transactions.devFileVersion(ledger),
    }],
  };
  await writeFile(`${ledger}.aqua-batch-journal.json`, JSON.stringify(journal), "utf8");

  await assert.rejects(
    () => transactions.recoverDevFileBatch(ledger, [document, ledger]),
    /does not match its allowed canonical targets and was left untouched/,
  );
  assert.equal(await stat(outside).catch(() => null), null, "the forged outside target was written before validation");
  assert.equal(await readFile(document, "utf8"), "original document\n");
  assert.ok(await stat(`${ledger}.aqua-batch-journal.json`), "the rejected journal was not retained for inspection");
});

it("allows same-request nested transactions without letting another caller bypass the lock", async () => {
  const target = join(SANDBOX, "reentrant", "portal-state.json");
  const order: string[] = [];
  let releaseOuter!: () => void;
  let outerEntered!: () => void;
  const outerReady = new Promise<void>(resolveReady => { outerEntered = resolveReady; });
  const outerGate = new Promise<void>(resolveGate => { releaseOuter = resolveGate; });

  const outer = transactions.withDevFileTransaction(target, async () => {
    order.push("outer-enter");
    await transactions.withDevFileTransaction(target, async () => {
      order.push("nested-enter");
    });
    outerEntered();
    await outerGate;
    order.push("outer-exit");
  });

  await outerReady;
  let competingEntered = false;
  const competing = transactions.withDevFileTransaction(target, async () => {
    competingEntered = true;
    order.push("competing-enter");
  });
  await new Promise(resolveDelay => setTimeout(resolveDelay, 75));
  assert.equal(competingEntered, false, "an unrelated async caller bypassed the owned filesystem lock");

  releaseOuter();
  await Promise.all([outer, competing]);
  assert.deepEqual(order, ["outer-enter", "nested-enter", "outer-exit", "competing-enter"]);
});

it("leaves no lock/reaper/temp artifacts after the collision suite", async () => {
  assert.deepEqual(await transactionArtifacts(SANDBOX), []);
});
