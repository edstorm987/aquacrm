import "server-only";

import { access, readFile, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { DevProject } from "@/server/types";

export const LOCAL_PREVIEW_MANIFEST = "aqua-preview.config.json";
export const LOCAL_PREVIEW_REGISTRY_ENV = "AQUA_DEV_PREVIEW_PROJECTS_JSON";
export const LOCAL_PREVIEW_SAFE_ROOTS_ENV = "AQUA_DEV_PREVIEW_SAFE_ROOTS";

const MAX_ARGS = 96;
const MAX_ARG_LENGTH = 2_000;
const MAX_ENV_VALUE = 8_000;
const MAX_REMOTE_URL = 2_000;
const ALLOWED_NAMED_COMMANDS = new Set(["node", "npm", "npm.cmd", "pnpm", "yarn", "bun", "deno"]);
/**
 * Clone transports a trusted record may name. `http:` is excluded (a plaintext
 * transport for source that becomes the preview), and so is every git helper
 * scheme (`ext::`, `git+…`) that can hand git an arbitrary command to run.
 * `file:` is a genuine local-mirror transport and is what the tests exercise.
 */
const ALLOWED_REMOTE_PROTOCOLS = new Set(["https:", "ssh:", "file:"]);

export interface TrustedLocalRepositoryPreviewRecord {
  /** Optional exact selectors. At least one selector must match. */
  projectIds?: string[];
  repositories?: string[];
  allowBlankRepository?: boolean;
  /** Absolute in server registry records; implicit process.cwd() in a manifest. */
  worktreePath: string;
  /**
   * Declared git remote to clone into `worktreePath` when that directory does
   * not exist yet. Trusted-record only — the request never supplies a URL — and
   * limited to https/ssh/file with no embedded credentials. With it declared,
   * `worktreePath` is a CLONE DESTINATION: it may be missing (its parent must
   * exist inside the safe roots), and an existing clone is resumed, never
   * re-cloned over.
   */
  remoteUrl?: string;
  command: string;
  args: string[];
  /**
   * Declared dependency-install command, run once per isolated worktree before
   * the preview starts (and again when the lockfile fingerprint changes).
   * Same allowlist as `command`; only meaningful with `isolatedWorktrees`.
   */
  installCommand?: string;
  installArgs?: string[];
  installTimeoutMs?: number;
  healthPath?: string;
  startupTimeoutMs?: number;
  healthPollIntervalMs?: number;
  env?: Record<string, string>;
  /**
   * Run each project's preview inside its own git worktree on the project's
   * draft branch (`aqua-editor/<projectId>`) instead of the shared checkout.
   * The isolated worktree is derived server-side from this record's trusted
   * `worktreePath`; the request never chooses a path or branch.
   */
  isolatedWorktrees?: boolean;
  source?: string;
}

export interface ResolvedLocalRepositoryPreviewConfig {
  worktreePath: string;
  /** See TrustedLocalRepositoryPreviewRecord.remoteUrl; absent means "no clone step". */
  remoteUrl?: string;
  command: string;
  args: string[];
  /** Resolved dependency-install command; absent means "no install step". */
  installCommand?: string;
  installArgs: string[];
  installTimeoutMs: number;
  healthPath: string;
  startupTimeoutMs: number;
  healthPollIntervalMs: number;
  env: Record<string, string>;
  /** See TrustedLocalRepositoryPreviewRecord.isolatedWorktrees. */
  isolatedWorktrees?: boolean;
  source: string;
}

interface ManifestShape {
  version?: number;
  projectIds?: unknown;
  repositories?: unknown;
  allowBlankRepository?: unknown;
  isolatedWorktrees?: unknown;
  remoteUrl?: unknown;
  command?: unknown;
  args?: unknown;
  installCommand?: unknown;
  installArgs?: unknown;
  installTimeoutMs?: unknown;
  healthPath?: unknown;
  startupTimeoutMs?: unknown;
  healthPollIntervalMs?: unknown;
  env?: unknown;
}

export class LocalRepositoryPreviewConfigError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LocalRepositoryPreviewConfigError";
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean);
}

function recordEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function parseRecord(value: unknown, source: string, implicitWorktree?: string): TrustedLocalRepositoryPreviewRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as ManifestShape & { worktreePath?: unknown };
  if (typeof item.command !== "string" || !Array.isArray(item.args)) return null;
  if (!item.args.every(arg => typeof arg === "string")) return null;
  const worktreePath = implicitWorktree ?? (typeof item.worktreePath === "string" ? item.worktreePath.trim() : "");
  if (!worktreePath) return null;
  return {
    projectIds: stringList(item.projectIds),
    repositories: stringList(item.repositories).map(repository => repository.toLowerCase()),
    allowBlankRepository: item.allowBlankRepository === true,
    isolatedWorktrees: item.isolatedWorktrees === true,
    worktreePath,
    remoteUrl: typeof item.remoteUrl === "string" && item.remoteUrl.trim() ? item.remoteUrl.trim() : undefined,
    command: item.command.trim(),
    args: item.args as string[],
    installCommand: typeof item.installCommand === "string" && item.installCommand.trim()
      ? item.installCommand.trim()
      : undefined,
    installArgs: Array.isArray(item.installArgs) && item.installArgs.every(arg => typeof arg === "string")
      ? item.installArgs as string[]
      : [],
    installTimeoutMs: typeof item.installTimeoutMs === "number" ? item.installTimeoutMs : undefined,
    healthPath: typeof item.healthPath === "string" ? item.healthPath : undefined,
    startupTimeoutMs: typeof item.startupTimeoutMs === "number" ? item.startupTimeoutMs : undefined,
    healthPollIntervalMs: typeof item.healthPollIntervalMs === "number" ? item.healthPollIntervalMs : undefined,
    env: recordEnv(item.env),
    source,
  };
}

function recordMatches(record: TrustedLocalRepositoryPreviewRecord, project: DevProject): boolean {
  if (record.projectIds?.includes(project.id)) return true;
  const repository = project.repository.trim().toLowerCase();
  if (repository && record.repositories?.some(candidate => candidate === repository)) return true;
  // Blank means "the local working tree" in legacy DevProject records. It is
  // never a wildcard: only an exact project id may opt a blank record in.
  return !repository
    && record.allowBlankRepository === true
    && Boolean(record.projectIds?.includes(project.id));
}

async function registryRecords(): Promise<TrustedLocalRepositoryPreviewRecord[]> {
  const raw = process.env[LOCAL_PREVIEW_REGISTRY_ENV]?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LocalRepositoryPreviewConfigError(
      "invalid-registry",
      `${LOCAL_PREVIEW_REGISTRY_ENV} is not valid JSON.`,
    );
  }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const records = values.map((value, index) => parseRecord(value, `${LOCAL_PREVIEW_REGISTRY_ENV}[${index}]`));
  if (records.some(record => !record)) {
    throw new LocalRepositoryPreviewConfigError(
      "invalid-registry",
      `${LOCAL_PREVIEW_REGISTRY_ENV} contains a record without a worktree, command or argument list.`,
    );
  }
  return records as TrustedLocalRepositoryPreviewRecord[];
}

