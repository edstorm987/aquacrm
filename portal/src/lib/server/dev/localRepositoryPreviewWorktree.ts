import "server-only";

// The isolated branch/worktree half of the repository-backed Dev Workspace
// lifecycle (dev-editor-finish phase 17):
//
//   select an authorised project → CREATE/RESUME ITS ISOLATED BRANCH/WORKTREE
//   → prepare its supervised preview → …
//
// Each project previews inside its OWN git worktree, checked out on the same
// draft branch the repo-write path publishes from (`aqua-editor/<projectId>`),
// so uncommitted visual/source/AI edits accumulate on disk, survive preview
// stop/restart, and never touch the shared checkout. The trust model matches
// the supervisor's: every path here derives from the trusted record's
// validated `worktreePath` — the request never supplies a path, branch or
// git argument, and git is spawned directly (no shell).
//
// Deliberate boundaries:
// - RESUME NEVER DESTROYS. An existing worktree directory is reused only when
//   it is a valid worktree on the expected branch; anything else is a refusal,
//   never a delete or a checkout over it.
// - `node_modules` is linked from the trusted checkout when present so the
//   declared preview command resolves its runtime without a per-worktree
//   install. Untracked env files (`.env.local` etc.) are intentionally NOT
//   linked: the isolated worktree is the editor-writable surface, and secrets
//   must not be readable through it.
// - The worktrees root lives INSIDE the validated trusted path
//   (`<worktreePath>/.aqua-preview-worktrees/`), following the existing
//   `.next-aqua-preview-*` convention, so nothing is ever written outside the
//   configured preview safe roots.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const ISOLATED_WORKTREES_DIRECTORY = ".aqua-preview-worktrees";
export const ISOLATED_PREVIEW_BRANCH_PREFIX = "aqua-editor/";
/** Supervisor-owned, never committed. Mirrors the generated-tsconfig directory. */
const PREVIEW_STATE_DIRECTORY = ".aqua-preview-config";
const INSTALL_MARKER = "dependencies-installed.json";

/**
 * Files whose content decides whether a dependency tree is current. Fingerprint
 * over whichever exist, so an unchanged lockfile skips a multi-minute install
 * on every preview start and a changed one always reinstalls.
 */
const DEPENDENCY_FINGERPRINT_FILES = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "package.json",
] as const;

const GIT_TIMEOUT_MS = 120_000;
const MAX_GIT_OUTPUT = 64 * 1024;
const MAX_INSTALL_LOG_LINE = 2_000;

export class LocalRepositoryPreviewWorktreeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LocalRepositoryPreviewWorktreeError";
  }
}

export interface IsolatedPreviewWorktree {
  /** Directory the preview command must run in (the trusted record's prefix inside the isolated checkout). */
  previewPath: string;
  /** Root of the isolated checkout. */
  worktreePath: string;
  /** The project's draft branch, shared with the repo-write publish path. */
  branch: string;
  /** false = an existing worktree (and any uncommitted edits) was resumed. */
  created: boolean;
}

export interface EnsureIsolatedWorktreeInput {
  /** The already-validated trusted preview path (absolute, realpathed, inside safe roots). */
  configuredPath: string;
  projectId: string;
  log?: (text: string) => void;
}

function safeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGit(args: string[], cwd: string): Promise<GitResult> {
  return new Promise<GitResult>((resolveRun, rejectRun) => {
    const inherited = Object.fromEntries(
      ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SystemRoot", "WINDIR", "USERPROFILE"]
        .map(name => [name, process.env[name]] as const)
        .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string"),
    );
    const env: NodeJS.ProcessEnv = {
      ...inherited,
      NODE_ENV: process.env.NODE_ENV,
      // Never prompt, never touch credentials: these are local operations.
      GIT_TERMINAL_PROMPT: "0",
    };
    const child = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectRun(new LocalRepositoryPreviewWorktreeError("git-timeout", `git ${args[0]} did not finish inside ${GIT_TIMEOUT_MS}ms.`));
    }, GIT_TIMEOUT_MS);
    child.stdout?.on("data", chunk => { if (stdout.length < MAX_GIT_OUTPUT) stdout += String(chunk); });
    child.stderr?.on("data", chunk => { if (stderr.length < MAX_GIT_OUTPUT) stderr += String(chunk); });
    child.once("error", error => {
      clearTimeout(timer);
      rejectRun(new LocalRepositoryPreviewWorktreeError(
        "git-unavailable",
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "git is not installed on this machine, so an isolated preview worktree cannot be prepared."
          : `git could not be started: ${error.message}`,
      ));
    });
    child.once("exit", code => {
      clearTimeout(timer);
      resolveRun({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function requireGit(args: string[], cwd: string, code: string, refusal: string): Promise<GitResult> {
  const result = await runGit(args, cwd);
  if (result.code !== 0) {
    const detail = result.stderr || result.stdout;
    throw new LocalRepositoryPreviewWorktreeError(code, detail ? `${refusal} (${detail.slice(0, 400)})` : refusal);
  }
  return result;
}

function inside(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

/**
 * Create — or resume — the project's isolated preview worktree.
 *
 * Idempotent and retention-preserving: a second call for the same project
 * returns the same directory with any uncommitted edits intact, which is what
 * lets a stopped/restarted preview keep the exact change that was made.
 */
export async function ensureIsolatedPreviewWorktree(
  input: EnsureIsolatedWorktreeInput,
): Promise<IsolatedPreviewWorktree> {
  const token = safeToken(input.projectId.trim());
  if (!token) {
    throw new LocalRepositoryPreviewWorktreeError("invalid-project", "The project id cannot name an isolated worktree.");
  }
  const branch = `${ISOLATED_PREVIEW_BRANCH_PREFIX}${token}`;
  // The config layer already realpaths its worktree; re-resolving here keeps
  // the containment comparisons below physical even when a caller passes a
  // symlinked path (macOS `/var` → `/private/var` is the everyday case).
  let configuredPath: string;
  try {
    configuredPath = await realpath(input.configuredPath);
  } catch {
    throw new LocalRepositoryPreviewWorktreeError("invalid-worktree", "The trusted preview worktree does not exist.");
  }

  // The trusted path must live inside a git repository; the isolated checkout
  // reproduces the WHOLE repository, so a record pointing at a subdirectory
  // (e.g. a portal inside a monorepo) keeps that prefix inside the worktree.
  const topLevel = (await requireGit(
    ["rev-parse", "--show-toplevel"],
    configuredPath,
    "not-a-repository",
    "The trusted preview worktree is not inside a git repository.",
  )).stdout;
  const repositoryRoot = await realpath(topLevel);
  const prefix = relative(repositoryRoot, configuredPath);
  if (prefix.startsWith(`..${sep}`) || prefix === ".." || isAbsolute(prefix)) {
    throw new LocalRepositoryPreviewWorktreeError("not-a-repository", "The trusted preview worktree escapes its own repository root.");
  }

  const worktreesRoot = resolve(configuredPath, ISOLATED_WORKTREES_DIRECTORY);
  const worktreePath = resolve(worktreesRoot, token);
  if (!inside(configuredPath, worktreePath)) {
    throw new LocalRepositoryPreviewWorktreeError("invalid-project", "The derived worktree path escapes the trusted preview root.");
  }

  // Registrations whose directories were removed by hand would otherwise
  // block re-creating the same branch's worktree forever. Pruning only drops
  // stale bookkeeping; it never touches a live checkout.
  await runGit(["worktree", "prune"], configuredPath);

  let created = false;
  let exists = false;
  try {
    exists = (await stat(worktreePath)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (exists) {
    // Resume — but only a worktree that is exactly what this module created.
    const head = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
    if (head.code !== 0) {
      throw new LocalRepositoryPreviewWorktreeError(
        "worktree-conflict",
        "The project's isolated worktree directory exists but is not a usable git worktree. Move it aside; nothing is deleted automatically.",
      );
    }
    if (head.stdout !== branch) {
      throw new LocalRepositoryPreviewWorktreeError(
        "worktree-conflict",
        `The project's isolated worktree is on "${head.stdout}" instead of its draft branch. Move it aside; nothing is deleted automatically.`,
      );
    }
  } else {
    const branchExists = (await runGit(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], configuredPath)).code === 0;
    if (branchExists) {
      await requireGit(
        ["worktree", "add", worktreePath, branch],
        configuredPath,
        "worktree-add-failed",
        "The project's existing draft branch could not be checked out into an isolated worktree.",
      );
    } else {
      await requireGit(
        ["worktree", "add", "-b", branch, worktreePath],
        configuredPath,
        "worktree-add-failed",
        "The project's isolated draft worktree could not be created.",
      );
    }
    created = true;
  }

  // Containment re-check on the physical path — the configured root was
  // realpathed by the config layer, so a symlinked component inside the
  // derived path is the only way out, and it is refused.
  const physicalWorktree = await realpath(worktreePath);
  const physicalConfigured = await realpath(configuredPath);
  if (!inside(physicalConfigured, physicalWorktree)) {
    throw new LocalRepositoryPreviewWorktreeError("worktree-conflict", "The isolated worktree resolves outside the trusted preview root.");
  }

  const previewPath = prefix ? resolve(physicalWorktree, prefix) : physicalWorktree;
  try {
    await access(previewPath, fsConstants.R_OK | fsConstants.X_OK);
  } catch {
    throw new LocalRepositoryPreviewWorktreeError(
      "prefix-missing",
      "The trusted record's directory does not exist on the project's draft branch.",
    );
  }

  // Dependency readiness without a per-worktree install: link the trusted
  // checkout's node_modules beside the preview command's cwd. Declared
  // install automation can replace this later; env files are never linked.
  const sourceModules = resolve(configuredPath, "node_modules");
  const linkedModules = resolve(previewPath, "node_modules");
  let sourceHasModules = false;
  try {
    sourceHasModules = (await stat(sourceModules)).isDirectory();
  } catch {
    sourceHasModules = false;
  }
  if (sourceHasModules) {
    try {
      await symlink(sourceModules, linkedModules, process.platform === "win32" ? "junction" : "dir");
      input.log?.("Linked the trusted checkout's dependencies into the isolated worktree.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new LocalRepositoryPreviewWorktreeError(
          "dependencies-unavailable",
          "The trusted checkout's dependencies could not be linked into the isolated worktree.",
        );
      }
    }
  }

  input.log?.(
    created
      ? `Created the isolated preview worktree on ${branch}.`
      : `Resumed the isolated preview worktree on ${branch}; uncommitted edits are retained.`,
  );
  return { previewPath, worktreePath: physicalWorktree, branch, created };
}

// ─── Dependency readiness ───────────────────────────────────────────────────
//
// Phase 17's "dependency/start readiness and logs" step. The install command
// is declared in the same trusted record as the launch command and passes the
// same allowlist, so this adds no new authority — only a step that runs before
// the preview starts, in the project's OWN worktree, with its output in the
// operator-visible log.
//
// It is skipped when the dependency fingerprint already recorded for this
// worktree matches: a resumed preview must not pay a multi-minute install to
// start, while a changed lockfile must never be silently ignored.

export interface DependencyReadinessInput {
  worktreePath: string;
  command: string;
  args: string[];
  timeoutMs: number;
  log?: (text: string) => void;
}

export type DependencyReadinessOutcome =
  | { ok: true; ran: boolean; fingerprint: string }
  | { ok: false; reason: string };

async function dependencyFingerprint(worktreePath: string): Promise<string> {
  const digest = createHash("sha256");
  for (const name of DEPENDENCY_FINGERPRINT_FILES) {
    try {
      digest.update(name);
      digest.update(await readFile(resolve(worktreePath, name)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return digest.digest("hex");
}

async function recordedFingerprint(markerPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(markerPath, "utf8")) as { fingerprint?: unknown };
    return typeof parsed.fingerprint === "string" ? parsed.fingerprint : null;
  } catch {
    // A missing or unreadable marker means "not known to be installed", which
    // costs an install rather than risking a broken preview.
    return null;
  }
}

/**
 * Bring the isolated worktree's dependencies up to date, if the trusted record
 * declares how. Returns `ran: false` when the recorded fingerprint already
 * matches — the common resume path.
 */
export async function ensureDependenciesInstalled(
  input: DependencyReadinessInput,
): Promise<DependencyReadinessOutcome> {
  const fingerprint = await dependencyFingerprint(input.worktreePath);
  const stateDirectory = resolve(input.worktreePath, PREVIEW_STATE_DIRECTORY);
  const markerPath = resolve(stateDirectory, INSTALL_MARKER);
  if (await recordedFingerprint(markerPath) === fingerprint) {
    input.log?.("Dependencies are already current for this worktree.");
    return { ok: true, ran: false, fingerprint };
  }

  input.log?.("Installing the project's declared dependencies…");
  const result = await new Promise<{ code: number; output: string }>((resolveRun, rejectRun) => {
    const inherited = Object.fromEntries(
      ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SystemRoot", "WINDIR", "USERPROFILE"]
        .map(name => [name, process.env[name]] as const)
        .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string"),
    );
    const child = spawn(input.command, input.args, {
      cwd: input.worktreePath,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...inherited,
        NODE_ENV: "development",
        CI: "1",
        // Installs are dependency work, not an interactive session.
        npm_config_fund: "false",
        npm_config_audit: "false",
      },
    });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      resolveRun({ code: -1, output });
    }, input.timeoutMs);
    const absorb = (chunk: Buffer | string) => {
      if (output.length < MAX_GIT_OUTPUT) output += String(chunk);
    };
    child.stdout?.on("data", absorb);
    child.stderr?.on("data", absorb);
    child.once("error", error => {
      clearTimeout(timer);
      rejectRun(new LocalRepositoryPreviewWorktreeError(
        "install-unavailable",
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "The project's declared dependency-install runtime is not installed on this machine."
          : `The dependency install could not be started: ${error.message}`,
      ));
    });
    child.once("exit", code => {
      clearTimeout(timer);
      if (!settled) resolveRun({ code: code ?? 1, output });
    });
  });

  for (const line of result.output.split(/\r?\n/).slice(-40)) {
    if (line.trim()) input.log?.(line.trim().slice(0, MAX_INSTALL_LOG_LINE));
  }
  if (result.code === -1) {
    return { ok: false, reason: `The dependency install did not finish inside ${input.timeoutMs}ms.` };
  }
  if (result.code !== 0) {
    return { ok: false, reason: `The project's dependency install failed with exit code ${result.code}.` };
  }

  // Record readiness only AFTER a genuine success, and atomically, so a crash
  // mid-write can never make a broken tree look installed.
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const temporaryMarker = `${markerPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryMarker, `${JSON.stringify({ fingerprint, at: Date.now() })}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryMarker, markerPath);
  } catch {
    await unlink(temporaryMarker).catch(() => undefined);
    // A recorded marker is an optimisation, not a correctness requirement: the
    // install genuinely succeeded, so the preview may start.
    input.log?.("Dependencies installed, but the readiness marker could not be written.");
  }
  input.log?.("Dependencies are ready.");
  return { ok: true, ran: true, fingerprint };
}
