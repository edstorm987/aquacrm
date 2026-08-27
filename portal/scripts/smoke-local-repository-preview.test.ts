import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

type SupervisorModule = typeof import("../src/lib/server/dev/localRepositoryPreviewSupervisor");
type ConfigModule = typeof import("../src/lib/server/dev/localRepositoryPreviewConfig");
type DevProject = import("../src/server/types").DevProject;
type PreviewState = import("../src/lib/shared/localRepositoryPreview").LocalRepositoryPreviewState;

let supervisorModule: SupervisorModule;
let configModule: ConfigModule;
let tempRoot = "";

const FIXTURE_SOURCE = String.raw`
const http = require("node:http");
const port = Number(process.argv[2]);
const mode = process.argv[3] || "healthy";

if (process.env.AQUA_PREVIEW_START_RECORD) {
  require("node:fs").appendFileSync(process.env.AQUA_PREVIEW_START_RECORD, String(process.pid) + "\n");
}

if (mode === "occupied") {
  console.error("Error: listen EADDRINUSE: address already in use 127.0.0.1:" + port);
  process.exit(1);
}
if (mode === "install") {
  console.error("Error: Cannot find module 'fixture-preview-dependency'");
  process.exit(1);
}
if (mode === "start-fail") process.exit(2);
if (mode === "hang") {
  console.log("fixture waiting without a listener");
  setInterval(() => {}, 1000);
  return;
}
if (mode === "secrets") {
  console.log("API_TOKEN=super-secret-token Bearer bearer-secret-value");
  console.log("https://user:password@example.test/private");
  for (let index = 0; index < 520; index += 1) console.log("bounded-line-" + index);
  console.log("API_TOKEN=super-secret-token Bearer bearer-secret-value");
  console.log("https://user:password@example.test/private");
  console.log("PARENT_VALUE=" + (process.env.AQUA_PRIVATE_VALUE || "absent"));
}

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("fixture:" + mode);
});
server.listen(port, "127.0.0.1", () => {
  console.log("fixture-started:" + mode);
  if (mode === "crash") setTimeout(() => process.exit(7), 500);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;

before(async () => {
  supervisorModule = await import("../src/lib/server/dev/localRepositoryPreviewSupervisor");
  configModule = await import("../src/lib/server/dev/localRepositoryPreviewConfig");
  tempRoot = await mkdtemp(path.join(tmpdir(), "aqua-local-preview-"));
});

after(async () => {
  // Fixture worktrees live under the operating system temp directory and are
  // intentionally left for its normal cleanup policy; no recursive delete is
  // needed for this smoke test.
});

function project(id: string, repository = `fixture/${id}`): DevProject {
  return {
    id,
    agencyId: "agency_preview",
    name: id,
    kind: "software",
    repository,
    ref: "main",
    createdBy: "user_preview",
    updatedBy: "user_preview",
    createdAt: 1,
    updatedAt: 1,
  };
}

function scope(projectId: string, realmId = "live", agencyId = "agency_preview") {
  return { projectId, realmId, agencyId };
}

async function fixtureWorktree(name: string): Promise<{ directory: string; serverFile: string }> {
  const directory = path.join(tempRoot, name);
  await mkdir(directory, { recursive: true });
  const serverFile = path.join(directory, "fixture-server.cjs");
  await writeFile(serverFile, FIXTURE_SOURCE, "utf8");
  await chmod(serverFile, 0o700);
  return { directory, serverFile };
}

async function nextFixtureWorktree(name: string): Promise<{ directory: string; rootTypeScriptConfig: string }> {
  const directory = path.join(tempRoot, name);
  const appDirectory = path.join(directory, "app");
  const probeDirectory = path.join(appDirectory, "probe");
  const publicDirectory = path.join(directory, "public");
  await Promise.all([
    mkdir(probeDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ]);
  await symlink(path.join(process.cwd(), "node_modules"), path.join(directory, "node_modules"), "dir");

  const rootTypeScriptConfig = path.join(directory, "tsconfig.json");
  await Promise.all([
    writeFile(path.join(directory, "package.json"), '{"name":"aqua-preview-next-fixture","private":true}\n', "utf8"),
    writeFile(
      path.join(directory, "next.config.mjs"),
      `import path from "node:path";
