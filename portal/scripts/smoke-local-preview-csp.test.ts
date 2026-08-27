import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";

test("development CSP permits supervised ephemeral loopback preview frames only outside production", () => {
  const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

  assert.match(config, /const DEV_LOOPBACK_FRAME_SOURCES = process\.env\.NODE_ENV === "production"/);
  assert.match(config, /http:\/\/localhost:\*/);
  assert.match(config, /http:\/\/127\.0\.0\.1:\*/);
  assert.match(config, /`frame-src 'self'\$\{DEV_LOOPBACK_FRAME_SOURCES\} https:`/);
  assert.match(config, /`frame-ancestors 'self'\$\{DEV_LOOPBACK_FRAME_SOURCES\} https:`/);
  assert.match(config, /\? ""\s*:\s*" http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*"/);
});
