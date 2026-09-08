// Self-tests for the UI acceptance harness (scripts/ui-acceptance.mjs).
//
// These prove the harness has TEETH: every protection produces a finding when its
// triggering condition holds, blocking findings force a non-zero gate/exit, an
// unknown engine refuses to run instead of silently falling back to Chromium, and
// a clean record produces nothing. If a protection is ever deleted from
// classifyRecord, the matching row below goes red — that is the point.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  classifyRecord,
  gateFromFindings,
  isValidEngine,
  BLOCKING,
} from "./ui-acceptance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, "ui-acceptance.mjs");

// A record that trips NO protection — the control. Every protection test starts
// from this and flips exactly one field, so a produced finding can only be that
// protection firing (not incidental noise from a dirty base record).
const CLEAN = Object.freeze({ path: "/portal", vp: "desktop-1280", needsAuth: true, status: 200 });

// Each row: a single broken condition, the finding kind it must produce, its
// severity, and whether that severity blocks the gate.
const PROTECTIONS: Array<{
  name: string;
  patch: Record<string, unknown>;
  kind: string;
  sev: string;
  blocks: boolean;
}> = [
  { name: "navigation/load error", patch: { err: "net::ERR_CONNECTION_REFUSED" }, kind: "load-error", sev: "P1", blocks: true },
  { name: "protected route redirected to login", patch: { needsAuth: true, redirectedToLogin: true, finalUrl: "/login" }, kind: "auth-redirect", sev: "P1", blocks: true },
  { name: "protected route non-200", patch: { needsAuth: true, status: 500 }, kind: "non-200", sev: "P1", blocks: true },
  { name: "geometry probe did not run", patch: { geometryMissing: true }, kind: "incomplete-scan", sev: "P1", blocks: true },
  { name: "axe did not run", patch: { axeMissing: true, axeErr: "axe timeout" }, kind: "incomplete-scan", sev: "P1", blocks: true },
  { name: "screenshot failed", patch: { shotErr: "disk full" }, kind: "screenshot-failed", sev: "P1", blocks: true },
  { name: "horizontal overflow", patch: { overflowFail: true, overflowDetail: "scrollWidth 1400 > 1280" }, kind: "overflow", sev: "P1", blocks: true },
  { name: "offscreen interactive control", patch: { offscreen: 2, offscreenText: ["Save", "Cancel"] }, kind: "offscreen-interactive", sev: "P1", blocks: true },
  { name: "clipped focusable (x-axis)", patch: { clipped: 1, clippedText: ["Filter"] }, kind: "clipped-focusable-x", sev: "P2-review", blocks: false },
  { name: "serious/critical axe violation", patch: { axeBlocking: 1, axeBlockingIds: ["color-contrast(5)"] }, kind: "axe-serious", sev: "P1", blocks: true },
  { name: "console error", patch: { consoleErrors: 1, consoleErrorDetail: ["Uncaught TypeError"] }, kind: "console-error", sev: "P1", blocks: true },
  { name: "network request failure", patch: { netFail: 1, netFailDetail: ["GET /api/x 500"] }, kind: "network-failure", sev: "P1", blocks: true },
  { name: "loading curtain stuck", patch: { loaderStuck: true }, kind: "loader-stuck", sev: "P2", blocks: false },
  { name: "uncaught page error", patch: { pageErrors: 1, pageErrorDetail: ["ReferenceError: x is not defined"] }, kind: "page-error", sev: "P1", blocks: true },
];

test("a clean record trips no protection", () => {
  assert.deepEqual(classifyRecord({ ...CLEAN }), []);
});

for (const p of PROTECTIONS) {
  test(`protection fires: ${p.name}`, () => {
    const findings = classifyRecord({ ...CLEAN, ...p.patch });
    const match = findings.find(f => f.kind === p.kind);
    assert.ok(match, `expected a "${p.kind}" finding; got ${JSON.stringify(findings.map(f => f.kind))}`);
    assert.equal(match.sev, p.sev, `${p.kind} should be severity ${p.sev}`);
    assert.equal(match.path, CLEAN.path, "finding must carry the record path");
    assert.equal(match.vp, CLEAN.vp, "finding must carry the record viewport");
    // A severity that blocks must be recognised as blocking by the shared set.
    assert.equal(BLOCKING.has(match.sev), p.blocks, `${p.sev} blocking classification`);
  });
}

test("every blocking protection drives a non-zero gate + exit code", () => {
  for (const p of PROTECTIONS.filter(x => x.blocks)) {
    const findings = classifyRecord({ ...CLEAN, ...p.patch });
    const gate = gateFromFindings(findings);
    assert.equal(gate.gate, "blocked", `${p.name} must block the gate`);
    assert.equal(gate.exitCode, 1, `${p.name} must yield exit 1`);
    assert.ok(gate.blockingCount >= 1);
  }
});

test("non-blocking-only findings pass the gate with exit 0", () => {
  // clipped + loader-stuck together: real findings, but neither is P0/P1.
  const findings = classifyRecord({ ...CLEAN, clipped: 1, clippedText: ["Filter"], loaderStuck: true });
  assert.ok(findings.length >= 2, "both non-blocking findings should be recorded");
  const gate = gateFromFindings(findings);
  assert.equal(gate.gate, "pass");
  assert.equal(gate.exitCode, 0);
  assert.equal(gate.blockingCount, 0);
});

test("gate is clean only when there are genuinely zero findings", () => {
  const gate = gateFromFindings([]);
  assert.deepEqual(gate, { gate: "pass", blockingCount: 0, exitCode: 0 });
});

test("engine validation accepts exactly the provisioned three", () => {
  assert.equal(isValidEngine("chromium"), true);
  assert.equal(isValidEngine("webkit"), true);
  assert.equal(isValidEngine("firefox"), true);
  assert.equal(isValidEngine("bogus"), false);
  assert.equal(isValidEngine(""), false);
  assert.equal(isValidEngine("Chromium"), false, "case-sensitive: no silent normalisation");
});

test("an unknown engine refuses to run (exit 2) — no silent Chromium fallback", () => {
  let code = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [HARNESS], {
      env: { ...process.env, AQUA_UI_ENGINE: "bogus-engine" },
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 20_000,
    });
  } catch (e: any) {
    code = e.status ?? -1;
    stderr = e.stderr ? e.stderr.toString() : "";
  }
  assert.equal(code, 2, `unknown engine must exit 2, got ${code}`);
  assert.match(stderr, /unknown AQUA_UI_ENGINE/i, "must name the offending engine");
  assert.match(stderr, /Refusing to run/i, "must state it refused rather than fell back");
});
