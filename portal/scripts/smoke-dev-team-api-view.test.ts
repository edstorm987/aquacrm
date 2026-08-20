// The Dev Team "API & MCP" view must count the credentials that actually work.
//
// The header pills were derived purely from `listExternalAssistantApiKeys()`,
// which returns MANAGED keys only. The legacy environment token is a live,
// authenticating, full-scope credential for the very MCP server this page
// exists to describe — and it contributed nothing to either pill. On a machine
// with the env token set and no managed keys, the page rendered
// "0 active keys · 0 granted tools" while a bearer request with that token
// authenticated and received the full tool list. The inverse is worse: after
// revoking the last managed key to lock the workspace down, the page shows 0/0
// and looks locked while the env credential is untouched.
//
// This renders the REAL section for a founder in Dev Mode and reads the numbers
// off the returned element tree.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// First, and statically — see the note in dev-console-request-scope.ts.
import { restoreEnv, withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";

// Client components in this module graph reach for React.createContext, which
// the react-server build does not export. Stubbed so the graph loads.
import * as React from "react";
const reactShim = React as unknown as { createContext?: unknown; default?: { createContext?: unknown } };
const stubContext = () => ({ Provider: null, Consumer: null, _currentValue: undefined });
reactShim.createContext ??= stubContext;
if (reactShim.default) reactShim.default.createContext ??= stubContext;

import { issueSession } from "../src/lib/server/auth";
import { EXTERNAL_ASSISTANT_MODULES } from "../src/lib/server/externalAssistantApi";
import { createExternalAssistantApiKey } from "../src/lib/server/externalAssistantKeys";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";

const LEGACY_TOKEN = "legacy-env-token-that-is-long-enough-to-be-real";

let seq = 0;
async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Api View Co", slug: `api-view-${Date.now()}-${seq}` });
  const owner = createUser({
    email: `owner-${agency.id}@api-view.test`,
    name: "Founder",
    role: "agency-owner",
    agencyId: agency.id,
    password: "api-view-owner-pass",
  });
  return {
    agency,
    token: issueSession({
      userId: owner.id, email: owner.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: owner.sessionRev ?? 0,
    }),
  };
}

/**
 * The reading text of a rendered element tree.
 *
 * Recurses through EVERY prop that holds elements — the header pills this test
 * is about are passed to `PageHeader` as `meta`, and a children-only walk would
 * silently miss exactly the thing under test — but only collects the strings
 * sitting in `children`, so class names and icon sizes stay out of the reading.
 *
 * Joined with nothing, because JSX splits one sentence across several string
 * children (`{count} active key{count === 1 ? "" : "s"}`); whitespace is then
 * collapsed so source indentation does not change what it reads as.
 */
function renderedText(node: unknown): string {
  const out: string[] = [];
  const seen = new Set<unknown>();

  const walk = (value: unknown, inChildren: boolean) => {
    if (value === null || value === undefined || typeof value === "boolean" || typeof value === "function") return;
    if (typeof value === "string" || typeof value === "number") {
      if (inChildren) out.push(String(value));
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { for (const child of value) walk(child, inChildren); return; }
    const props = (value as { props?: Record<string, unknown> }).props;
    if (!props) return;
    for (const [name, prop] of Object.entries(props)) walk(prop, name === "children");
  };

  walk(node, true);
  return out.join("").replace(/\s+/g, " ");
}

/** Every `keys` array handed to a child component, wherever it sits in the tree. */
function keyViews(node: unknown, out: unknown[][] = [], seen = new Set<unknown>()): unknown[][] {
  if (!node || typeof node !== "object" || seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node)) { for (const child of node) keyViews(child, out, seen); return out; }
  const element = node as { props?: Record<string, unknown> };
  const view = element.props?.view as { keys?: unknown[] } | undefined;
  if (view && Array.isArray(view.keys)) out.push(view.keys);
  for (const value of Object.values(element.props ?? {})) {
    if (value && typeof value === "object") keyViews(value, out, seen);
  }
  return out;
}

