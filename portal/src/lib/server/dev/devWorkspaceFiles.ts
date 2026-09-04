import "server-only";

import crypto from "node:crypto";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import {
  commitDevTeamWorkspaceFiles,
  ensureHydrated,
  getState,
} from "@/server/storage";
import {
  DevTeamWorkspaceConflictError,
  type DevTeamWorkspaceFileCondition,
} from "@/server/devTeamWorkspacePersistence";
import type { DevTeamWorkspaceFile } from "@/server/types";

export const DEV_WORKSPACE_ROOT = resolve(process.cwd());

export interface DevWorkspaceFileVersion {
  mtimeMs: number;
  size: number;
  sha256: string;
}

export interface DevWorkspaceStat {
  mtimeMs: number;
  size: number;
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface DevWorkspaceDirent {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

export class DevWorkspaceFileConflictError extends Error {
  readonly relPath?: string;

  constructor(
    message = "The file changed before this write could commit. Reload and try again.",
    relPath?: string,
  ) {
    super(message);
    this.name = "DevWorkspaceFileConflictError";
    this.relPath = relPath;
  }
}

export function usesDurableDevTeamWorkspace(): boolean {
  const explicit = process.env.DEV_TEAM_WORKSPACE_BACKEND?.trim().toLowerCase();
  if (explicit === "state") return true;
  if (explicit === "file") return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  return Boolean(process.env.VERCEL_ENV || process.env.VERCEL === "1");
}

/**
 * The Dev Team workspace file collection is a `lazy` sidecar (~29% of the live
 * document): the common request never loads it, so every read here MUST ask for
 * it. This is the one collection this service touches; naming it on each
 * `ensureHydrated` brings its row in (once per hydration) wherever a Dev Team
 * operation enters, and no other page pays for it.
 */
const DEV_WORKSPACE_INCLUDE = ["devTeamWorkspaceFiles"] as const;

/** Refresh once at a Dev Team request boundary; local working trees stay cheap. */
export async function ensureDevTeamWorkspaceHydrated(): Promise<void> {
  await ensureHydrated({ fresh: usesDurableDevTeamWorkspace(), include: DEV_WORKSPACE_INCLUDE });
}

function toPosix(value: string): string {
  return value.split(sep).join("/");
}

export function devWorkspaceRelPath(target: string): string {
  const abs = resolve(target);
  if (abs === DEV_WORKSPACE_ROOT || !abs.startsWith(DEV_WORKSPACE_ROOT + sep)) {
    throw new Error("That path is outside the Dev Team workspace.");
  }
  const relPath = toPosix(relative(DEV_WORKSPACE_ROOT, abs));
  if (!relPath || relPath.split("/").some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("That Dev Team workspace path is invalid.");
  }
  return relPath;
}

function fileBytes(file: DevTeamWorkspaceFile): Buffer {
  return Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
}

function workspaceFile(relPath: string): DevTeamWorkspaceFile | undefined {
  return getState().devTeamWorkspaceFiles?.[relPath];
}

async function sourceVersion(target: string): Promise<DevWorkspaceFileVersion | null> {
  try {
    const [info, bytes] = await Promise.all([stat(target), readFile(target)]);
    if (!info.isFile()) return null;
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

function overlayVersion(file: DevTeamWorkspaceFile | undefined): DevWorkspaceFileVersion | null | undefined {
  if (!file) return undefined;
  if (file.deleted) return null;
  return { mtimeMs: file.mtimeMs, size: file.sizeBytes, sha256: file.sha256 };
}

export async function devWorkspaceFileVersion(target: string): Promise<DevWorkspaceFileVersion | null> {
  if (!usesDurableDevTeamWorkspace()) return sourceVersion(target);
  const relPath = devWorkspaceRelPath(target);
  await ensureHydrated({ include: DEV_WORKSPACE_INCLUDE });
  const overlaid = overlayVersion(workspaceFile(relPath));
  return overlaid === undefined ? sourceVersion(target) : overlaid;
}

export async function readDevWorkspaceFile(target: string): Promise<Buffer>;
export async function readDevWorkspaceFile(target: string, encoding: BufferEncoding): Promise<string>;
export async function readDevWorkspaceFile(
  target: string,
  encoding?: BufferEncoding,
): Promise<Buffer | string> {
  if (!usesDurableDevTeamWorkspace()) {
    return encoding ? readFile(target, encoding) : readFile(target);
  }
  const relPath = devWorkspaceRelPath(target);
  {
    await ensureHydrated({ include: DEV_WORKSPACE_INCLUDE });
    const file = workspaceFile(relPath);
    if (file?.deleted) {
      const error = new Error(`ENOENT: no such file, open '${target}'`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    if (file) {
      const bytes = fileBytes(file);
      return encoding ? bytes.toString(encoding) : bytes;
    }
  }
  return encoding ? readFile(target, encoding) : readFile(target);
}

async function sourceSnapshot(target: string): Promise<{
  bytes: Buffer;
  version: DevWorkspaceFileVersion;
}> {
  const handle = await open(target, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("Not a file.");
    const bytes = await handle.readFile();
    return {
      bytes,
      version: {
        mtimeMs: info.mtimeMs,
        size: info.size,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      },
    };
  } finally {
    await handle.close();
  }
}

export async function readDevWorkspaceSnapshot(target: string): Promise<{
  bytes: Buffer;
  version: DevWorkspaceFileVersion;
}> {
  if (!usesDurableDevTeamWorkspace()) return sourceSnapshot(target);
  const relPath = devWorkspaceRelPath(target);
  {
    await ensureHydrated({ include: DEV_WORKSPACE_INCLUDE });
    const file = workspaceFile(relPath);
    if (file?.deleted) {
      const error = new Error(`ENOENT: no such file, open '${target}'`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    if (file) {
      return {
        bytes: fileBytes(file),
        version: { mtimeMs: file.mtimeMs, size: file.sizeBytes, sha256: file.sha256 },
      };
    }
  }

  return sourceSnapshot(target);
}

export async function readDevWorkspaceHead(target: string, maxBytes: number): Promise<Buffer> {
  if (usesDurableDevTeamWorkspace()) {
    const relPath = devWorkspaceRelPath(target);
    await ensureHydrated({ include: DEV_WORKSPACE_INCLUDE });
    const file = workspaceFile(relPath);
    if (file?.deleted) {
      const error = new Error(`ENOENT: no such file, open '${target}'`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    if (file) return fileBytes(file).subarray(0, Math.max(0, maxBytes));
  }

  const handle = await open(target, "r");
  try {
    const buffer = Buffer.alloc(Math.max(0, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function condition(version: DevWorkspaceFileVersion | null): DevTeamWorkspaceFileCondition {
  return version ? { exists: true, sha256: version.sha256 } : { exists: false };
}

function recordFor(
  relPath: string,
  content: string | Buffer,
  mtimeMs: number,
  deleted = false,
): DevTeamWorkspaceFile {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  return {
    relPath,
    encoding: Buffer.isBuffer(content) ? "base64" : "utf8",
    content: Buffer.isBuffer(content) ? bytes.toString("base64") : content,
    sizeBytes: deleted ? 0 : bytes.byteLength,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    mtimeMs,
    deleted: deleted || undefined,
  };
}

export async function replaceDurableDevWorkspaceFile(
  target: string,
  content: string | Buffer,
  expected?: DevWorkspaceFileVersion | null,
): Promise<DevWorkspaceFileVersion> {
  const [version] = await replaceDurableDevWorkspaceFiles([{ target, content, expected }]);
  return version;
}

export async function replaceDurableDevWorkspaceFiles(
  replacements: Array<{
    target: string;
    content: string | Buffer;
    expected?: DevWorkspaceFileVersion | null;
  }>,
): Promise<DevWorkspaceFileVersion[]> {
  const inputs = await Promise.all(replacements.map(async replacement => ({
    ...replacement,
    relPath: devWorkspaceRelPath(replacement.target),
    baseline: await sourceVersion(replacement.target),
  })));
  // Refresh immediately before the CAS. Each expected version still describes
  // what its caller read; a different remote overlay will therefore conflict.
  await ensureHydrated({ fresh: true, include: DEV_WORKSPACE_INCLUDE });
  const now = Date.now();
  const prepared = await Promise.all(inputs.map(async input => {
    const current = await devWorkspaceFileVersion(input.target);
    const compared = input.expected === undefined ? current : input.expected;
    const mtimeMs = Math.max(now, (current?.mtimeMs ?? 0) + 1);
    return {
      input,
      current,
      compared,
      file: recordFor(input.relPath, input.content, mtimeMs),
    };
  }));
  try {
    await commitDevTeamWorkspaceFiles(prepared.map(({ input, compared, file }) => ({
      relPath: input.relPath,
      expected: condition(compared),
      baseline: condition(input.baseline),
      file,
    })));
  } catch (error) {
    if (error instanceof DevTeamWorkspaceConflictError) throw new DevWorkspaceFileConflictError(undefined, error.relPath);
    throw error;
  }
  return prepared.map(({ file }) => ({
    mtimeMs: file.mtimeMs,
    size: file.sizeBytes,
    sha256: file.sha256,
  }));
}

export async function createDurableDevWorkspaceFile(
  target: string,
  content: string | Buffer,
): Promise<DevWorkspaceFileVersion> {
  return replaceDurableDevWorkspaceFile(target, content, null);
}

export async function deleteDurableDevWorkspaceFile(
  target: string,
  expected?: DevWorkspaceFileVersion | null,
): Promise<void> {
  const relPath = devWorkspaceRelPath(target);
  const baseline = await sourceVersion(target);
  await ensureHydrated({ fresh: true, include: DEV_WORKSPACE_INCLUDE });
  const current = await devWorkspaceFileVersion(target);
  const compared = expected === undefined ? current : expected;
  if (!compared) return;
  const mtimeMs = Math.max(Date.now(), compared.mtimeMs + 1);
  const file = recordFor(relPath, Buffer.alloc(0), mtimeMs, true);
  try {
    await commitDevTeamWorkspaceFiles([{
      relPath,
      expected: condition(compared),
      baseline: condition(baseline),
      file,
    }]);
  } catch (error) {
    if (error instanceof DevTeamWorkspaceConflictError) throw new DevWorkspaceFileConflictError(undefined, error.relPath);
    throw error;
  }
}

function dirent(name: string, kind: "file" | "directory"): DevWorkspaceDirent {
  return {
    name,
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
  };
}

export async function readDevWorkspaceDirectory(target: string): Promise<DevWorkspaceDirent[]> {
  if (!usesDurableDevTeamWorkspace()) {
    return (await readdir(target, { withFileTypes: true })).map(entry => ({
      name: entry.name,
      isFile: () => entry.isFile(),
      isDirectory: () => entry.isDirectory(),
    }));
  }
  const relDir = target === DEV_WORKSPACE_ROOT ? "" : devWorkspaceRelPath(target);

  await ensureHydrated({ include: DEV_WORKSPACE_INCLUDE });
  const entries = new Map<string, "file" | "directory">();
  try {
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (entry.isDirectory()) entries.set(entry.name, "directory");
      else if (entry.isFile()) entries.set(entry.name, "file");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const prefix = relDir ? `${relDir}/` : "";
  for (const file of Object.values(getState().devTeamWorkspaceFiles ?? {})) {
    if (!file.relPath.startsWith(prefix)) continue;
    const remainder = file.relPath.slice(prefix.length);
    if (!remainder) continue;
    const slash = remainder.indexOf("/");
    const name = slash < 0 ? remainder : remainder.slice(0, slash);
    if (slash >= 0) {
      if (!file.deleted) entries.set(name, "directory");
      continue;
    }
    if (file.deleted) entries.delete(name);
    else entries.set(name, "file");
  }

  return [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, kind]) => dirent(name, kind));
}

export async function statDevWorkspacePath(target: string): Promise<DevWorkspaceStat> {
  if (usesDurableDevTeamWorkspace()) {
    const relPath = devWorkspaceRelPath(target);
    await ensureHydrated({ include: DEV_WORKSPACE_INCLUDE });
    const file = workspaceFile(relPath);
    if (file?.deleted) {
      const error = new Error(`ENOENT: no such file or directory, stat '${target}'`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    if (file) {
      return { mtimeMs: file.mtimeMs, size: file.sizeBytes, isFile: () => true, isDirectory: () => false };
    }
    const prefix = `${relPath}/`;
    const children = Object.values(getState().devTeamWorkspaceFiles ?? {})
      .filter(entry => !entry.deleted && entry.relPath.startsWith(prefix));
    if (children.length > 0) {
      return {
        mtimeMs: Math.max(...children.map(entry => entry.mtimeMs)),
        size: 0,
        isFile: () => false,
        isDirectory: () => true,
      };
    }
  }
  const info = await stat(target);
  return {
    mtimeMs: info.mtimeMs,
    size: info.size,
    isFile: () => info.isFile(),
    isDirectory: () => info.isDirectory(),
  };
}