export default {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.NEXT_TYPESCRIPT_CONFIG_PATH || "tsconfig.json" },
  turbopack: { root: path.parse(process.cwd()).root },
};
`,
      "utf8",
    ),
    writeFile(
      rootTypeScriptConfig,
      '{"compilerOptions":{"strict":true,"jsx":"preserve"},"include":["app/**/*.ts"],"exclude":["node_modules"]}\n',
      "utf8",
    ),
    writeFile(
      path.join(probeDirectory, "route.ts"),
      'export function GET() { return new Response("typescript-route-ok"); }\n',
      "utf8",
    ),
    writeFile(path.join(publicDirectory, "health.txt"), "ready\n", "utf8"),
  ]);
  return { directory, rootTypeScriptConfig };
}

function resolvedConfig(directory: string, serverFile: string, mode = "healthy", timeout = 1_500) {
  return {
    worktreePath: directory,
    command: process.execPath,
    args: [serverFile, "{port}", mode],
    healthPath: "/health",
    startupTimeoutMs: timeout,
    healthPollIntervalMs: 25,
    env: {},
    source: "test fixture",
  };
}

async function waitForState(
  supervisor: InstanceType<SupervisorModule["LocalRepositoryPreviewSupervisor"]>,
  targetScope: ReturnType<typeof scope>,
  expected: PreviewState,
  timeoutMs = 5_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = supervisor.status(targetScope);
    if (snapshot.state === expected) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const current = supervisor.logs(targetScope, 100);
  assert.fail(
    `Timed out waiting for ${expected}; current state=${current.state}\n${current.logs?.map(line => `${line.stream}: ${line.text}`).join("\n") ?? ""}`,
  );
}

describe("supervised local repository preview", () => {
  it("runs start → health → bounded logs → stop and restart on loopback", async () => {
    const fixture = await fixtureWorktree("lifecycle");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => resolvedConfig(fixture.directory, fixture.serverFile),
      isProduction: () => false,
    });
    const target = scope("project_lifecycle");
    try {
      const starting = await supervisor.start(target, project(target.projectId));
      assert.equal(starting.state, "starting", JSON.stringify(starting));
      assert.match(starting.previewUrl ?? "", /^http:\/\/127\.0\.0\.1:\d+$/);

      const healthy = await waitForState(supervisor, target, "healthy");
      assert.equal(await fetch(healthy.previewUrl!).then(response => response.text()), "fixture:healthy");
      assert.match(supervisor.logs(target, 40).logs?.map(line => line.text).join("\n") ?? "", /fixture-started:healthy/);

      assert.equal((await supervisor.stop(target)).state, "stopped");
      const restarted = await supervisor.restart(target, project(target.projectId));
      assert.equal(restarted.state, "starting");
      assert.equal((await waitForState(supervisor, target, "healthy")).state, "healthy");
    } finally {
      await supervisor.dispose();
    }
  });

  it("keeps the repository tsconfig immutable and owns one generated shim for each child lifecycle", async () => {
    const fixture = await fixtureWorktree("typescript-config-isolation");
    const rootTypeScriptConfig = path.join(fixture.directory, "tsconfig.json");
    const rootContents = '{"compilerOptions":{"strict":true}}\n';
    await writeFile(rootTypeScriptConfig, rootContents, "utf8");

    const generatedDirectory = path.join(fixture.directory, ".aqua-preview-config");

    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => ({
        ...resolvedConfig(fixture.directory, fixture.serverFile),
        env: { NEXT_DIST_DIR: ".preview-build" },
      }),
      isProduction: () => false,
    });
    const target = scope("project_typescript_config");
    try {
      await supervisor.start(target, project(target.projectId));
      await waitForState(supervisor, target, "healthy");
      assert.equal(await readFile(rootTypeScriptConfig, "utf8"), rootContents);
      const [firstGeneratedConfig] = (await readdir(generatedDirectory)).filter(name => name.endsWith(".json"));
      assert.ok(firstGeneratedConfig, "the running child keeps one generated config outside NEXT_DIST_DIR");
      assert.deepEqual(
        JSON.parse(await readFile(path.join(generatedDirectory, firstGeneratedConfig), "utf8")),
        { extends: "../tsconfig.json" },
      );

      await supervisor.restart(target, project(target.projectId));
      await waitForState(supervisor, target, "healthy");
      assert.equal(await readFile(rootTypeScriptConfig, "utf8"), rootContents);
      const replacementConfigs = (await readdir(generatedDirectory)).filter(name => name.endsWith(".json"));
      assert.equal(replacementConfigs.length, 1);
      assert.notEqual(replacementConfigs[0], firstGeneratedConfig, "restart removes the old shim and owns a fresh one");

      await supervisor.stop(target);
      assert.deepEqual(await readdir(generatedDirectory), [], "the generated shim is removed after the child exits");
    } finally {
      await supervisor.dispose();
    }
  });

  it("refuses a generated-config directory symlink that escapes the trusted worktree", async () => {
    const fixture = await fixtureWorktree("typescript-config-symlink");
    const rootTypeScriptConfig = path.join(fixture.directory, "tsconfig.json");
    const rootContents = '{"compilerOptions":{"strict":true}}\n';
    const outsideDirectory = path.join(tempRoot, "outside-generated-config");
    const marker = path.join(outsideDirectory, "must-not-change.txt");
    await writeFile(rootTypeScriptConfig, rootContents, "utf8");
    await mkdir(outsideDirectory, { recursive: true });
    await writeFile(marker, "unchanged\n", "utf8");
    await symlink(outsideDirectory, path.join(fixture.directory, ".aqua-preview-config"), "dir");

    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => ({
        ...resolvedConfig(fixture.directory, fixture.serverFile),
        env: { NEXT_DIST_DIR: ".preview-build" },
      }),
      isProduction: () => false,
    });
    try {
      const result = await supervisor.start(scope("project_typescript_symlink"), project("project_typescript_symlink"));
      assert.equal(result.state, "start-failed");
      assert.match(result.error ?? "", /outside the trusted worktree/i);
      assert.equal((await lstat(path.join(fixture.directory, ".aqua-preview-config"))).isSymbolicLink(), true);
      assert.deepEqual(await readdir(outsideDirectory), ["must-not-change.txt"]);
      assert.equal(await readFile(rootTypeScriptConfig, "utf8"), rootContents);
    } finally {
      await supervisor.dispose();
    }
  });

  it("keeps the selected tsconfig available when a real Next child compiles a TypeScript route after health and restart", async () => {
    const fixture = await nextFixtureWorktree("real-next-typescript-route");
    const rootContents = await readFile(fixture.rootTypeScriptConfig, "utf8");
    const nextCli = path.join(process.cwd(), "node_modules/next/dist/bin/next");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => ({
        worktreePath: fixture.directory,
        command: process.execPath,
        args: [nextCli, "dev", "--turbopack", "--hostname", "{host}", "--port", "{port}"],
        healthPath: "/health.txt",
        startupTimeoutMs: 30_000,
        healthPollIntervalMs: 50,
        env: { NEXT_DIST_DIR: ".next-preview" },
        source: "real Next fixture",
      }),
      isProduction: () => false,
    });
    const target = scope("project_real_next_typescript");
    const generatedDirectory = path.join(fixture.directory, ".aqua-preview-config");

    const probe = async (previewUrl: string) => {
      const response = await fetch(`${previewUrl}/probe`);
      const body = await response.text();
      assert.equal(
        response.status,
        200,
        `${body}\n${supervisor.logs(target, 100).logs?.map(line => line.text).join("\n") ?? ""}`,
      );
      assert.equal(body, "typescript-route-ok");
    };

    try {
      await supervisor.start(target, project(target.projectId));
      const first = await waitForState(supervisor, target, "healthy", 30_000);
      const firstConfigs = (await readdir(generatedDirectory)).filter(name => name.endsWith(".json"));
      assert.equal(firstConfigs.length, 1, "the selected config still exists after Next reports ready");
      await probe(first.previewUrl!);
      assert.deepEqual((await readdir(generatedDirectory)).filter(name => name.endsWith(".json")), firstConfigs);
      assert.equal(await readFile(fixture.rootTypeScriptConfig, "utf8"), rootContents);

      await supervisor.restart(target, project(target.projectId));
      const second = await waitForState(supervisor, target, "healthy", 30_000);
      assert.notEqual(second.previewUrl, first.previewUrl);
      const secondConfigs = (await readdir(generatedDirectory)).filter(name => name.endsWith(".json"));
      assert.equal(secondConfigs.length, 1);
      assert.notDeepEqual(secondConfigs, firstConfigs, "restart replaces the child-owned config shim");
      await probe(second.previewUrl!);
      assert.equal(await readFile(fixture.rootTypeScriptConfig, "utf8"), rootContents);

      await supervisor.stop(target);
      const remaining = await readdir(generatedDirectory).catch(() => [] as string[]);
      assert.deepEqual(remaining, [], "generated tsconfig shims are removed only after the child stops");
    } finally {
      await supervisor.dispose();
    }
  });

  it("keeps Project A/B status and logs isolated", async () => {
    const a = await fixtureWorktree("project-a");
    const b = await fixtureWorktree("project-b");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async projectRecord => projectRecord.id === "project_a"
        ? resolvedConfig(a.directory, a.serverFile)
        : resolvedConfig(b.directory, b.serverFile),
      isProduction: () => false,
    });
    try {
      await supervisor.start(scope("project_a"), project("project_a"));
      await waitForState(supervisor, scope("project_a"), "healthy");
      assert.equal(supervisor.status(scope("project_b")).state, "idle");
      assert.deepEqual(supervisor.logs(scope("project_b")).logs, []);

      await supervisor.start(scope("project_b"), project("project_b"));
      await waitForState(supervisor, scope("project_b"), "healthy");
      const aLogs = supervisor.logs(scope("project_a"), 50).logs?.map(line => line.text).join("\n") ?? "";
      const bLogs = supervisor.logs(scope("project_b"), 50).logs?.map(line => line.text).join("\n") ?? "";
      assert.match(aLogs, /fixture-started:healthy/);
      assert.match(bLogs, /fixture-started:healthy/);
      assert.ok(!aLogs.includes("project_b") && !bLogs.includes("project_a"));
    } finally {
      await supervisor.dispose();
    }
  });

  it("separates realm control while globally locking the physical worktree", async () => {
    const fixture = await fixtureWorktree("realm-lock");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => resolvedConfig(fixture.directory, fixture.serverFile),
      isProduction: () => false,
    });
    const live = scope("project_realm", "live");
    const sandbox = scope("project_realm", "sandbox_fixture");
    try {
      await supervisor.start(live, project(live.projectId));
      await waitForState(supervisor, live, "healthy");
      assert.equal(supervisor.status(sandbox).state, "idle", "Sandbox cannot see live lifecycle state");
      assert.deepEqual(supervisor.logs(sandbox).logs, [], "Sandbox cannot read live logs");
      await assert.rejects(
        () => supervisor.start(sandbox, project(sandbox.projectId)),
        (error: unknown) => error instanceof supervisorModule.LocalRepositoryPreviewSupervisorError
          && error.code === "worktree-in-use",
      );
      await supervisor.stop(live);
      await supervisor.start(sandbox, project(sandbox.projectId));
      await waitForState(supervisor, sandbox, "healthy");
      assert.equal(supervisor.status(live).state, "stopped");
    } finally {
      await supervisor.dispose();
    }
  });

  it("deduplicates concurrent same-scope starts and restarts without releasing the worktree lock", async () => {
    const fixture = await fixtureWorktree("concurrent-same-scope");
    const startRecord = path.join(fixture.directory, "starts.log");
    let releaseInitialConfig: (() => void) | undefined;
    const initialConfigGate = new Promise<void>(resolve => { releaseInitialConfig = resolve; });
    let configCalls = 0;
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => {
        configCalls += 1;
        if (configCalls === 1) await initialConfigGate;
        return {
          ...resolvedConfig(fixture.directory, fixture.serverFile),
          env: { AQUA_PREVIEW_START_RECORD: startRecord },
        };
      },
      isProduction: () => false,
    });
    const target = scope("project_concurrent");
    const otherRealm = scope(target.projectId, "sandbox_concurrent");
    try {
      const firstStart = supervisor.start(target, project(target.projectId));
      const secondStart = supervisor.start(target, project(target.projectId));
      while (configCalls === 0) await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(configCalls, 1, "concurrent start calls share one config resolution");
      releaseInitialConfig?.();

      const [first, second] = await Promise.all([firstStart, secondStart]);
      assert.equal(first.previewUrl, second.previewUrl, "concurrent starts share one allocated port");
      await waitForState(supervisor, target, "healthy");
      let recordedStarts = (await readFile(startRecord, "utf8")).trim().split(/\r?\n/).filter(Boolean);
      assert.equal(recordedStarts.length, 1, "concurrent starts spawn exactly one child");

      await assert.rejects(
        () => supervisor.start(otherRealm, project(otherRealm.projectId)),
        (error: unknown) => error instanceof supervisorModule.LocalRepositoryPreviewSupervisorError
          && error.code === "worktree-in-use",
        "the original process still owns the physical worktree lock",
      );

      const [firstRestart, secondRestart] = await Promise.all([
        supervisor.restart(target, project(target.projectId)),
        supervisor.restart(target, project(target.projectId)),
      ]);
      assert.equal(firstRestart.previewUrl, secondRestart.previewUrl, "concurrent restarts share one allocated port");
      await waitForState(supervisor, target, "healthy");
      recordedStarts = (await readFile(startRecord, "utf8")).trim().split(/\r?\n/).filter(Boolean);
      assert.equal(recordedStarts.length, 2, "concurrent restarts spawn only one replacement child");
      assert.equal(new Set(recordedStarts).size, 2, "the replacement is a distinct process");

      await assert.rejects(
        () => supervisor.start(otherRealm, project(otherRealm.projectId)),
        (error: unknown) => error instanceof supervisorModule.LocalRepositoryPreviewSupervisorError
          && error.code === "worktree-in-use",
        "a stale release cannot clear the replacement process's worktree lock",
      );
    } finally {
      releaseInitialConfig?.();
      await supervisor.dispose();
    }
  });

  it("refuses production with an explicit terminal state", async () => {
    const fixture = await fixtureWorktree("production");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => resolvedConfig(fixture.directory, fixture.serverFile),
      isProduction: () => true,
    });
    const result = await supervisor.start(scope("project_production"), project("project_production"));
    assert.equal(result.state, "production-refused");
    assert.match(result.error ?? "", /refused in production/i);
    await supervisor.dispose();
  });

  it("refuses unsafe paths, shell commands and wildcard blank-project mappings", async () => {
    const safe = await fixtureWorktree("safe-config");
    const outside = await mkdtemp(path.join(tmpdir(), "aqua-preview-outside-"));
    const base = {
      projectIds: ["project_config"],
      worktreePath: safe.directory,
      command: "node",
      args: [safe.serverFile, "{port}", "healthy"],
      source: "test record",
    };
    await assert.rejects(
      () => configModule.resolveTrustedLocalRepositoryPreview(project("project_config"), {
        records: [{ ...base, worktreePath: outside }],
        safeRoots: [safe.directory],
      }),
      (error: unknown) => error instanceof configModule.LocalRepositoryPreviewConfigError && error.code === "unsafe-worktree",
    );
    await assert.rejects(
      () => configModule.resolveTrustedLocalRepositoryPreview(project("project_config"), {
        records: [{ ...base, command: "/bin/sh" }],
        safeRoots: [safe.directory],
      }),
      (error: unknown) => error instanceof configModule.LocalRepositoryPreviewConfigError && error.code === "untrusted-command",
    );
    await assert.rejects(
      () => configModule.resolveTrustedLocalRepositoryPreview(project("project_blank", ""), {
        records: [{ ...base, projectIds: [], allowBlankRepository: true }],
        safeRoots: [safe.directory],
      }),
      (error: unknown) => error instanceof configModule.LocalRepositoryPreviewConfigError && error.code === "preview-not-configured",
    );
  });

  it("binds the committed AquaCRM manifest only to its exact repository", async () => {
    const exact = await configModule.resolveTrustedLocalRepositoryPreview(
      project("project_manifest", "edstorm987/aquacrm"),
    );
    assert.equal(exact.worktreePath, await import("node:fs/promises").then(fs => fs.realpath(process.cwd())));
    assert.equal(exact.command, process.execPath);
    assert.ok(exact.args.includes("{port}"));
    assert.equal(exact.source, "aqua-preview.config.json");

    await assert.rejects(
      () => configModule.resolveTrustedLocalRepositoryPreview(project("project_other_manifest", "someone/else")),
      (error: unknown) => error instanceof configModule.LocalRepositoryPreviewConfigError
        && error.code === "preview-not-configured",
    );
    await assert.rejects(
      () => configModule.resolveTrustedLocalRepositoryPreview(project("project_blank_manifest", "")),
      (error: unknown) => error instanceof configModule.LocalRepositoryPreviewConfigError
        && error.code === "preview-not-configured",
    );
  });

  it("classifies crash, timeout, occupied-port, install and generic start failures", async () => {
    for (const [mode, expected] of [
      ["crash", "crashed"],
      ["hang", "health-timeout"],
      ["occupied", "occupied-port"],
      ["install", "install-failed"],
      ["start-fail", "start-failed"],
    ] as const) {
      const fixture = await fixtureWorktree(`failure-${mode}`);
      const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
        resolveConfig: async () => resolvedConfig(fixture.directory, fixture.serverFile, mode, mode === "hang" ? 250 : 1_500),
        isProduction: () => false,
      });
      const target = scope(`project_${mode.replace("-", "_")}`);
      try {
        await supervisor.start(target, project(target.projectId));
        if (mode === "crash") await waitForState(supervisor, target, "healthy");
        const terminal = await waitForState(supervisor, target, expected, 5_000);
        assert.match(terminal.error ?? "", /preview|port|runtime|dependencies|healthy|exited/i, mode);
      } finally {
        await supervisor.dispose();
      }
    }
  });

  it("redacts credentials, omits inherited private env and bounds returned logs", async () => {
    const fixture = await fixtureWorktree("redaction");
    process.env.AQUA_PRIVATE_VALUE = "must-not-reach-child";
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => resolvedConfig(fixture.directory, fixture.serverFile, "secrets"),
      isProduction: () => false,
    });
    const target = scope("project_redaction");
    try {
      await supervisor.start(target, project(target.projectId));
      await waitForState(supervisor, target, "healthy");
      const lines = supervisor.logs(target, 400).logs ?? [];
      const output = lines.map(line => line.text).join("\n");
      assert.ok(lines.length <= 400, "the ring buffer is bounded");
      assert.ok(!output.includes("super-secret-token"));
      assert.ok(!output.includes("bearer-secret-value"));
      assert.ok(!output.includes("user:password"));
      assert.ok(!output.includes("must-not-reach-child"));
      assert.match(output, /\[REDACTED\]/);
    } finally {
      delete process.env.AQUA_PRIVATE_VALUE;
      await supervisor.dispose();
    }
  });

  it("enforces the global running-process cap", async () => {
    const a = await fixtureWorktree("cap-a");
    const b = await fixtureWorktree("cap-b");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async projectRecord => projectRecord.id === "project_cap_a"
        ? resolvedConfig(a.directory, a.serverFile)
        : resolvedConfig(b.directory, b.serverFile),
      isProduction: () => false,
      maxRunningPreviews: 1,
    });
    try {
      await supervisor.start(scope("project_cap_a"), project("project_cap_a"));
      await waitForState(supervisor, scope("project_cap_a"), "healthy");
      await assert.rejects(
        () => supervisor.start(scope("project_cap_b"), project("project_cap_b")),
        (error: unknown) => error instanceof supervisorModule.LocalRepositoryPreviewSupervisorError
          && error.code === "preview-capacity",
      );
    } finally {
      await supervisor.dispose();
    }
  });
});