async function currentWorktreeManifest(): Promise<TrustedLocalRepositoryPreviewRecord | null> {
  const worktree = await realpath(process.cwd());
  const manifestPath = resolve(worktree, LOCAL_PREVIEW_MANIFEST);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new LocalRepositoryPreviewConfigError("manifest-unreadable", "The local preview manifest could not be read.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LocalRepositoryPreviewConfigError("invalid-manifest", `${LOCAL_PREVIEW_MANIFEST} is not valid JSON.`);
  }
  const shape = value as ManifestShape;
  if (shape?.version !== 1) {
    throw new LocalRepositoryPreviewConfigError("invalid-manifest", `${LOCAL_PREVIEW_MANIFEST} must declare version 1.`);
  }
  const record = parseRecord(value, LOCAL_PREVIEW_MANIFEST, worktree);
  if (!record) {
    throw new LocalRepositoryPreviewConfigError(
      "invalid-manifest",
      `${LOCAL_PREVIEW_MANIFEST} must declare a command and argument list.`,
    );
  }
  if (record.remoteUrl) {
    // A manifest is read FROM the checkout it describes, so its destination is
    // always that same directory: cloning into it is either a no-op or a
    // destructive overwrite. Clone-from-remote is a server-registry lane only.
    throw new LocalRepositoryPreviewConfigError(
      "invalid-manifest",
      `${LOCAL_PREVIEW_MANIFEST} may not declare remoteUrl; configure a clone through ${LOCAL_PREVIEW_REGISTRY_ENV}.`,
    );
  }
  return record;
}

async function canonicalSafeRoots(additional: readonly string[] = []): Promise<string[]> {
  const configured = (process.env[LOCAL_PREVIEW_SAFE_ROOTS_ENV] ?? "")
    .split(delimiter)
    .map(value => value.trim())
    .filter(Boolean);
  const candidates = [process.cwd(), ...configured, ...additional];
  const roots: string[] = [];
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) {
      throw new LocalRepositoryPreviewConfigError(
        "invalid-safe-root",
        `${LOCAL_PREVIEW_SAFE_ROOTS_ENV} accepts absolute paths only.`,
      );
    }
    try {
      roots.push(await realpath(candidate));
    } catch {
      throw new LocalRepositoryPreviewConfigError("invalid-safe-root", "A configured local preview safe root does not exist.");
    }
  }
  return [...new Set(roots)];
}

