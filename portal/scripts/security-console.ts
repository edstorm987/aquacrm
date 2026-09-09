#!/usr/bin/env node
// AquaCRM operator security console — launcher.
//
// The documented command must work verbatim, with NO hidden NODE_OPTIONS:
//   node --import tsx scripts/security-console.ts <command> [args] --actor <you> [--reason "..."] --commit
//
// The real logic lives in security-console-impl.ts, which imports the server
// control plane (and therefore `server-only`). `server-only` throws unless Node
// resolves modules with `--conditions react-server`. Rather than make the
// operator remember an env var, this launcher RE-EXECS itself once with that
// condition, then loads the impl. The guard env var prevents an infinite loop.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REEXEC_GUARD = "__AQUA_SECCONSOLE_REEXEC";

if (!process.env[REEXEC_GUARD]) {
  const result = spawnSync(
    process.execPath,
    ["--conditions", "react-server", "--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, [REEXEC_GUARD]: "1" } },
  );
  process.exit(result.status ?? 1);
} else {
  // Re-exec'd with the server condition — now safe to load the impl (its
  // top-level code parses argv and runs the command). No top-level await: tsx
  // transpiles this to CJS. The impl handles its own errors and exit code.
  import("./security-console-impl.ts").catch((error: unknown) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
