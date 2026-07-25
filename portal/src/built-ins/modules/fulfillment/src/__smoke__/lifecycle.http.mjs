#!/usr/bin/env node
// HTTP-level lifecycle smoke — companion to lifecycle.test.ts.
//
// Exercises the same lifecycle (create → tick → advance × 4) but through
// the foundation's HTTP routes instead of the plugin's services in-process.
// Validates that T1's catch-all route dispatcher, auth cookie, plugin
// runtime adapter, and activity log all line up with what the plugin's
// own contract says.
//
// Prerequisites:
//   1. Run the standalone portal locally, normally on port 3032.
//   2. Provide founder credentials via AQUA_OWNER_EMAIL/AQUA_OWNER_PASSWORD
//      if they differ from the local Milesymedia defaults.
//
// Run from `04-the-final-portal/plugins/fulfillment/`:
//   node src/__smoke__/lifecycle.http.mjs
//
// Exit code 0 on success, 1 on first assertion failure.

const BASE = process.env.AQUA_BASE ?? "http://localhost:3032";
const DEMO_OWNER_EMAIL = process.env.AQUA_OWNER_EMAIL ?? "Ed";
const DEMO_OWNER_PASSWORD = process.env.AQUA_OWNER_PASSWORD ?? "SuperCreator123!";

let cookie = "";
let failures = 0;

function log(msg, ok = true) {
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${msg}`);
  if (!ok) failures += 1;
}

async function http(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/lk_session_v1=[^;]+/);
    if (match) cookie = match[0];
  }
  let body = null;
  try { body = await res.json(); }
  catch { body = await res.text().catch(() => null); }
  return { status: res.status, body };
}

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  log(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, ok);
}

function assertOk(condition, label) {
  log(label, !!condition);
}

// ─── 1. Log in as founder ────────────────────────────────────────────────

console.log(`\n→ Lifecycle HTTP smoke (target ${BASE})\n`);

let r = await http("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: DEMO_OWNER_EMAIL, password: DEMO_OWNER_PASSWORD }),
});
assertOk(r.status === 200, "login returns 200");
assertOk(cookie.startsWith("lk_session_v1="), "session cookie set");

// ─── 2. List phases for this agency ───────────────────────────────────────

r = await http("/api/portal/fulfillment/phases");
assertOk(r.status === 200, "GET /phases returns 200");
const phases = r.body?.phases ?? r.body;
assertOk(Array.isArray(phases) && phases.length >= 6, `phases.length >= 6 (got ${phases?.length})`);
const phaseByStage = Object.fromEntries(phases.map(p => [p.stage, p]));

// ─── 3. Create a fresh client at the first Aqua phase ─────────────────────

r = await http("/api/portal/fulfillment/clients", {
  method: "POST",
  body: JSON.stringify({
    name: "HTTP Smoke Co",
    ownerEmail: "owner@httpsmoke.test",
    stage: "aqua-epic-intro",
  }),
});
assertOk(r.status === 200 || r.status === 201, `POST /clients returns 2xx (got ${r.status})`);
const created = r.body;
const clientId = created?.client?.id ?? created?.id;
assertOk(clientId, "client created with id");
assertEq(created?.client?.stage ?? created?.stage, "aqua-epic-intro", "client.stage = aqua-epic-intro on create");

// ─── 4. For each phase, tick all items and advance to the next ────────────

const HOPS = [
  ["aqua-epic-intro", "aqua-blueprint"],
  ["aqua-blueprint", "aqua-diagnostics"],
  ["aqua-diagnostics", "aqua-brand-builder"],
  ["aqua-brand-builder", "aqua-traffic"],
  ["aqua-traffic", "aqua-mastery"],
];

for (const [from, to] of HOPS) {
  const fromPhase = phaseByStage[from];
  const toPhase = phaseByStage[to];
  assertOk(fromPhase && toPhase, `${from}→${to}: both phases resolved`);

  // Tick every checklist item.
  for (const item of fromPhase.checklist) {
    const tick = await http("/api/portal/fulfillment/checklist/tick", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        phaseId: fromPhase.id,
        itemId: item.id,
        done: true,
      }),
    });
    assertOk(tick.status === 200, `${from}: tick "${item.label}" returns 200`);
  }

  const advance = await http("/api/portal/fulfillment/phase/advance", {
    method: "POST",
    body: JSON.stringify({
      clientId,
      fromPhaseId: fromPhase.id,
      toPhaseId: toPhase.id,
    }),
  });
  assertOk(advance.status === 200, `advance ${from}→${to} returns 200 (got ${advance.status})`);
  assertOk(advance.body?.ok === true, `advance ${from}→${to} body.ok === true`);
  assertEq(advance.body?.client?.stage, to, `advance ${from}→${to} updates client.stage`);
}

// ─── 5. Verify final state ────────────────────────────────────────────────

r = await http(`/api/portal/fulfillment/clients`);
const list = r.body?.clients ?? r.body;
const ourClient = Array.isArray(list) ? list.find(c => c.id === clientId) : null;
assertOk(ourClient, "client still listed after lifecycle");
assertEq(ourClient?.stage, "aqua-mastery", "final stage = aqua-mastery");

r = await http(`/api/portal/fulfillment/activity?clientId=${clientId}`);
const activity = r.body?.entries ?? r.body?.activity ?? r.body ?? [];
const advancedEntries = Array.isArray(activity)
  ? activity.filter(e => e.action === "phase.advanced")
  : [];
assertOk(advancedEntries.length >= 5, `5 phase.advanced entries logged (got ${advancedEntries.length})`);

// ─── 6. Marketplace shows mastery preset enabled ──────────────────────────

r = await http(`/api/portal/fulfillment/marketplace?clientId=${clientId}`);
const cards = r.body?.cards ?? [];
const enabledIds = cards.filter(c => c.enabled).map(c => c.id).sort();
const masterySet = [...phaseByStage["aqua-mastery"].pluginPreset].sort();
const allMasteryEnabled = masterySet.every(id => enabledIds.includes(id));
assertOk(allMasteryEnabled, `mastery preset (${masterySet.join(", ")}) all enabled in marketplace`);

console.log(`\nFailures: ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
