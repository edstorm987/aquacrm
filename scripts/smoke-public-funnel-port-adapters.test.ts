// T1 R032 smoke — public-funnel + BOS port adapters + dispatcher public:true.
// Run via `npm run smoke:public-funnel-port-adapters` (tsx --test).
//
// All load-bearing wire-up is behind server-only — leadFunnelPorts +
// _types + dispatcher route handler. Source-marker covers the
// shipped contract.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PLUGIN_TYPES = join(ROOT, "src", "plugins", "_types.ts");
const DISPATCHER = join(ROOT, "src", "app", "api", "portal", "[plugin]", "[...rest]", "route.ts");
const LEAD_PORTS = join(ROOT, "src", "plugins", "foundation-adapters", "leadFunnelPorts.ts");
const TYPES = join(ROOT, "src", "server", "types.ts");

describe("Public-funnel port adapters — `public: true` route flag (R032)", () => {
  it("PluginApiRoute carries optional `public?: boolean`", () => {
    const src = readFileSync(PLUGIN_TYPES, "utf8");
    assert.ok(src.includes("public?: boolean"));
    assert.ok(src.match(/public-funnel HC submit|public-funnel|public:true/i),
      "comment documents the public-route use cases");
  });

  it("dispatcher peeks route + skips requireSession when public:true", () => {
    const src = readFileSync(DISPATCHER, "utf8");
    assert.ok(src.includes("isPublic"));
    assert.ok(src.includes("route.public === true"));
    assert.ok(src.match(/if\s*\(\s*!\s*isPublic\s*\)/), "session required only when !isPublic");
  });

  it("dispatcher reads agencyId from URL/headers for public routes", () => {
    const src = readFileSync(DISPATCHER, "utf8");
    assert.ok(src.includes('searchParams.get("agencyId")'));
    assert.ok(src.includes('"x-aqua-agency-id"'));
  });

  it("anonymous public route still gets a PluginCtx (actor: \"anonymous\")", () => {
    const src = readFileSync(DISPATCHER, "utf8");
    assert.ok(src.includes('actor: session?.userId ?? "anonymous"'));
  });

  it("non-public route still requires session (auth gate preserved)", () => {
    const src = readFileSync(DISPATCHER, "utf8");
    assert.ok(src.match(/if\s*\(\s*!isPublic\s*\)\s*\{[\s\S]*requireSession/));
  });
});

describe("Public-funnel port adapters — leadFunnelPorts.ts (R032)", () => {
  it("file exists + exports leadUserPort / sessionPort / funnelMePort", () => {
    assert.equal(existsSync(LEAD_PORTS), true);
    const src = readFileSync(LEAD_PORTS, "utf8");
    assert.ok(src.includes("export const leadUserPort"));
    assert.ok(src.includes("export const sessionPort"));
    assert.ok(src.includes("export const funnelMePort"));
  });

  it("LeadUserPort.upsertLeadByEmail is idempotent on email", () => {
    const src = readFileSync(LEAD_PORTS, "utf8");
    assert.ok(src.includes("upsertLeadByEmail"));
    assert.ok(src.match(/getUser\s*\(\s*norm\s*\)/), "checks existing before create");
    assert.ok(src.match(/created:\s*false/), "returns created:false on re-capture");
    assert.ok(src.match(/created:\s*true/), "returns created:true on first capture");
    assert.ok(src.includes("LEAD_AGENCY_ID"));
    assert.ok(src.includes('role: "lead"'));
  });

  it("SessionPort wraps foundation issueSession", () => {
    const src = readFileSync(LEAD_PORTS, "utf8");
    assert.ok(src.includes("foundationIssueSession"));
    assert.ok(src.includes("sessionRev: u.sessionRev"));
  });

  it("FunnelMePort returns null for non-lead users", () => {
    const src = readFileSync(LEAD_PORTS, "utf8");
    assert.ok(src.includes("getMeContextByUserId"));
    assert.ok(src.match(/u\.role\s*!==\s*"lead"/), "guards against non-lead userIds");
    assert.ok(src.match(/return\s+null/), "returns null on miss");
  });
});

describe("Public-funnel port adapters — ActivityCategory promotion (R032)", () => {
  it("types.ts ActivityCategory union includes public-funnel + bos-auth-gate", () => {
    const src = readFileSync(TYPES, "utf8");
    assert.ok(src.includes('"public-funnel"'));
    assert.ok(src.includes('"bos-auth-gate"'));
  });
});

describe("Public-funnel port adapters — Role union covers `lead` (R032)", () => {
  it("Role union (R023) already includes `lead`; PluginRoleVisibility uses Role", () => {
    const src = readFileSync(TYPES, "utf8");
    assert.ok(src.includes('"lead"'), "Role union already includes lead");
    // PluginApiRoute.visibleToRoles is typed `Role[]` in _types.ts.
    const tsrc = readFileSync(PLUGIN_TYPES, "utf8");
    assert.ok(tsrc.includes("visibleToRoles?: Role[]"));
  });
});