function pathInside(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

async function validatedWorktree(worktreePath: string, safeRoots?: readonly string[]): Promise<string> {
  if (!isAbsolute(worktreePath)) {
    throw new LocalRepositoryPreviewConfigError("invalid-worktree", "The trusted preview worktree must be an absolute path.");
  }
  let worktree: string;
  try {
    worktree = await realpath(worktreePath);
    await access(worktree, fsConstants.R_OK | fsConstants.X_OK);
  } catch {
    throw new LocalRepositoryPreviewConfigError("invalid-worktree", "The trusted preview worktree does not exist or is not readable.");
  }
  const roots = await canonicalSafeRoots(safeRoots);
  if (!roots.some(root => pathInside(root, worktree))) {
    throw new LocalRepositoryPreviewConfigError(
      "unsafe-worktree",
      "The project's local worktree is outside the configured preview safe roots.",
    );
  }
  return worktree;
}

/**
 * A clone destination is validated like a worktree EXCEPT that it is allowed
 * not to exist yet — that is the whole point of a clone. Containment is then
 * decided on the physical parent directory, so a missing leaf can never be used
 * to place a checkout outside the configured safe roots.
 */
async function validatedCloneDestination(worktreePath: string, safeRoots?: readonly string[]): Promise<string> {
  if (!isAbsolute(worktreePath)) {
    throw new LocalRepositoryPreviewConfigError("invalid-worktree", "The trusted preview worktree must be an absolute path.");
  }
  const roots = await canonicalSafeRoots(safeRoots);
  let destination: string;
  try {
    destination = await realpath(worktreePath);
    await access(destination, fsConstants.R_OK | fsConstants.X_OK);
  } catch {
    const requested = resolve(worktreePath);
    const leaf = basename(requested);
    if (!leaf || leaf === "." || leaf === "..") {
      throw new LocalRepositoryPreviewConfigError("invalid-worktree", "The trusted clone destination does not name a directory.");
    }
    let parent: string;
    try {
      parent = await realpath(dirname(requested));
      await access(parent, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
    } catch {
      throw new LocalRepositoryPreviewConfigError(
        "invalid-worktree",
        "The trusted clone destination's parent directory does not exist or is not writable.",
      );
    }
    destination = resolve(parent, leaf);
  }
  if (!roots.some(root => pathInside(root, destination))) {
    throw new LocalRepositoryPreviewConfigError(
      "unsafe-worktree",
      "The project's local worktree is outside the configured preview safe roots.",
    );
  }
  return destination;
}

/**
 * Only a trusted record may name a remote, and only a plain credential-free
 * URL on an allowed transport. Anything option-shaped, credential-bearing or
 * helper-scheme'd is refused rather than handed to `git clone`.
 */
function validatedRemoteUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const remoteUrl = value.trim();
  if (!remoteUrl) return undefined;
  if (remoteUrl.length > MAX_REMOTE_URL || remoteUrl.includes("\0") || /[\s]/.test(remoteUrl)) {
    throw new LocalRepositoryPreviewConfigError("invalid-remote", "The trusted preview remote URL is invalid.");
  }
  // `git clone -- <url>` already separates arguments, but a leading dash is
  // never a legitimate remote and is refused before it reaches git at all.
  if (remoteUrl.startsWith("-")) {
    throw new LocalRepositoryPreviewConfigError("invalid-remote", "The trusted preview remote URL may not begin with a dash.");
  }
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    throw new LocalRepositoryPreviewConfigError(
      "invalid-remote",
      "The trusted preview remote must be a full URL (https://, ssh:// or file://); scp-style host:path is not accepted.",
    );
  }
  if (!ALLOWED_REMOTE_PROTOCOLS.has(parsed.protocol)) {
    throw new LocalRepositoryPreviewConfigError(
      "invalid-remote",
      `The trusted preview remote transport "${parsed.protocol.replace(":", "")}" is not allowed; use https, ssh or file.`,
    );
  }
  if (parsed.password) {
    // A credential in a record is a credential in every log line that echoes
    // the remote. Git's own helpers/askpass are the place for it.
    throw new LocalRepositoryPreviewConfigError(
      "invalid-remote",
      "The trusted preview remote URL must not embed credentials; configure a git credential helper instead.",
    );
  }
  if (parsed.username && parsed.protocol !== "ssh:") {
    // On https/file a bare userinfo name IS the secret (`https://<token>@host/…`).
    // On ssh it is the login account — `ssh://git@github.com/owner/repo.git` is
    // the canonical form and the only one that authenticates, so it is allowed
    // (the password half above is still refused on every transport).
    throw new LocalRepositoryPreviewConfigError(
      "invalid-remote",
      "The trusted preview remote URL must not embed credentials; configure a git credential helper instead.",
    );
  }
  return remoteUrl;
}

function validatedCommand(command: string): string {
  if (!command || command.includes("\0") || /[\r\n]/.test(command)) {
    throw new LocalRepositoryPreviewConfigError("untrusted-command", "The trusted preview command is invalid.");
  }
  if (command === "node") return process.execPath;
  if (isAbsolute(command)) {
    // Absolute executables are limited to the running Node binary. Arbitrary
    // /bin/sh-style entries turn a trusted record into a general shell door.
    if (resolve(command) !== resolve(process.execPath)) {
      throw new LocalRepositoryPreviewConfigError(
        "untrusted-command",
        "Only the running Node executable or an approved package runner may start a preview.",
      );
    }
    return process.execPath;
  }
  if (!ALLOWED_NAMED_COMMANDS.has(command) || basename(command) !== command) {
    throw new LocalRepositoryPreviewConfigError(
      "untrusted-command",
      "Only Node or an approved package runner may start a preview.",
    );
  }
  return command;
}

function validatedArgs(args: string[]): string[] {
  if (args.length > MAX_ARGS || args.some(arg => typeof arg !== "string" || arg.length > MAX_ARG_LENGTH || arg.includes("\0"))) {
    throw new LocalRepositoryPreviewConfigError("invalid-arguments", "The trusted preview argument list is invalid.");
  }
  return [...args];
}

