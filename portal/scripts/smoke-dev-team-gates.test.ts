// One test that walks the whole Dev Team workspace and asks every reachable
// body the same question: does a non-founder get in?
//
// The 2026-08-20 restructure moved the gate from "one gate per route file" to
// "one gate per `_Section` body, with the host route ungated by design". That
// shape is correct, but it destroyed the property that made it self-enforcing:
// a new file under `src/app/portal/dev-team/` used to be a page, and a page
// with no gate was obvious. Now `findings/page.tsx`, `library/page.tsx` and
// `tools/page.tsx` are legitimately gate-free, so "this dev-team file has no
// gate" is no longer a signal at all.
//
// Exactly one of the eight section bodies was pinned by anything, and only by
// regex. The suite would have stayed green with the gate deleted from any of
// the other seven — invisible until the day `canUseDevMode()` is widened for
// the planned production "demo portals" path, at which point every agency
// manager reads the lot.
//
// Two layers here, deliberately:
//   1. BEHAVIOUR — call each section body with a real agency-manager session
//      inside a real request scope, and require a 404.
//   2. ENUMERATION — walk the tree on disk so a NEW file has to be added to an
//      allowlist on purpose rather than passing in silence.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// First, and statically — see the note in dev-console-request-scope.ts.
import { isNextNotFound, isNextRedirect, withDevMode, withRequestScope, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

// Section bodies import client components, and those reach for
// `React.createContext` — which the react-server build the suite runs under
// does not export. The gate throws long before any of this is rendered, so a
// stub is enough to let the module graph load and the real question be asked.
import * as React from "react";
const reactShim = React as unknown as { createContext?: unknown; default?: { createContext?: unknown } };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
reactShim.createContext ??= stubContext;
if (reactShim.default) reactShim.default.createContext ??= stubContext;

import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL_DIR = join(REPO, "src/app/portal/dev-team");
const API_DIR = join(REPO, "src/app/api/portal/dev-team");

let seq = 0;
async function managerSession() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Gate Co", slug: `gate-co-${Date.now()}-${seq}` });
  const manager = createUser({
    email: `manager-${agency.id}@gate.test`,
    name: "Agency Manager",
    role: "agency-manager",
    agencyId: agency.id,
    password: "gate-manager-pass",
  });
  return issueSession({
    userId: manager.id, email: manager.email, role: "agency-manager",
    agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
    sessionRev: manager.sessionRev ?? 0,
  });
}

// Every section body the three hosts can render, with the props its host passes.
const SECTIONS: { name: string; load: () => Promise<(props: never) => unknown>; props: unknown }[] = [
  { name: "AuditorSection", load: async () => (await import("../src/app/portal/dev-team/auditor/_Section")).AuditorSection, props: {} },
  { name: "FindingsSection", load: async () => (await import("../src/app/portal/dev-team/findings/_Section")).FindingsSection, props: {} },
  { name: "LibrarySection", load: async () => (await import("../src/app/portal/dev-team/library/_Section")).LibrarySection, props: { searchParams: Promise.resolve({}) } },
  { name: "LogsSection", load: async () => (await import("../src/app/portal/dev-team/logs/_Section")).LogsSection, props: {} },
  { name: "UpdatesSection", load: async () => (await import("../src/app/portal/dev-team/updates/_Section")).UpdatesSection, props: {} },
  { name: "InspectorSection", load: async () => (await import("../src/app/portal/dev-team/inspector/_Section")).InspectorSection, props: {} },
  { name: "EditorSection", load: async () => (await import("../src/app/portal/dev-team/editor/_Section")).EditorSection, props: {} },
  { name: "ApiSection", load: async () => (await import("../src/app/portal/dev-team/api/_Section")).ApiSection, props: { searchParams: Promise.resolve({}) } },
];

describe("Dev Team sections — every body refuses a non-founder itself", () => {
  it("all eight 404 for an agency manager, even with Dev Mode on", async () => {
    const token = await managerSession();
    await withDevMode(async () => {
      for (const section of SECTIONS) {
        const body = await section.load();
        // Directly callable, so the host page's routing is not what protects
        // them — this is the real question.
        const outcome = await withSession(token, async () => {
          try {
            await body(section.props as never);
            return "rendered";
          } catch (error) {
            if (isNextNotFound(error)) return "404";
            if (isNextRedirect(error)) return "redirect";
            throw error;
          }
        });
        assert.equal(outcome, "404", `${section.name} must 404 an agency manager, not render for them`);
      }
    });
  });

  it("…and 404 outside Dev Mode too, whoever is asking", async () => {
    // The founder half. `devDocsAccessible` is `canUseDevMode() && isFounder`,
    // so with Dev Mode off even the owner is refused. No withDevMode here.
    await ensureHydrated();
    seq += 1;
    const agency = createAgency({ name: "Gate Co", slug: `gate-owner-${Date.now()}-${seq}` });
    const owner = createUser({
      email: `owner-${agency.id}@gate.test`, name: "Founder", role: "agency-owner",
      agencyId: agency.id, password: "gate-owner-pass",
    });
    const token = issueSession({
      userId: owner.id, email: owner.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    });

    for (const section of SECTIONS) {
      const body = await section.load();
      const outcome = await withSession(token, async () => {
        try {
          await body(section.props as never);
          return "rendered";
        } catch (error) {
          if (isNextNotFound(error)) return "404";
          if (isNextRedirect(error)) return "redirect";
          throw error;
        }
      });
      assert.equal(outcome, "404", `${section.name} must 404 outside Dev Mode`);
    }
  });
});

