#!/usr/bin/env node

import { statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MIN_FREE_BYTES = 2n * 1024n * 1024n * 1024n;

function formatGiB(bytes) {
  return `${(Number(bytes) / (1024 ** 3)).toFixed(2)} GiB`;
}

/**
 * Pure decision boundary kept separate from statfs so the ENOSPC regression is
 * deterministic in tests. Next can leave an on-demand route request open after
 * a compiler write fails, so refusing to start is safer than entering that
 * half-alive state. The guard is deliberately non-destructive.
 */
export function evaluateDevDiskSpace(availableBytes, minFreeBytes = DEFAULT_MIN_FREE_BYTES) {
  const available = BigInt(availableBytes);
  const minimum = BigInt(minFreeBytes);
  if (available >= minimum) {
    return { ok: true, availableBytes: available, minFreeBytes: minimum };
  }

  return {
    ok: false,
    availableBytes: available,
    minFreeBytes: minimum,
    message:
      `[dev-preflight] AquaCRM dev server not started: only ${formatGiB(available)} free; `
      + `${formatGiB(minimum)} is required. Next compiler writes can otherwise fail with ENOSPC `
      + "and leave page requests hanging. Free stale generated build output, then retry. "
      + "Nothing was deleted automatically.",
  };
}

export async function checkDevDiskSpace(root = process.cwd()) {
  const stats = await statfs(root, { bigint: true });
  return evaluateDevDiskSpace(stats.bavail * stats.bsize);
}

async function main() {
  let result;
  try {
    result = await checkDevDiskSpace(process.cwd());
  } catch (error) {
    // A platform without statfs should not make local development impossible.
    // The warning keeps the missing protection visible without pretending the
    // disk is full.
    console.warn(
      `[dev-preflight] Could not inspect free disk space: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`[dev-preflight] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
