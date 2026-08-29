import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { mkdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  LocalRepositoryPreviewConfigError,
  resolveTrustedLocalRepositoryPreview,
  type ResolvedLocalRepositoryPreviewConfig,
} from "@/lib/server/dev/localRepositoryPreviewConfig";
import {
  ensureDependenciesInstalled,
  ensureIsolatedPreviewWorktree,
  LocalRepositoryPreviewWorktreeError,
  type DependencyReadinessOutcome,
  type IsolatedPreviewWorktree,
} from "@/lib/server/dev/localRepositoryPreviewWorktree";
import type {
  LocalRepositoryPreviewLogLine,
  LocalRepositoryPreviewSnapshot,
  LocalRepositoryPreviewState,
} from "@/lib/shared/localRepositoryPreview";
import type { DevProject } from "@/server/types";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_LOG_LINES = 400;
const MAX_LOG_BYTES = 128 * 1024;
const MAX_LOG_LINE_LENGTH = 4_000;
const STOP_GRACE_MS = 3_000;
const DEFAULT_MAX_RUNNING_PREVIEWS = 4;
const GENERATED_CONFIG_DIRECTORY = ".aqua-preview-config";

export interface LocalRepositoryPreviewScope {
  realmId: string;
  agencyId: string;
  projectId: string;
}

export interface LocalRepositoryPreviewSupervisorDeps {
  resolveConfig?: (
    project: DevProject,
    scope: LocalRepositoryPreviewScope,
  ) => Promise<ResolvedLocalRepositoryPreviewConfig>;
  ensureIsolatedWorktree?: (
    input: { configuredPath: string; projectId: string; log?: (text: string) => void },
  ) => Promise<IsolatedPreviewWorktree>;
  ensureDependencies?: (
    input: { worktreePath: string; command: string; args: string[]; timeoutMs: number; log?: (text: string) => void },
  ) => Promise<DependencyReadinessOutcome>;
  allocatePort?: (host: string) => Promise<number>;
  probeHealth?: (url: string) => Promise<boolean>;
  now?: () => number;
  isProduction?: () => boolean;
  maxRunningPreviews?: number;
}

interface PreviewEntry {
  key: string;
  scope: LocalRepositoryPreviewScope;
  generation: number;
  state: LocalRepositoryPreviewState;
  worktreePath?: string;
  config?: ResolvedLocalRepositoryPreviewConfig;
  port?: number;
  previewUrl?: string;
  child?: ChildProcess;
  startedAt?: number;
  healthyAt?: number;
  stoppedAt?: number;
  exitCode?: number;
  exitSignal?: string;
  error?: string;
  logs: LocalRepositoryPreviewLogLine[];
  logBytes: number;
  partial: { stdout: string; stderr: string };
  stopRequested: boolean;
  generatedTypeScriptConfigPath?: string;
  exitPromise?: Promise<void>;
  resolveExit?: () => void;
}

export class LocalRepositoryPreviewSupervisorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 409 | 500 = 409,
  ) {
    super(message);
    this.name = "LocalRepositoryPreviewSupervisorError";
  }
}

function scopeKey(scope: LocalRepositoryPreviewScope): string {
  return `${scope.realmId}|${scope.agencyId}|${scope.projectId}`;
}

function isRunning(state: LocalRepositoryPreviewState): boolean {
  return state === "installing" || state === "starting" || state === "healthy" || state === "stopping";
}

function cleanLogText(value: string): string {
  return value
    // ANSI CSI and OSC sequences are useful in a terminal, not in an API.
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\b(Bearer)\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|AUTHORIZATION|COOKIE)[A-Z0-9_]*)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\b(?:gh[pousr]_[a-zA-Z0-9_]{20,}|sk-[a-zA-Z0-9_-]{20,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g, "[REDACTED]")
    .slice(0, MAX_LOG_LINE_LENGTH);
}

