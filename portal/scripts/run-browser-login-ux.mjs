#!/usr/bin/env node

// Hermetic launcher for LOGIN-UX-001. The public showcase stores its fixture
// in a separate data realm. Next development route bundles do not reliably
// share a process-local memory adapter, so the acceptance runner owns a
// temporary file backend and one server for the complete browser matrix.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), "aqua-login-browser-"));
const stateFile = join(sandbox, "portal-state.json");
const port = await availablePort();
const base = `http://127.0.0.1:${port}`;
const output = [];

const server = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "dev",
  "--webpack",
  "--hostname", "127.0.0.1",
  "--port", String(port),
], {
  cwd: root,
  env: {
    ...process.env,
    PORTAL_BACKEND: "file",
    PORTAL_DATA_FILE: stateFile,
    PORTAL_SESSION_SECRET: "login-browser-hermetic-secret-123456789",
    NEXT_PUBLIC_PORTAL_BASE_URL: base,
    NEXT_PUBLIC_PORTAL_SECURITY: "strict",
    WEBSITE_DEMO_ENABLED: "true",
    PUBLIC_SHOWCASE_ENABLED: "true",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "login-browser-fixture",
    TURNSTILE_SECRET_KEY: "login-browser-fixture-secret",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", chunk => {
    output.push(String(chunk));
    if (output.length > 300) output.shift();
  });
}

let exitCode = 1;
try {
  await waitUntilReady(base, server);
  exitCode = await runAcceptance(base);
  if (exitCode !== 0) process.stderr.write(output.join(""));
} finally {
  await stop(server);
  rmSync(sandbox, { recursive: true, force: true });
}

process.exitCode = exitCode;

async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise(resolve => listener.close(resolve));
  return address.port;
}

async function waitUntilReady(origin, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited ${child.exitCode}\n${output.join("")}`);
    try {
      const response = await fetch(`${origin}/login?brand=aqua`, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // Server is still binding or compiling.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for the local browser server.\n${output.join("")}`);
}

function runAcceptance(origin) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/browser-login-ux-acceptance.mjs"], {
      cwd: root,
      env: { ...process.env, AQUA_BASE: origin },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", code => resolve(code ?? 1));
  });
}

function stop(child) {
  if (child.exitCode !== null) return Promise.resolve();
  child.kill("SIGTERM");
  return new Promise(resolve => {
    const force = setTimeout(() => child.kill("SIGKILL"), 3_000);
    child.once("close", () => {
      clearTimeout(force);
      resolve();
    });
  });
}
