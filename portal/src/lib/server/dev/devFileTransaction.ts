import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { mkdir, open, readFile, rename, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createDurableDevWorkspaceFile,
  deleteDurableDevWorkspaceFile,
  devWorkspaceFileVersion,
  DevWorkspaceFileConflictError,
  replaceDurableDevWorkspaceFile,
  usesDurableDevTeamWorkspace,
} from "@/lib/server/dev/devWorkspaceFiles";

const DEFAULT_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 60_000;
const heldTransactions = new AsyncLocalStorage<ReadonlySet<string>>();

export class DevFileConflictError extends Error {
  constructor(message = "The file changed before this write could commit. Reload and try again.") {
    super(message);
    this.name = "DevFileConflictError";
  }
}

interface LockOwner {
  pid: number;
  createdAt: number;
}

function lockDirectory(target: string): string {
  return `${target}.aqua-lock`;
}

function ownerPath(target: string): string {
  return `${lockDirectory(target)}/owner.json`;
}

function processExists(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function staleLock(target: string): Promise<boolean> {
  const directory = lockDirectory(target);
  const info = await stat(directory).catch(() => null);
  if (!info) return false;
  let owner: LockOwner | null = null;
  try {
    owner = JSON.parse(await readFile(ownerPath(target), "utf8")) as LockOwner;
  } catch {
    // A creator may be between mkdir and owner.json. Age is the only safe test.
  }
  if (owner) return !processExists(owner.pid);
  return Date.now() - info.mtimeMs > STALE_LOCK_MS;
}

async function reapStaleLock(target: string): Promise<boolean> {
  const reaper = `${lockDirectory(target)}.reaper`;
  try {
    await mkdir(reaper);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    if (!(await staleLock(target))) return false;
    const stale = `${lockDirectory(target)}.stale-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
    try {
      // Detach the stale directory atomically before recursive cleanup. Direct
      // rm -r can unlink the path, let a successor mkdir it, then sweep that
      // successor's new owner.json as the old removal finishes (ABA race).
      await rename(lockDirectory(target), stale);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    await rm(stale, { recursive: true, force: true });
    return true;
  } finally {
    await rmdir(reaper).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}

async function releaseLock(target: string): Promise<void> {
  const directory = lockDirectory(target);
  const released = `${directory}.released-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  try {
    // Rename is the linearization point: a successor may safely create the
    // canonical lock path immediately, while cleanup only touches our detached
    // directory and can never erase the successor.
    await rename(directory, released);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await rm(released, { recursive: true, force: true });
}

async function acquire(target: string, timeoutMs: number): Promise<() => Promise<void>> {
  const directory = lockDirectory(target);
  await mkdir(dirname(directory), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(directory);
      try {
        await writeFile(ownerPath(target), JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf8");
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
      return async () => { await releaseLock(target); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await reapStaleLock(target)) continue;
      if (Date.now() - started >= timeoutMs) {
        throw new DevFileConflictError("Another process is still writing this file. Try again in a moment.");
      }
      await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 30)));
    }
  }
}

/** A filesystem-visible mutex shared by every Node process using this helper. */
export async function withDevFileTransaction<T>(
  target: string,
  operation: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  // The production workspace uses a database row lock + compare-and-swap in
  // `commitDevTeamWorkspaceFiles`; an ephemeral filesystem mutex would protect
  // only one serverless instance and can be read-only on Vercel.
  if (usesDurableDevTeamWorkspace()) return operation();
  const transactionTarget = resolve(target);
  const held = heldTransactions.getStore();
  // File-backed PortalState transactions legitimately compose: a client-ledger
  // command can call a plugin service whose own atomic operation protects the
  // same whole-state file. Acquiring the non-reentrant filesystem lock twice in
  // one async request deadlocks until timeout. AsyncLocalStorage scopes this
  // bypass to the lock-owning call chain; unrelated requests in this process
  // still wait on the filesystem mutex.
  if (held?.has(transactionTarget)) return operation();

  const release = await acquire(transactionTarget, timeoutMs);
  const nextHeld = new Set(held);
  nextHeld.add(transactionTarget);
  try {
    return await heldTransactions.run(nextHeld, operation);
  } finally {
    await release();
  }
}

export interface DevFileVersion {
  mtimeMs: number;
  size: number;
  sha256: string;
}

export async function devFileVersion(target: string): Promise<DevFileVersion | null> {
  if (usesDurableDevTeamWorkspace()) return devWorkspaceFileVersion(target);
  try {
    const [info, bytes] = await Promise.all([stat(target), readFile(target)]);
    return {
      mtimeMs: info.mtimeMs,
      size: info.size,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sameVersion(left: DevFileVersion | null, right: DevFileVersion | null): boolean {
  return left?.mtimeMs === right?.mtimeMs
    && left?.size === right?.size
    && left?.sha256 === right?.sha256;
}

/**
 * Durable temp+fsync+rename replacement, optionally compare-and-swapped against
 * the bytes the caller read. The version check catches uncooperative editor or
 * worker writes that do not use Aqua's lock before they can be overwritten.
 */
export async function atomicReplaceDevFile(
  target: string,
  content: string | Buffer,
  expected?: DevFileVersion | null,
): Promise<DevFileVersion> {
  if (usesDurableDevTeamWorkspace()) {
    try {
      return await replaceDurableDevWorkspaceFile(target, content, expected);
    } catch (error) {
      if (error instanceof DevWorkspaceFileConflictError) throw new DevFileConflictError(error.message);
      throw error;
    }
  }
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    if (expected !== undefined) {
      const current = await devFileVersion(target);
      if (!sameVersion(expected, current)) throw new DevFileConflictError();
    }
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }

  const version = await devFileVersion(target);
  if (!version) throw new Error("The committed file could not be read back.");
  return version;
}

export interface DevFileBatchReplacement {
  target: string;
  content: string | Buffer;
  expected: DevFileVersion | null;
}

interface DevFileBatchJournalOperation {
  target: string;
  contentBase64: string;
  contentSha256: string;
  expected: DevFileVersion | null;
}

interface DevFileBatchJournal {
  version: 1;
  id: string;
  createdAt: number;
  operations: DevFileBatchJournalOperation[];
}

function batchJournalPath(lockTarget: string): string {
  return `${resolve(lockTarget)}.aqua-batch-journal.json`;
}

function isBatchJournal(value: unknown): value is DevFileBatchJournal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<DevFileBatchJournal>;
  return row.version === 1
    && typeof row.id === "string"
    && Number.isFinite(row.createdAt)
    && Array.isArray(row.operations)
    && row.operations.length > 0
    && row.operations.every(operation => {
      if (!operation || typeof operation !== "object") return false;
      return typeof operation.target === "string"
        && typeof operation.contentBase64 === "string"
        && /^[0-9a-f]{64}$/.test(operation.contentSha256)
        && (operation.expected === null || (
          typeof operation.expected === "object"
          && Number.isFinite(operation.expected.mtimeMs)
          && Number.isFinite(operation.expected.size)
          && /^[0-9a-f]{64}$/.test(operation.expected.sha256)
        ));
    });
}

function assertBatchJournalTargets(
  lockTarget: string,
  allowedTargets: readonly string[],
  journal: DevFileBatchJournal,
): void {
  const canonicalLockTarget = resolve(lockTarget);
  const canonicalAllowedTargets = allowedTargets.map(target => resolve(target));
  if (!canonicalAllowedTargets.includes(canonicalLockTarget)) {
    throw new Error("The recovery journal target policy must include its lock target.");
  }
  if (new Set(canonicalAllowedTargets).size !== canonicalAllowedTargets.length) {
    throw new Error("The recovery journal target policy cannot contain the same target twice.");
  }
  const journalTargets = journal.operations.map(operation => operation.target);
  const canonicalJournalTargets = journalTargets.map(target => resolve(target));
  const targetsAreCanonical = journalTargets.every((target, index) => target === canonicalJournalTargets[index]);
  const targetsMatch = targetsAreCanonical
    && canonicalJournalTargets.length === canonicalAllowedTargets.length
    && canonicalJournalTargets.every((target, index) => target === canonicalAllowedTargets[index]);
  if (!targetsMatch) {
    throw new Error(
      `The recovery journal at ${batchJournalPath(lockTarget)} does not match its allowed canonical targets and was left untouched.`,
    );
  }
}

async function readBatchJournal(
  lockTarget: string,
  allowedTargets: readonly string[],
): Promise<DevFileBatchJournal | null> {
  const path = batchJournalPath(lockTarget);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isBatchJournal(parsed)) {
      throw new Error(`The recovery journal at ${path} is invalid and was left untouched.`);
    }
    assertBatchJournalTargets(lockTarget, allowedTargets, parsed);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function completeBatchJournal(
  lockTarget: string,
  journal: DevFileBatchJournal,
  afterApplied?: (appliedCount: number) => void | Promise<void>,
): Promise<DevFileVersion[]> {
  const versions: DevFileVersion[] = [];
  let appliedCount = 0;

  for (const operation of journal.operations) {
    const bytes = Buffer.from(operation.contentBase64, "base64");
    const desiredSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (desiredSha256 !== operation.contentSha256) {
      throw new Error(`The recovery journal for ${operation.target} failed its content checksum.`);
    }

    const current = await devFileVersion(operation.target);
    if (current?.sha256 === operation.contentSha256 && current.size === bytes.byteLength) {
      versions.push(current);
      continue;
    }
    if (!sameVersion(operation.expected, current)) {
      throw new DevFileConflictError(
        `A recoverable Dev Team save could not finish because ${operation.target} changed outside the transaction. The journal was retained.`,
      );
    }

    versions.push(await atomicReplaceDevFile(operation.target, bytes, operation.expected));
    appliedCount += 1;
    await afterApplied?.(appliedCount);
  }

  await unlink(batchJournalPath(lockTarget));
  return versions;
}

/**
 * Finish a previously prepared local multi-file save.
 *
 * The journal is retained on every failure. Recovery accepts only an exact
 * expected version or the already-committed desired bytes, so it can resume a
 * crash without overwriting a direct editor/worker change.
 */
export async function recoverDevFileBatch(
  lockTarget: string,
  allowedTargets: readonly string[],
): Promise<DevFileVersion[] | null> {
  if (usesDurableDevTeamWorkspace()) return null;
  return withDevFileTransaction(lockTarget, async () => {
    const journal = await readBatchJournal(lockTarget, allowedTargets);
    return journal ? completeBatchJournal(lockTarget, journal) : null;
  });
}

/**
 * Journaled multi-file replacement for the local/file Dev Team workspace.
 *
 * Durable production workspaces already use one database transaction. Local
 * worktrees cannot atomically rename two files, so the durable journal makes
 * the intended document+ledger pair recoverable after every crash boundary.
 */
export async function replaceDevFilesWithJournal(
  lockTarget: string,
  replacements: readonly DevFileBatchReplacement[],
  options: { afterApplied?: (appliedCount: number) => void | Promise<void> } = {},
): Promise<DevFileVersion[]> {
  if (usesDurableDevTeamWorkspace()) {
    throw new Error("Durable Dev Team workspaces must use their database batch transaction.");
  }
  if (replacements.length === 0) return [];

  return withDevFileTransaction(lockTarget, async () => {
    const targets = replacements.map(replacement => resolve(replacement.target));
    if (new Set(targets).size !== targets.length) {
      throw new Error("A Dev Team file batch cannot contain the same target twice.");
    }
    if (!targets.includes(resolve(lockTarget))) {
      throw new Error("A Dev Team file batch must include its lock target.");
    }

    const stale = await readBatchJournal(lockTarget, targets);
    if (stale) await completeBatchJournal(lockTarget, stale);

    for (let index = 0; index < replacements.length; index += 1) {
      const current = await devFileVersion(targets[index]);
      if (!sameVersion(replacements[index].expected, current)) throw new DevFileConflictError();
    }

    const journal: DevFileBatchJournal = {
      version: 1,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      operations: replacements.map((replacement, index) => {
        const bytes = Buffer.isBuffer(replacement.content)
          ? replacement.content
          : Buffer.from(replacement.content, "utf8");
        return {
          target: targets[index],
          contentBase64: bytes.toString("base64"),
          contentSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          expected: replacement.expected,
        };
      }),
    };

    const path = batchJournalPath(lockTarget);
    await atomicReplaceDevFile(path, JSON.stringify(journal) + "\n", null);
    return completeBatchJournal(lockTarget, journal, options.afterApplied);
  });
}

/** Create a file exactly once on either the real working tree or durable overlay. */
export async function createDevFileExclusive(
  target: string,
  content: string | Buffer,
): Promise<DevFileVersion> {
  if (usesDurableDevTeamWorkspace()) {
    try {
      return await createDurableDevWorkspaceFile(target, content);
    } catch (error) {
      if (error instanceof DevWorkspaceFileConflictError) {
        const exists = new Error(`EEXIST: file already exists, open '${target}'`) as NodeJS.ErrnoException;
        exists.code = "EEXIST";
        throw exists;
      }
      throw error;
    }
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" });
  const version = await devFileVersion(target);
  if (!version) throw new Error("The created file could not be read back.");
  return version;
}

/** Delete through a production tombstone so the bundled baseline stays hidden. */
export async function deleteDevFile(
  target: string,
  expected?: DevFileVersion | null,
): Promise<void> {
  if (usesDurableDevTeamWorkspace()) {
    try {
      await deleteDurableDevWorkspaceFile(target, expected);
      return;
    } catch (error) {
      if (error instanceof DevWorkspaceFileConflictError) throw new DevFileConflictError(error.message);
      throw error;
    }
  }
  if (expected !== undefined) {
    const current = await devFileVersion(target);
    if (!sameVersion(expected, current)) throw new DevFileConflictError();
  }
  await unlink(target).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}