function terminalFailureFromLogs(entry: PreviewEntry): LocalRepositoryPreviewState {
  const output = entry.logs.map(line => line.text).join("\n");
  if (/EADDRINUSE|address already in use|port\s+\d+\s+is already in use/i.test(output)) return "occupied-port";
  if (/MODULE_NOT_FOUND|Cannot find module|command not found|npm ERR![^\n]*(?:ENOENT|missing)|ERR_PNPM_[A-Z_]*(?:MISSING|NOT_FOUND)|could not determine executable/i.test(output)) {
    return "install-failed";
  }
  return "start-failed";
}

function failureSentence(state: LocalRepositoryPreviewState): string {
  switch (state) {
    case "occupied-port": return "The preview could not start because its allocated port was occupied.";
    case "install-failed": return "The preview could not start because the project's declared runtime or dependencies are unavailable.";
    case "health-timeout": return "The preview process started but did not become healthy before the trusted timeout.";
    case "crashed": return "The preview server exited after becoming healthy.";
    case "start-failed": return "The preview process exited before it became healthy.";
    default: return "The repository preview could not start.";
  }
}

function safeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function renderTemplate(value: string, scope: LocalRepositoryPreviewScope, port: number): string {
  return value
    .replaceAll("{host}", LOOPBACK_HOST)
    .replaceAll("{port}", String(port))
    .replaceAll("{projectId}", safeToken(scope.projectId))
    .replaceAll("{realm}", safeToken(scope.realmId));
}

function childEnvironment(
  config: ResolvedLocalRepositoryPreviewConfig,
  scope: LocalRepositoryPreviewScope,
  port: number,
): NodeJS.ProcessEnv {
  const inheritedNames = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TEMP", "SystemRoot", "WINDIR"];
  const inherited = Object.fromEntries(inheritedNames
    .map(name => [name, process.env[name]] as const)
    .filter((entry): entry is readonly [string, string] => typeof entry[1] === "string"));
  const declared = Object.fromEntries(Object.entries(config.env)
    .map(([name, value]) => [name, renderTemplate(value, scope, port)]));
  return {
    ...inherited,
    NODE_ENV: "development",
    PORT: String(port),
    HOST: LOOPBACK_HOST,
    AQUA_PREVIEW_PORT: String(port),
    AQUA_PREVIEW_HOST: LOOPBACK_HOST,
    ...declared,
  };
}

interface PreparedPreviewTypeScriptConfig {
  environmentPath: string;
  absolutePath: string;
}

