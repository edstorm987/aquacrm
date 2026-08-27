import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const portalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runnerPath = join(portalRoot, "scripts", "run-website-editor-smoke.mjs");

function runRunner(environment: NodeJS.ProcessEnv) {
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolveRun, reject) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: portalRoot,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolveRun({ code, stdout, stderr }));
  });
}

test("Website Editor runner attempts later files after an earlier failure", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "aqua-website-smoke-"));
  const markerPath = join(fixtureRoot, "later-file-ran.txt");

  try {
    await writeFile(
      join(fixtureRoot, "01-failure.test.ts"),
      'console.error("intentional fixture failure"); process.exitCode = 1;\n',
    );
    await writeFile(
      join(fixtureRoot, "02-later.test.ts"),
      'import { writeFileSync } from "node:fs"; writeFileSync(process.env.RUNNER_MARKER, "ran");\n',
    );

    const result = await runRunner({
      ...process.env,
      RUNNER_MARKER: markerPath,
      WEBSITE_EDITOR_SMOKE_ROOT: fixtureRoot,
    });

    assert.equal(result.code, 1);
    assert.equal(await readFile(markerPath, "utf8"), "ran");
    assert.match(result.stdout, /Website Editor smoke gate: 1\/2 files passed/);
    assert.match(result.stderr, /01-failure\.test\.ts \(exit 1\)/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("root and module package commands use the shared Website Editor runner", async () => {
  const rootPackage = JSON.parse(
    await readFile(join(portalRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const modulePackage = JSON.parse(
    await readFile(
      join(
        portalRoot,
        "src",
        "built-ins",
        "modules",
        "website-editor",
        "package.json",
      ),
      "utf8",
    ),
  ) as { scripts?: Record<string, string> };

  assert.equal(
    rootPackage.scripts?.["smoke:website-editor"],
    "node scripts/run-website-editor-smoke.mjs",
  );
  assert.match(rootPackage.scripts?.["smoke:all"] ?? "", /node --import tsx --test/);
  assert.match(rootPackage.scripts?.["smoke:all"] ?? "", /smoke:website-editor/);
  assert.equal(
    modulePackage.scripts?.test,
    "node ../../../../scripts/run-website-editor-smoke.mjs",
  );
});