async function renderApiSection(agencyId: string, token: string) {
  const saved = {
    token: process.env.AQUACRM_ASSISTANT_API_TOKEN,
    legacy: process.env.MILESYMEDIA_ASSISTANT_API_TOKEN,
    agency: process.env.AQUACRM_ASSISTANT_AGENCY_ID,
    legacyAgency: process.env.MILESYMEDIA_ASSISTANT_AGENCY_ID,
  };
  process.env.AQUACRM_ASSISTANT_API_TOKEN = LEGACY_TOKEN;
  process.env.AQUACRM_ASSISTANT_AGENCY_ID = agencyId;
  delete process.env.MILESYMEDIA_ASSISTANT_API_TOKEN;
  delete process.env.MILESYMEDIA_ASSISTANT_AGENCY_ID;
  try {
    const { ApiSection } = await import("../src/app/portal/dev-team/api/_Section");
    return await withDevMode(() => withSession(token, () =>
      ApiSection({ searchParams: Promise.resolve({}) }) as Promise<unknown>));
  } finally {
    restoreEnv("AQUACRM_ASSISTANT_API_TOKEN", saved.token);
    restoreEnv("MILESYMEDIA_ASSISTANT_API_TOKEN", saved.legacy);
    restoreEnv("AQUACRM_ASSISTANT_AGENCY_ID", saved.agency);
    restoreEnv("MILESYMEDIA_ASSISTANT_AGENCY_ID", saved.legacyAgency);
  }
}

describe("API & MCP view — the live environment credential is counted, not hidden", () => {
  it("with NO managed keys, the page does not claim the workspace is locked", async () => {
    const { agency, token } = await founder();
    const rendered = await renderApiSection(agency.id, token);
    const text = renderedText(rendered);

    assert.doesNotMatch(text, /0 active keys/, "an env token that authenticates is not zero keys");
    assert.match(text, /1 active key(?!s)/, "it is counted, singular");
    assert.match(text, /from the environment/, "…and marked as the kind of credential it is");
    assert.doesNotMatch(text, /0 granted tools/, "a full-scope credential does not grant nothing");
  });

  it("the environment key is listed with the tools a real bearer request receives", async () => {
    const { agency, token } = await founder();
    const rendered = await renderApiSection(agency.id, token);
    const lists = keyViews(rendered);
    assert.ok(lists.length > 0, "the MCP panel is handed a key list");

    const keys = lists[0] as {
      id: string; status: string; unmanaged?: boolean; modules: string[]; tools: unknown[];
    }[];
    const env = keys.find(key => key.unmanaged);
    assert.ok(env, "the environment credential appears as a row of its own");
    assert.equal(env!.status, "active", "it authenticates right now — anything softer would be the same lie");
    assert.deepEqual(
      [...env!.modules].sort(),
      [...EXTERNAL_ASSISTANT_MODULES].sort(),
      "unmanaged tokens get every module, exactly as authenticateExternalAssistant grants",
    );
    assert.ok(env!.tools.length > 0, "…and the tools that scope really exposes");
  });

  it("a managed key and the env key are both counted", async () => {
    const { agency, token } = await founder();
    createExternalAssistantApiKey({
      agencyId: agency.id,
      name: "Managed reader",
      modules: ["clients"],
      permissions: ["records:read", "advisor:read"],
      createdBy: "owner@api-view.test",
    });
    const rendered = await renderApiSection(agency.id, token);
    const text = renderedText(rendered);
    assert.match(text, /2 active keys/, "one managed + one environment");

    const keys = keyViews(rendered)[0] as { unmanaged?: boolean }[];
    assert.equal(keys.filter(key => key.unmanaged).length, 1);
    assert.equal(keys.filter(key => !key.unmanaged).length, 1);
  });

  it("an env token pointed at ANOTHER agency is not counted here", async () => {
    // The credential only authenticates as its configured agency. Counting it on
    // a workspace it cannot reach would be the same dishonesty in reverse.
    const { agency, token } = await founder();
    const rendered = await renderApiSection("some-other-agency", token);
    const text = renderedText(rendered);
    assert.match(text, /0 active keys/, "not this workspace's credential");
    assert.doesNotMatch(text, /from the environment/);
  });
});