async function preparePreviewTypeScriptConfig(
  config: ResolvedLocalRepositoryPreviewConfig,
  scope: LocalRepositoryPreviewScope,
  port: number,
): Promise<PreparedPreviewTypeScriptConfig | undefined> {
  // An explicit project choice wins. This generated shim exists only for apps
  // (such as AquaCRM) whose next.config opts into this preview convention.
  if (config.env.NEXT_TYPESCRIPT_CONFIG_PATH?.trim()) return undefined;

  const distDir = config.env.NEXT_DIST_DIR
    ? renderTemplate(config.env.NEXT_DIST_DIR, scope, port).trim()
    : "";
  if (!distDir || isAbsolute(distDir)) return undefined;

  const buildDirectory = resolve(config.worktreePath, distDir);
  const relativeBuildDirectory = relative(config.worktreePath, buildDirectory);
  if (
    relativeBuildDirectory === ".."
    || relativeBuildDirectory.startsWith(`..${sep}`)
    || isAbsolute(relativeBuildDirectory)
  ) return undefined;

  const baseConfigPath = resolve(config.worktreePath, "tsconfig.json");
  try {
    if (!(await stat(baseConfigPath)).isFile()) return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  // Next/Turbopack clears NEXT_DIST_DIR during boot. A tsconfig selected from
  // inside that disposable directory therefore exists for initial startup but
  // vanishes before an on-demand TypeScript route compilation. Keep the shim in
  // a separate supervisor-owned directory for the complete child lifecycle.
  const configDirectory = resolve(config.worktreePath, GENERATED_CONFIG_DIRECTORY);
  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  const [realWorktreePath, realConfigDirectory, realBaseConfigPath] = await Promise.all([
    realpath(config.worktreePath),
    realpath(configDirectory),
    realpath(baseConfigPath),
  ]);
  const physicalConfigDirectory = relative(realWorktreePath, realConfigDirectory);
  if (
    physicalConfigDirectory === ".."
    || physicalConfigDirectory.startsWith(`..${sep}`)
    || isAbsolute(physicalConfigDirectory)
  ) throw new Error("The generated preview configuration directory resolves outside the trusted worktree.");

  const generatedConfig = resolve(realConfigDirectory, `tsconfig.${randomUUID()}.json`);
  const baseConfig = relative(realConfigDirectory, realBaseConfigPath)
    .split(sep)
    .join("/");
  const contents = `${JSON.stringify({ extends: baseConfig.startsWith(".") ? baseConfig : `./${baseConfig}` }, null, 2)}\n`;
  const temporaryConfig = resolve(
    realConfigDirectory,
    `.tsconfig.aqua-preview.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    // Write a private, exclusively-created random file beside the destination,
    // then atomically rename it. The physical parent was containment-checked
    // above and neither predictable destination entries nor partial JSON are
    // exposed to the child.
    await writeFile(temporaryConfig, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryConfig, generatedConfig);
  } catch (error) {
    await unlink(temporaryConfig).catch(() => undefined);
    throw error;
  }
  return {
    environmentPath: relative(realWorktreePath, generatedConfig).split(sep).join("/"),
    absolutePath: generatedConfig,
  };
}

async function allocateLoopbackPort(host: string): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("No loopback port was allocated.")));
        return;
      }
      const port = address.port;
      server.close(error => error ? reject(error) : resolvePort(port));
    });
  });
}

async function probeHttpHealth(url: string): Promise<boolean> {
  return await new Promise<boolean>(resolveHealth => {
    const req = httpRequest(url, { method: "GET", timeout: 750 }, response => {
      response.resume();
      resolveHealth(Boolean(response.statusCode && response.statusCode < 500));
    });
    req.once("timeout", () => req.destroy(new Error("health timeout")));
    req.once("error", () => resolveHealth(false));
    req.end();
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
}

export function localRepositoryPreviewProductionRefusal(): string | null {
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  return production
    ? "Repository preview servers are local-development tools and are refused in production."
    : null;
}

export class LocalRepositoryPreviewSupervisor {
  private readonly entries = new Map<string, PreviewEntry>();
  private readonly worktreeOwners = new Map<string, string>();
  private readonly scopeOperations = new Map<string, Promise<void>>();
  private readonly startInflight = new Map<string, Promise<LocalRepositoryPreviewSnapshot>>();
  private readonly restartInflight = new Map<string, Promise<LocalRepositoryPreviewSnapshot>>();
  private generation = 0;
  private readonly deps: Required<Omit<LocalRepositoryPreviewSupervisorDeps, "maxRunningPreviews">>;
  private readonly maxRunningPreviews: number;

  constructor(deps: LocalRepositoryPreviewSupervisorDeps = {}) {
    this.deps = {
      resolveConfig: deps.resolveConfig ?? ((project) => resolveTrustedLocalRepositoryPreview(project)),
      ensureIsolatedWorktree: deps.ensureIsolatedWorktree ?? ensureIsolatedPreviewWorktree,
      ensureDependencies: deps.ensureDependencies ?? ensureDependenciesInstalled,
      allocatePort: deps.allocatePort ?? allocateLoopbackPort,
      probeHealth: deps.probeHealth ?? probeHttpHealth,
      now: deps.now ?? Date.now,
      isProduction: deps.isProduction ?? (() => localRepositoryPreviewProductionRefusal() !== null),
    };
    this.maxRunningPreviews = Math.max(1, Math.min(16, Math.round(deps.maxRunningPreviews ?? DEFAULT_MAX_RUNNING_PREVIEWS)));
  }

  private blank(scope: LocalRepositoryPreviewScope, state: LocalRepositoryPreviewState = "idle"): PreviewEntry {
    return {
      key: scopeKey(scope),
      scope,
      generation: ++this.generation,
      state,
      logs: [],
      logBytes: 0,
      partial: { stdout: "", stderr: "" },
      stopRequested: false,
    };
  }

  private ownerToken(entry: PreviewEntry): string {
    return `${entry.key}#${entry.generation}`;
  }

  /** One lifecycle mutation at a time for a realm/agency/project scope. */
  private async serializeScope<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = this.scopeOperations.get(key) ?? Promise.resolve();
    let releaseTurn: () => void = () => {};
    const turn = new Promise<void>(resolveTurn => { releaseTurn = resolveTurn; });
    const tail = previous.catch(() => undefined).then(() => turn);
    this.scopeOperations.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await run();
    } finally {
      releaseTurn();
      if (this.scopeOperations.get(key) === tail) this.scopeOperations.delete(key);
    }
  }

  private append(entry: PreviewEntry, stream: LocalRepositoryPreviewLogLine["stream"], raw: string): void {
    const text = cleanLogText(raw);
    if (!text) return;
    const line: LocalRepositoryPreviewLogLine = { at: this.deps.now(), stream, text };
    entry.logs.push(line);
    entry.logBytes += Buffer.byteLength(text, "utf8");
    while (entry.logs.length > MAX_LOG_LINES || entry.logBytes > MAX_LOG_BYTES) {
      const removed = entry.logs.shift();
      if (!removed) break;
      entry.logBytes -= Buffer.byteLength(removed.text, "utf8");
    }
  }

  private consume(entry: PreviewEntry, stream: "stdout" | "stderr", chunk: Buffer | string): void {
    const combined = entry.partial[stream] + String(chunk);
    const lines = combined.split(/\r?\n/);
    entry.partial[stream] = lines.pop() ?? "";
    for (const line of lines) this.append(entry, stream, line);
    if (entry.partial[stream].length > MAX_LOG_LINE_LENGTH) {
      this.append(entry, stream, entry.partial[stream]);
      entry.partial[stream] = "";
    }
  }

  private flushPartial(entry: PreviewEntry): void {
    for (const stream of ["stdout", "stderr"] as const) {
      if (entry.partial[stream]) this.append(entry, stream, entry.partial[stream]);
      entry.partial[stream] = "";
    }
  }

  private snapshot(entry: PreviewEntry, includeLogs = false, limit = 100): LocalRepositoryPreviewSnapshot {
    const runningUrl = entry.state === "starting" || entry.state === "healthy" ? entry.previewUrl : undefined;
    return {
      projectId: entry.scope.projectId,
      state: entry.state,
      previewUrl: runningUrl,
      startedAt: entry.startedAt,
      healthyAt: entry.healthyAt,
      stoppedAt: entry.stoppedAt,
      exitCode: entry.exitCode,
      exitSignal: entry.exitSignal,
      error: entry.error,
      logs: includeLogs ? entry.logs.slice(-Math.max(1, Math.min(400, Math.round(limit)))) : undefined,
    };
  }

  status(scope: LocalRepositoryPreviewScope): LocalRepositoryPreviewSnapshot {
    return this.snapshot(this.entries.get(scopeKey(scope)) ?? this.blank(scope));
  }

  logs(scope: LocalRepositoryPreviewScope, limit = 100): LocalRepositoryPreviewSnapshot {
    return this.snapshot(this.entries.get(scopeKey(scope)) ?? this.blank(scope), true, limit);
  }

  async start(scope: LocalRepositoryPreviewScope, project: DevProject): Promise<LocalRepositoryPreviewSnapshot> {
    const key = scopeKey(scope);
    const existing = this.startInflight.get(key);
    if (existing) return await existing;
    const operation = this.serializeScope(key, () => this.startUnlocked(scope, project));
    this.startInflight.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.startInflight.get(key) === operation) this.startInflight.delete(key);
    }
  }

  private async startUnlocked(scope: LocalRepositoryPreviewScope, project: DevProject): Promise<LocalRepositoryPreviewSnapshot> {
    const key = scopeKey(scope);
    const existing = this.entries.get(key);
    if (existing && isRunning(existing.state)) return this.snapshot(existing);

    const entry = this.blank(scope);
    this.entries.set(key, entry);
    if (this.deps.isProduction()) {
      entry.state = "production-refused";
      entry.error = "Repository preview servers are local-development tools and are refused in production.";
      this.append(entry, "system", entry.error);
      return this.snapshot(entry);
    }

    let config: ResolvedLocalRepositoryPreviewConfig;
    try {
      config = await this.deps.resolveConfig(project, scope);
    } catch (error) {
      entry.state = "configuration-error";
      entry.error = error instanceof LocalRepositoryPreviewConfigError
        ? error.message
        : "The project's trusted local preview record could not be resolved.";
      this.append(entry, "system", entry.error);
      return this.snapshot(entry);
    }
    entry.config = config;

    // Phase-17 lifecycle head: an isolated-worktrees record previews each
    // project inside its own draft-branch worktree (created here, resumed
    // with edits intact). Derived entirely from the trusted path — the
    // request still supplies nothing.
    if (config.isolatedWorktrees) {
      try {
        const isolated = await this.deps.ensureIsolatedWorktree({
          configuredPath: config.worktreePath,
          projectId: scope.projectId,
          log: text => this.append(entry, "system", text),
        });
        config = { ...config, worktreePath: isolated.previewPath };
        entry.config = config;
      } catch (error) {
        entry.state = "configuration-error";
        entry.error = error instanceof LocalRepositoryPreviewWorktreeError
          ? error.message
          : "The project's isolated preview worktree could not be prepared.";
        this.append(entry, "system", entry.error);
        return this.snapshot(entry);
      }
    }
    entry.worktreePath = config.worktreePath;

    // Process state/control remains realm-scoped, but a physical worktree is a
    // host resource. Live and Sandbox must never compile or write the same
    // worktree concurrently.
    const worktreeKey = config.worktreePath;
    const ownerToken = this.ownerToken(entry);
    const owner = this.worktreeOwners.get(worktreeKey);
    if (owner && owner !== ownerToken) {
      throw new LocalRepositoryPreviewSupervisorError(
        "worktree-in-use",
        "That worktree already has a preview server in this environment.",
      );
    }
    this.worktreeOwners.set(worktreeKey, ownerToken);

    const runningCount = [...this.entries.values()].filter(candidate => isRunning(candidate.state)).length;
    if (runningCount >= this.maxRunningPreviews) {
      if (this.worktreeOwners.get(worktreeKey) === ownerToken) this.worktreeOwners.delete(worktreeKey);
      throw new LocalRepositoryPreviewSupervisorError(
        "preview-capacity",
        "The local preview process limit has been reached. Stop another preview before starting this one.",
      );
    }
    // Reserve capacity before the first await so concurrent different-scope
    // starts cannot both pass the global cap.
    entry.state = "starting";

    // Dependency readiness (phase 17). Declared in the same trusted record as
    // the launch command, run in the project's own worktree, logged where the
    // operator can read it. A skipped-because-current install is the normal
    // resume path and costs nothing.
    if (config.installCommand) {
      entry.state = "installing";
      try {
        const readiness = await this.deps.ensureDependencies({
          worktreePath: config.worktreePath,
          command: config.installCommand,
          args: config.installArgs,
          timeoutMs: config.installTimeoutMs,
          log: text => this.append(entry, "system", text),
        });
        if (!readiness.ok) {
          if (this.worktreeOwners.get(worktreeKey) === ownerToken) this.worktreeOwners.delete(worktreeKey);
          entry.state = "install-failed";
          entry.error = readiness.reason;
          this.append(entry, "system", entry.error);
          return this.snapshot(entry);
        }
      } catch (error) {
        if (this.worktreeOwners.get(worktreeKey) === ownerToken) this.worktreeOwners.delete(worktreeKey);
        entry.state = "install-failed";
        entry.error = error instanceof LocalRepositoryPreviewWorktreeError
          ? error.message
          : "The project's dependencies could not be prepared.";
        this.append(entry, "system", entry.error);
        return this.snapshot(entry);
      }
      // NB: `stop()` serialises on the same scope key as `start()`, so a stop
      // requested during a long install runs after this completes rather than
      // racing the spawn below.
      entry.state = "starting";
    }

    try {
      entry.port = await this.deps.allocatePort(LOOPBACK_HOST);
    } catch {
      if (this.worktreeOwners.get(worktreeKey) === ownerToken) this.worktreeOwners.delete(worktreeKey);
      entry.state = "start-failed";
      entry.error = "A loopback preview port could not be allocated.";
      this.append(entry, "system", entry.error);
      return this.snapshot(entry);
    }

    const port = entry.port;
    entry.previewUrl = `http://${LOOPBACK_HOST}:${port}`;
    entry.startedAt = this.deps.now();
    entry.exitPromise = new Promise(resolveExit => { entry.resolveExit = resolveExit; });
    this.append(entry, "system", `Starting the project's trusted local preview on loopback port ${port}.`);

    try {
      const args = config.args.map(value => renderTemplate(value, scope, port));
      const env = childEnvironment(config, scope, port);
      const previewTypeScriptConfig = await preparePreviewTypeScriptConfig(config, scope, port);
      if (previewTypeScriptConfig) {
        env.NEXT_TYPESCRIPT_CONFIG_PATH = previewTypeScriptConfig.environmentPath;
        entry.generatedTypeScriptConfigPath = previewTypeScriptConfig.absolutePath;
      }
      const child = spawn(config.command, args, {
        cwd: config.worktreePath,
        env,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      entry.child = child;
      child.stdout?.on("data", chunk => this.consume(entry, "stdout", chunk));
      child.stderr?.on("data", chunk => this.consume(entry, "stderr", chunk));
      child.once("error", error => this.handleSpawnError(entry, error));
      child.once("exit", (code, signal) => this.handleExit(entry, code, signal));
    } catch (error) {
      entry.state = "start-failed";
      entry.error = error instanceof Error ? `The preview process could not be started: ${error.message}` : "The preview process could not be started.";
      this.append(entry, "system", entry.error);
      this.release(entry);
      return this.snapshot(entry);
    }

    void this.monitorHealth(entry);
    return this.snapshot(entry);
  }

  private handleSpawnError(entry: PreviewEntry, error: Error): void {
    if (entry.state !== "starting") return;
    const code = (error as NodeJS.ErrnoException).code;
    entry.state = code === "ENOENT" ? "install-failed" : "start-failed";
    entry.error = code === "ENOENT"
      ? "The project's declared preview runtime is not installed."
      : `The preview process could not be started: ${error.message}`;
    this.append(entry, "system", entry.error);
    this.release(entry);
  }

  private handleExit(entry: PreviewEntry, code: number | null, signal: NodeJS.Signals | null): void {
    this.flushPartial(entry);
    entry.exitCode = code ?? undefined;
    entry.exitSignal = signal ?? undefined;
    entry.stoppedAt = this.deps.now();

    if (entry.state === "stopping" || entry.stopRequested) {
      entry.state = "stopped";
      entry.error = undefined;
      this.append(entry, "system", "Preview server stopped.");
    } else if (entry.state === "healthy") {
      entry.state = "crashed";
      entry.error = failureSentence("crashed");
      this.append(entry, "system", entry.error);
    } else if (entry.state === "starting") {
      entry.state = terminalFailureFromLogs(entry);
      entry.error = failureSentence(entry.state);
      this.append(entry, "system", entry.error);
    }
    // health-timeout/configuration-error/production-refused are already the
    // authoritative terminal reason and must not be replaced by the SIGTERM
    // used to clean the child up.
    this.release(entry);
  }

  private release(entry: PreviewEntry): void {
    if (entry.worktreePath) {
      const worktreeKey = entry.worktreePath;
      if (this.worktreeOwners.get(worktreeKey) === this.ownerToken(entry)) this.worktreeOwners.delete(worktreeKey);
    }
    const generatedTypeScriptConfigPath = entry.generatedTypeScriptConfigPath;
    entry.generatedTypeScriptConfigPath = undefined;
    if (generatedTypeScriptConfigPath) {
      try {
        unlinkSync(generatedTypeScriptConfigPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.append(entry, "system", "The temporary preview TypeScript configuration could not be removed.");
        }
      }
    }
    entry.child = undefined;
    entry.resolveExit?.();
    entry.resolveExit = undefined;
  }

  private async monitorHealth(entry: PreviewEntry): Promise<void> {
    const config = entry.config;
    const previewUrl = entry.previewUrl;
    if (!config || !previewUrl) return;
    const deadline = entry.startedAt! + config.startupTimeoutMs;
    const generation = entry.generation;
    while (this.entries.get(entry.key)?.generation === generation && entry.state === "starting") {
      if (await this.deps.probeHealth(`${previewUrl}${config.healthPath}`)) {
        if (entry.state !== "starting") return;
        entry.state = "healthy";
        entry.healthyAt = this.deps.now();
        entry.error = undefined;
        this.append(entry, "system", "Preview server is healthy.");
        return;
      }
      if (this.deps.now() >= deadline) {
        entry.state = "health-timeout";
        entry.error = failureSentence("health-timeout");
        entry.stoppedAt = this.deps.now();
        this.append(entry, "system", entry.error);
        this.terminate(entry, "SIGTERM");
        return;
      }
      await delay(config.healthPollIntervalMs);
    }
  }

  private terminate(entry: PreviewEntry, signal: NodeJS.Signals): void {
    const child = entry.child;
    if (!child?.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      try { child.kill(signal); } catch { /* already gone */ }
    }
  }

  async stop(scope: LocalRepositoryPreviewScope): Promise<LocalRepositoryPreviewSnapshot> {
    const key = scopeKey(scope);
    return await this.serializeScope(key, () => this.stopUnlocked(scope));
  }

  private async stopUnlocked(scope: LocalRepositoryPreviewScope): Promise<LocalRepositoryPreviewSnapshot> {
    const entry = this.entries.get(scopeKey(scope));
    if (!entry) return this.snapshot(this.blank(scope, "stopped"));
    if (!isRunning(entry.state) || !entry.child) return this.snapshot(entry);

    entry.stopRequested = true;
    entry.state = "stopping";
    this.append(entry, "system", "Stopping preview server.");
    this.terminate(entry, "SIGTERM");
    await Promise.race([entry.exitPromise ?? Promise.resolve(), delay(STOP_GRACE_MS)]);
    if (entry.child) {
      this.terminate(entry, "SIGKILL");
      await Promise.race([entry.exitPromise ?? Promise.resolve(), delay(1_000)]);
    }
    if (entry.child) {
      entry.state = "stopped";
      entry.stoppedAt = this.deps.now();
      this.release(entry);
    }
    return this.snapshot(entry);
  }

  async restart(scope: LocalRepositoryPreviewScope, project: DevProject): Promise<LocalRepositoryPreviewSnapshot> {
    const key = scopeKey(scope);
    const existing = this.restartInflight.get(key);
    if (existing) return await existing;
    const operation = this.serializeScope(key, async () => {
      await this.stopUnlocked(scope);
      return await this.startUnlocked(scope, project);
    });
    this.restartInflight.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.restartInflight.get(key) === operation) this.restartInflight.delete(key);
    }
  }

  shutdownAllSync(): void {
    for (const entry of this.entries.values()) {
      if (!entry.child) continue;
      entry.stopRequested = true;
      this.terminate(entry, "SIGTERM");
      this.release(entry);
    }
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.entries.values()].map(entry => this.stop(entry.scope)));
    this.entries.clear();
    this.worktreeOwners.clear();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __aquaLocalRepositoryPreviewSupervisor: LocalRepositoryPreviewSupervisor | undefined;
  // eslint-disable-next-line no-var
  var __aquaLocalRepositoryPreviewCleanupInstalled: boolean | undefined;
}

export function getLocalRepositoryPreviewSupervisor(): LocalRepositoryPreviewSupervisor {
  const supervisor = globalThis.__aquaLocalRepositoryPreviewSupervisor
    ?? new LocalRepositoryPreviewSupervisor();
  globalThis.__aquaLocalRepositoryPreviewSupervisor = supervisor;
  if (!globalThis.__aquaLocalRepositoryPreviewCleanupInstalled) {
    globalThis.__aquaLocalRepositoryPreviewCleanupInstalled = true;
    process.once("exit", () => supervisor.shutdownAllSync());
  }
  return supervisor;
}