// ── the enumeration ─────────────────────────────────────────────────────────
//
// Spelled out so that adding a host, a stub or a view component is a DELIBERATE
// edit to this list rather than a silent pass.

/** Hosts that route to a gated section and are gate-free by design. */
const UNGATED_HOSTS = new Set([
  "tools/page.tsx",
  "findings/page.tsx",
  "library/page.tsx",
]);

/** Compatibility stubs from the restructure: they only `redirect()`. */
const REDIRECT_STUBS = new Set([
  "working/page.tsx", "auditor/page.tsx", "logs/page.tsx", "updates/page.tsx",
  "tasks/page.tsx", "inspector/page.tsx", "editor/page.tsx", "api/page.tsx",
]);

/** Shared, non-routable: the design kit. Renders nothing on its own. */
const NOT_A_SURFACE = new Set(["_ui.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(entry)) out.push(abs);
  }
  return out;
}

describe("Dev Team tree — nothing reachable is left ungated by accident", () => {
  it("every server surface under src/app/portal/dev-team/ carries the gate, or is a named exception", () => {
    const missing: string[] = [];
    for (const abs of walk(PORTAL_DIR)) {
      const rel = relative(PORTAL_DIR, abs).split("\\").join("/");
      const text = readFileSync(abs, "utf8");

      if (NOT_A_SURFACE.has(rel)) continue;
      // Client components cannot gate — their server parent does.
      if (/^"use client";/m.test(text)) continue;
      // Plain helpers with no JSX and no default export are not surfaces.
      if (!/\.tsx$/.test(rel)) continue;
      if (REDIRECT_STUBS.has(rel)) {
        assert.match(text, /redirect\(/, `${rel} is listed as a stub — it must actually redirect`);
        continue;
      }
      if (UNGATED_HOSTS.has(rel)) {
        // A host is only allowed to be gate-free because it renders a gated
        // section. If it ever renders anything else, this stops being true.
        assert.match(text, /Section\b/, `${rel} is listed as an ungated host — it must render a gated section`);
        continue;
      }
      // A view component imported by a section (no default export, not a page).
      const isRoute = /^(page|layout)\.tsx$/.test(rel.split("/").pop()!);
      const isSection = rel.endsWith("_Section.tsx");
      if (!isRoute && !isSection) continue;

      const gated = /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/.test(text)
        && /devDocsAccessible\(session\)/.test(text);
      if (!gated) missing.push(rel);
    }
    assert.deepEqual(missing, [], "these dev-team surfaces render without asking the founder gate");
  });

  it("every dev-team API route re-asserts the gate — a page gate protects a screen, not a write", () => {
    const missing: string[] = [];
    for (const abs of walk(API_DIR)) {
      const rel = relative(API_DIR, abs).split("\\").join("/");
      const text = readFileSync(abs, "utf8");
      if (!rel.endsWith("route.ts")) continue;
      const gated = /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/.test(text)
        && /devDocsAccessible\(session\)/.test(text);
      if (!gated) missing.push(rel);
    }
    assert.deepEqual(missing, [], "these dev-team write surfaces do not re-assert the founder gate");
  });

  it("the exception lists describe files that actually exist", () => {
    for (const rel of [...UNGATED_HOSTS, ...REDIRECT_STUBS, ...NOT_A_SURFACE]) {
      assert.doesNotThrow(() => statSync(join(PORTAL_DIR, rel)), `${rel} is listed as an exception but is not there`);
    }
  });
});

describe("Dev Team writes — one indistinguishable answer for everyone who is not the founder", () => {
  // The 404 exists so the workspace is INVISIBLE to anyone who is not the
  // founder. Non-founders with a session got that. An anonymous caller did not:
  // `requireRole` throws `AuthError`, the outer try/catch swallowed it, and the
  // handler answered 400 with the AuthError's own message. A genuinely
  // non-existent sibling endpoint answers 401 (from the catch-all), so the
  // 400-vs-401 difference was a reliable oracle for which dev-team endpoints are
  // real — the exact fact the 404 hides. It also mislabelled an expired session
  // as a client bad-request.
  const ROADMAP = "http://localhost/api/portal/dev-team/roadmap";

  const request = (method: string, body: unknown) => new Request(ROADMAP, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  it("an anonymous write is 401, never 400", async () => {
    const { POST, PATCH, DELETE } = await import("../src/app/api/portal/dev-team/roadmap/route");
    const cases: [string, (req: Request) => Promise<Response>, unknown][] = [
      ["POST", req => POST(req as never), { title: "Something" }],
      ["PATCH", req => PATCH(req as never), { id: "abc", title: "Something" }],
      ["DELETE", req => DELETE(req as never), { id: "abc" }],
    ];
    for (const [method, handler, body] of cases) {
      const response = await withRequestScope({}, () => handler(request(method, body)));
      assert.equal(response.status, 401, `${method} answers 401 to a caller with no credentials`);
      assert.notEqual(response.status, 400, `${method} must not name the endpoint as real`);
    }
  });

  it("…and GET, which already did, still does — the file is consistent with itself", async () => {
    const { GET } = await import("../src/app/api/portal/dev-team/roadmap/route");
    const response = await withRequestScope({}, () => GET());
    assert.equal(response.status, 401);
  });

  it("a signed-in non-founder still gets the in-band 404", async () => {
    const { POST } = await import("../src/app/api/portal/dev-team/roadmap/route");
    const token = await managerSession();
    const response = await withDevMode(() => withSession(token, () =>
      POST(request("POST", { title: "Something" }) as never)));
    assert.equal(response.status, 404);
    const body = await response.json() as { error?: string };
    assert.equal(body.error, "not_found");
  });
});