function validatedHealthPath(value: string | undefined): string {
  const healthPath = value?.trim() || "/";
  if (!healthPath.startsWith("/") || healthPath.startsWith("//") || healthPath.includes("\0") || /[\r\n]/.test(healthPath)) {
    throw new LocalRepositoryPreviewConfigError("invalid-health-path", "The preview health path must be a local absolute URL path.");
  }
  return healthPath.slice(0, 1_000);
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeEnvironment(value: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, envValue] of Object.entries(value ?? {})) {
    const allowedName = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_)[A-Z0-9_]+$/.test(name)
      || ["NEXT_DIST_DIR", "BROWSER", "CI", "TURBO_TELEMETRY_DISABLED"].includes(name);
    if (!allowedName || envValue.length > MAX_ENV_VALUE || envValue.includes("\0")) {
      throw new LocalRepositoryPreviewConfigError(
        "unsafe-environment",
        `The trusted preview environment contains a disallowed variable (${name || "unnamed"}).`,
      );
    }
    result[name] = envValue;
  }
  return result;
}

/**
 * Resolve a stored DevProject to a trusted local launch record.
 *
 * The request never participates. A server environment registry wins; the
 * committed manifest in the current worktree is the zero-config local path.
 */
export async function resolveTrustedLocalRepositoryPreview(
  project: DevProject,
  options: { records?: readonly TrustedLocalRepositoryPreviewRecord[]; safeRoots?: readonly string[] } = {},
): Promise<ResolvedLocalRepositoryPreviewConfig> {
  const records = options.records ? [...options.records] : await registryRecords();
  const manifest = options.records ? null : await currentWorktreeManifest();
  const record = records.find(candidate => recordMatches(candidate, project))
    ?? (manifest && recordMatches(manifest, project) ? manifest : null);
  if (!record) {
    throw new LocalRepositoryPreviewConfigError(
      "preview-not-configured",
      `This project has no trusted local preview record. Add ${LOCAL_PREVIEW_MANIFEST} to its worktree or configure ${LOCAL_PREVIEW_REGISTRY_ENV}.`,
    );
  }
  // A dependency install rewrites a lockfile and a node_modules tree. That is
  // acceptable inside the project's OWN isolated worktree and never acceptable
  // in the shared checkout somebody is working in, so the pair is refused
  // rather than silently downgraded to "install into the live tree".
  if (record.installCommand && record.isolatedWorktrees !== true) {
    throw new LocalRepositoryPreviewConfigError(
      "install-requires-isolation",
      "A preview record may declare an install command only alongside isolatedWorktrees; installing into the shared checkout is refused.",
    );
  }
  const remoteUrl = validatedRemoteUrl(record.remoteUrl);
  return {
    // A declared remote makes the trusted path a clone destination, so a
    // missing directory is expected rather than a refusal. Without one the
    // path must already exist, exactly as before.
    worktreePath: remoteUrl
      ? await validatedCloneDestination(record.worktreePath, options.safeRoots)
      : await validatedWorktree(record.worktreePath, options.safeRoots),
    remoteUrl,
    command: validatedCommand(record.command),
    args: validatedArgs(record.args),
    // The install command passes through the SAME allowlist as the launch
    // command: a trusted record may not smuggle a shell in through it.
    installCommand: record.installCommand ? validatedCommand(record.installCommand) : undefined,
    installArgs: validatedArgs(record.installArgs ?? []),
    installTimeoutMs: boundedInteger(record.installTimeoutMs, 300_000, 1_000, 900_000),
    healthPath: validatedHealthPath(record.healthPath),
    startupTimeoutMs: boundedInteger(record.startupTimeoutMs, 45_000, 250, 120_000),
    healthPollIntervalMs: boundedInteger(record.healthPollIntervalMs, 250, 20, 5_000),
    env: safeEnvironment(record.env),
    isolatedWorktrees: record.isolatedWorktrees === true,
    source: record.source || "trusted server record",
  };
}
