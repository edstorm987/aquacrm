import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const portalRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const moduleRoot = join(
  portalRoot,
  "src",
  "built-ins",
  "modules",
  "website-editor",
);
const smokeRoot = process.env.WEBSITE_EDITOR_SMOKE_ROOT
  ? join(process.env.WEBSITE_EDITOR_SMOKE_ROOT)
  : join(moduleRoot, "src", "__smoke__");

function withoutReactServerCondition(nodeOptions = "") {
  return nodeOptions
    .replace(/(?:^|\s)--conditions(?:=|\s+)react-server(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Most of these files render client components, so `--conditions react-server`
// is stripped — under it React resolves to its server build and `useState`
// disappears. But a smoke that reaches a portal module guarded by `server-only`
// needs the opposite: without the condition that package throws on import, so
// the test cannot run at all. Neither setting is right for all 49 files, so a
// file that needs the server resolution says so on its first lines with
//
//   // @smoke-conditions react-server
//
// and gets it. Silence keeps today's behaviour.
const SERVER_CONDITION_DIRECTIVE = /^\s*\/\/\s*@smoke-conditions\s+react-server\s*$/m;

async function needsReactServerCondition(file) {
  const head = (await readFile(file, "utf8")).slice(0, 4096);
  return SERVER_CONDITION_DIRECTIVE.test(head);
}

function withReactServerCondition(nodeOptions = "") {
  const base = withoutReactServerCondition(nodeOptions);
  return `${base} --conditions react-server`.trim();
}

function runSmokeFile(file, reactServer) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", file], {
      cwd: moduleRoot,
      env: {
        ...process.env,
        NODE_OPTIONS: reactServer
          ? withReactServerCondition(process.env.NODE_OPTIONS)
          : withoutReactServerCondition(process.env.NODE_OPTIONS),
        TSX_TSCONFIG_PATH: join(portalRoot, "tsconfig.json"),
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({
        file,
        ok: code === 0,
        result: signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`,
      });
    });
  });
}

const smokeFiles = (await readdir(smokeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => join(smokeRoot, entry.name))
  .sort();

if (smokeFiles.length === 0) {
  console.error("Website Editor smoke gate found no test files.");
  process.exitCode = 1;
} else {
  const results = [];
  const startedAt = Date.now();

  for (const file of smokeFiles) {
    results.push(await runSmokeFile(file, await needsReactServerCondition(file)));
  }

  const failures = results.filter((result) => !result.ok);
  const durationSeconds = ((Date.now() - startedAt) / 1_000).toFixed(1);

  console.log(
    `\nWebsite Editor smoke gate: ${results.length - failures.length}/${results.length} files passed in ${durationSeconds}s.`,
  );

  if (failures.length > 0) {
    console.error("Failed Website Editor smoke files:");
    for (const failure of failures) {
      console.error(`- ${relative(portalRoot, failure.file)} (${failure.result})`);
    }
    process.exitCode = 1;
  }
}
