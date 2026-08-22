// AQUA EDITOR AI — its own token, its own config, per project.
//
// Ed, verbatim: "aqua editor ai needs to be its only thing please now. needs a
// seperate tocken please to configure please. it needs its own thing and its
// saved per project this one is."
//
// This file pins the SECURITY half of that sentence, which is the half that
// goes wrong quietly. Four properties, each asserted from both sides:
//
//   1. THE KEY NEVER LEAVES THE SERVER. Not in `EditorAiStatus`, not in a route
//      response — not even on the request that just set it, which is exactly
//      the moment a value ends up in a screenshot — and not in plaintext
//      anywhere in `PortalState`.
//
//   2. IT IS GENUINELY SEPARATE FROM THE AGENCY ASSISTANT. A key pasted for the
//      editor must not turn the Aqua Advisor on, and the Advisor's key must not
//      turn the editor on. They are different provider kinds in the vault so
//      that this is structural rather than a convention.
//
//   3. IT IS PER PROJECT. Two projects in ONE agency hold two independent keys;
//      configuring one says nothing about the other.
//
//   4. IT IS TENANT-SCOPED, AGENCY BEFORE PROJECT. A project id from another
//      agency resolves nothing — no config, no model, no token — and cannot be
//      written to. This matches how `devProjects.assertConnection` guards, and
//      it is the check that stops a guessed id reaching a decrypt.

// First, and statically — see the note in dev-console-request-scope.ts.
import { withDevMode, withSession } from "./dev-console-request-scope";

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
process.env.PORTAL_VAULT_ENCRYPTION_KEY ??= "aqua-editor-ai-smoke-vault-key-longer-than-thirty-two-chars";

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDITOR_AI_DEFAULT_MODEL,
  EDITOR_AI_PROVIDER,
  clearEditorAiToken,
  editorAiConfigured,
  editorAiModel,
  editorAiReason,
  editorAiStatus,
  forgetEditorAiForProject,
  getEditorAiConfig,
  resolveEditorAiToken,
  saveEditorAiConfig,
  setEditorAiToken,
} from "../src/engines/editor/server/editorAi";
import { saveDevProject } from "../src/engines/editor/server/devProjects";
import {
  listIntegrationConnections,
  resolveIntegrationValues,
  revokeIntegrationConnection,
  saveIntegrationConnection,
  testIntegrationConnection,
} from "../src/lib/server/integrations/integrationConnections";
import { isAssistantConfigured } from "../src/lib/server/assistants/openaiAssistant";
import * as editorAiRoute from "../src/app/api/portal/dev/editor-ai/route";
import * as integrationsRoute from "../src/app/api/portal/settings/integrations/route";
import { issueSession } from "../src/lib/server/auth/auth";
import { ensureHydrated, getState } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { EditorAiStatus } from "../src/server/types";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

// A key shaped like the real thing, long enough to be maskable. Invented for
// this test — never a real credential.
const EDITOR_KEY = "sk-editor-test-000000000000000000000000000abcd";
const OTHER_EDITOR_KEY = "sk-editor-test-111111111111111111111111111wxyz";
const AGENCY_ASSISTANT_KEY = "sk-agency-advisor-2222222222222222222222efgh";

let seq = 0;

async function founder() {
  await ensureHydrated();
  seq += 1;
  const agency = createAgency({ name: "Editor AI Co", slug: `editor-ai-${Date.now()}-${seq}` });
  const user = createUser({
    email: `owner-${agency.id}@editor-ai.test`,
    name: "Operator",
    role: "agency-owner",
    agencyId: agency.id,
    password: "editor-ai-operator-pass",
  });
  return {
    agencyId: agency.id,
    userId: user.id,
    token: issueSession({
      userId: user.id, email: user.email, role: "agency-owner",
      agencyId: agency.id, agencyIds: [agency.id], activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    }),
  };
}

function projectFor(agencyId: string, userId: string, name = "Editor AI project") {
  return saveDevProject({ agencyId, name, actorUserId: userId });
}

type RouteBody = {
  ok?: boolean;
  error?: string;
  reason?: string;
  status?: EditorAiStatus;
  vaultAvailable?: boolean;
};

async function send(token: string, body: unknown): Promise<{ status: number; raw: string; body: RouteBody }> {
  const response = await withDevMode(() => withSession(token, () => editorAiRoute.POST(new Request(
    "http://localhost/api/portal/dev/editor-ai",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  ))));
  const raw = await response.text();
  return { status: response.status, raw, body: JSON.parse(raw) as RouteBody };
}

before(async () => {
  await ensureHydrated();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Aqua Editor AI — the token is a secret and stays one", () => {
  it("stores the key in the encrypted vault, never on the project or the config", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);

    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });

    const config = getEditorAiConfig(agencyId, project.id);
    assert.ok(config?.connectionId, "the config holds a vault id");
    assert.ok(!JSON.stringify(config).includes(EDITOR_KEY), "the config must not carry the key");

    const stored = getState().devProjects[project.id];
    assert.ok(!JSON.stringify(stored).includes(EDITOR_KEY), "the DevProject record must not carry the key");

    // The whole blob, which is what gets written to disk and to Supabase.
    assert.ok(
      !JSON.stringify(getState()).includes(EDITOR_KEY),
      "the plaintext key must not appear anywhere in PortalState — the vault encrypts before storage",
    );
  });

  it("resolves the key server-side, and reports only a masked tail to a screen", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });

    assert.equal(resolveEditorAiToken(agencyId, project.id), EDITOR_KEY, "the server can still use it");

    const status = editorAiStatus(agencyId, project.id);
    assert.equal(status.configured, true);
    assert.equal(status.tokenHint, `••••${EDITOR_KEY.slice(-4)}`, "the last four, and nothing else");
    assert.ok(!JSON.stringify(status).includes(EDITOR_KEY), "the client-safe view carries no key");
    // Belt and braces: a hint that leaked half the key would still pass the
    // line above, because the hint IS a substring of the key.
    assert.ok(status.tokenHint!.length <= 8, "a hint must be a hint, not a fraction of the secret");
  });

  it("gives no hint at all for a key too short to hint at", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: "sk-tiny", actorUserId: userId });
    const status = editorAiStatus(agencyId, project.id);
    assert.equal(status.configured, true, "a short key still configures it");
    assert.equal(status.tokenHint, undefined, "four of seven characters is not a hint");
  });
});

describe("Aqua Editor AI — separate from the agency assistant, structurally", () => {
  it("files the key under its OWN provider kind, not openai", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });

    const connections = listIntegrationConnections(agencyId);
    assert.equal(connections.length, 1);
    assert.equal(connections[0].provider, EDITOR_AI_PROVIDER);
    assert.notEqual(connections[0].provider, "openai");
    assert.deepEqual(connections[0].configuredSecretFields, ["apiKey"],
      "the listing names WHICH fields are set, never their values");
  });

  it("does not switch the Aqua Advisor on — the editor's key is not the agency's", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });

    // `resolveIntegrationValues(agencyId, "openai")` is how the Advisor and the
    // Librarian find their key. It selects by PROVIDER, so a shared kind would
    // have let whichever was saved last win.
    assert.equal(resolveIntegrationValues(agencyId, "openai", { includeEnvironmentFallback: false }).apiKey, undefined);
    assert.equal(isAssistantConfigured(agencyId), false,
      "an editor key must not report the agency assistant as configured");
  });

  it("…and the Advisor's key does not switch the editor on", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    saveIntegrationConnection({
      agencyId,
      provider: "openai",
      label: "Agency assistant",
      values: { apiKey: AGENCY_ASSISTANT_KEY, model: "gpt-5-mini" },
      actorUserId: userId,
    });

    assert.equal(isAssistantConfigured(agencyId), true, "the Advisor is configured");
    assert.equal(editorAiConfigured(agencyId, project.id), false,
      "…and Aqua Editor AI is still off, because it has its own token");
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
    assert.match(editorAiReason(agencyId, project.id), /own token/i);
  });

  it("never falls back to the environment, even for the founder's own agency", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    const saved = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-environment-key-must-not-be-borrowed-0000";
    try {
      assert.equal(resolveEditorAiToken(agencyId, project.id), null,
        "OPENAI_API_KEY is the agency assistant's credential, not every project's");
      assert.equal(editorAiConfigured(agencyId, project.id), false);
    } finally {
      if (saved === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = saved;
    }
  });
});

describe("Aqua Editor AI — saved per project", () => {
  it("gives two projects in one agency two independent keys", async () => {
    const { agencyId, userId } = await founder();
    const first = projectFor(agencyId, userId, "First");
    const second = projectFor(agencyId, userId, "Second");

    setEditorAiToken({ agencyId, projectId: first.id, apiKey: EDITOR_KEY, model: "gpt-5", actorUserId: userId });
    setEditorAiToken({ agencyId, projectId: second.id, apiKey: OTHER_EDITOR_KEY, model: "gpt-5-mini", actorUserId: userId });

    assert.equal(resolveEditorAiToken(agencyId, first.id), EDITOR_KEY);
    assert.equal(resolveEditorAiToken(agencyId, second.id), OTHER_EDITOR_KEY);
    assert.equal(editorAiModel(agencyId, first.id), "gpt-5");
    assert.equal(editorAiModel(agencyId, second.id), "gpt-5-mini");
  });

  it("configuring one project says nothing about the next", async () => {
    const { agencyId, userId } = await founder();
    const configured = projectFor(agencyId, userId, "Configured");
    const untouched = projectFor(agencyId, userId, "Untouched");
    setEditorAiToken({ agencyId, projectId: configured.id, apiKey: EDITOR_KEY, actorUserId: userId });

    assert.equal(editorAiConfigured(agencyId, configured.id), true);
    assert.equal(editorAiConfigured(agencyId, untouched.id), false);
    assert.equal(editorAiModel(agencyId, untouched.id), EDITOR_AI_DEFAULT_MODEL);
    assert.equal(getEditorAiConfig(agencyId, untouched.id), null, "an unconfigured project has no record at all");
  });

  it("keeps ONE connection per project however many times a key is re-pasted", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });
    const firstId = getEditorAiConfig(agencyId, project.id)!.connectionId;

    setEditorAiToken({ agencyId, projectId: project.id, apiKey: OTHER_EDITOR_KEY, actorUserId: userId });
    const secondId = getEditorAiConfig(agencyId, project.id)!.connectionId;

    assert.equal(secondId, firstId, "re-pasting updates the project's connection, it does not mint another");
    assert.equal(listIntegrationConnections(agencyId).length, 1, "no orphaned credentials accumulate");
    assert.equal(resolveEditorAiToken(agencyId, project.id), OTHER_EDITOR_KEY, "the new key is in force");
  });

  it("changing the model or the brief never touches the token", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });

    const status = saveEditorAiConfig({
      agencyId, projectId: project.id, model: "gpt-5", instructions: "This is a Next.js repo.", actorUserId: userId,
    });
    assert.equal(status.model, "gpt-5");
    assert.equal(status.instructions, "This is a Next.js repo.");
    assert.equal(status.configured, true);
    assert.equal(resolveEditorAiToken(agencyId, project.id), EDITOR_KEY, "the key survives a config change untouched");
  });

  it("clears the key and revokes the vault connection, keeping the setup", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, model: "gpt-5", actorUserId: userId });
    saveEditorAiConfig({ agencyId, projectId: project.id, instructions: "Keep me.", actorUserId: userId });

    const cleared = clearEditorAiToken({ agencyId, projectId: project.id, actorUserId: userId });
    assert.equal(cleared.configured, false);
    assert.equal(cleared.tokenHint, undefined);
    assert.equal(cleared.model, "gpt-5", "clearing a key is not forgetting the setup");
    assert.equal(cleared.instructions, "Keep me.");
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
    assert.equal(listIntegrationConnections(agencyId).length, 0, "the credential is gone from the vault, not just unbound");
  });

  it("reports itself unconfigured when the connection is revoked underneath it", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });
    const connectionId = getEditorAiConfig(agencyId, project.id)!.connectionId!;

    // Somebody revokes it from Settings → Integrations. The id survives on the
    // config; the credential does not. "Configured" must follow the credential,
    // or the editor renders an enabled composer that fails on send.
    revokeIntegrationConnection({ agencyId, connectionId, actorUserId: userId });

    assert.ok(getEditorAiConfig(agencyId, project.id)?.connectionId, "the id is still recorded");
    assert.equal(editorAiConfigured(agencyId, project.id), false, "…but it is not configured");
    assert.equal(editorAiStatus(agencyId, project.id).configured, false);
    assert.match(editorAiReason(agencyId, project.id), /removed from the integrations vault/i);
  });

  it("deletes the assistant with the project, so no credential outlives its only user", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });

    forgetEditorAiForProject({ agencyId, projectId: project.id, actorUserId: userId });

    assert.equal(getEditorAiConfig(agencyId, project.id), null);
    assert.equal(listIntegrationConnections(agencyId).length, 0);
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
  });
});

describe("Aqua Editor AI — tenant scoped, agency checked BEFORE project", () => {
  it("resolves nothing for another agency holding the right project id", async () => {
    const mine = await founder();
    const theirs = await founder();
    const project = projectFor(mine.agencyId, mine.userId);
    setEditorAiToken({ agencyId: mine.agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: mine.userId });

    assert.equal(resolveEditorAiToken(theirs.agencyId, project.id), null, "a guessed project id must not reach a decrypt");
    assert.equal(editorAiConfigured(theirs.agencyId, project.id), false);
    assert.equal(getEditorAiConfig(theirs.agencyId, project.id), null);
    assert.equal(editorAiModel(theirs.agencyId, project.id), EDITOR_AI_DEFAULT_MODEL, "not even the model leaks");
    assert.equal(editorAiStatus(theirs.agencyId, project.id).projectId, "", "the status refuses to name a foreign project");
  });

  it("refuses to WRITE to another agency's project", async () => {
    const mine = await founder();
    const theirs = await founder();
    const project = projectFor(mine.agencyId, mine.userId);

    for (const attempt of [
      () => setEditorAiToken({ agencyId: theirs.agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: theirs.userId }),
      () => saveEditorAiConfig({ agencyId: theirs.agencyId, projectId: project.id, model: "gpt-5", actorUserId: theirs.userId }),
      () => clearEditorAiToken({ agencyId: theirs.agencyId, projectId: project.id, actorUserId: theirs.userId }),
    ]) {
      assert.throws(attempt, /project_not_found/, "a cross-tenant write must not land");
    }
    assert.equal(getEditorAiConfig(mine.agencyId, project.id), null, "…and nothing was written under the real owner either");
  });

  it("cannot be reached by hijacking another agency's vault connection id", async () => {
    const mine = await founder();
    const theirs = await founder();
    const project = projectFor(mine.agencyId, mine.userId);
    // Their credential, in their agency.
    const theirConnection = saveIntegrationConnection({
      agencyId: theirs.agencyId,
      provider: EDITOR_AI_PROVIDER,
      label: "Theirs",
      values: { apiKey: OTHER_EDITOR_KEY, model: "gpt-5" },
      actorUserId: theirs.userId,
    });
    // My project pointing at it — which is only reachable by editing state by
    // hand, and must still resolve nothing.
    setEditorAiToken({ agencyId: mine.agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: mine.userId });
    getState().editorAiConfigs[`${mine.agencyId}|${project.id}`].connectionId = theirConnection.id;

    assert.equal(resolveEditorAiToken(mine.agencyId, project.id), null,
      "resolveIntegrationConnectionValues checks the agency on the connection, so a foreign id yields nothing");
    assert.equal(editorAiConfigured(mine.agencyId, project.id), false);
  });
});

describe("Aqua Editor AI — the configuration endpoint", () => {
  it("has no GET at all — the route that handles a credential has nothing to widen", () => {
    assert.equal("GET" in editorAiRoute, false, "reading is action:'status' on the POST, on purpose");
    assert.equal(typeof editorAiRoute.POST, "function");
  });

  it("sets a key and answers with the safe view — never the value", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);

    const result = await send(token, { action: "set-token", projectId: project.id, apiKey: EDITOR_KEY, model: "gpt-5" });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.status?.configured, true);
    assert.equal(result.body.status?.model, "gpt-5");
    assert.ok(
      !result.raw.includes(EDITOR_KEY),
      "the response that just accepted a key must not echo it — that is the screenshot moment",
    );
    // …and the server really did keep it.
    assert.equal(resolveEditorAiToken(agencyId, project.id), EDITOR_KEY);
  });

  it("reads the gate back without a GET, and still never carries the value", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    await send(token, { action: "set-token", projectId: project.id, apiKey: EDITOR_KEY });

    const result = await send(token, { action: "status", projectId: project.id });
    assert.equal(result.status, 200);
    assert.equal(result.body.status?.configured, true);
    assert.equal(result.body.status?.tokenHint, `••••${EDITOR_KEY.slice(-4)}`);
    assert.ok(!result.raw.includes(EDITOR_KEY));
  });

  it("clears a key over the wire", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    await send(token, { action: "set-token", projectId: project.id, apiKey: EDITOR_KEY });

    const result = await send(token, { action: "clear-token", projectId: project.id });
    assert.equal(result.status, 200);
    assert.equal(result.body.status?.configured, false);
    assert.match(result.body.reason ?? "", /no key for this project yet/i);
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
  });

  it("ignores a key sent to the config action — one action writes credentials", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);

    const result = await send(token, { action: "save", projectId: project.id, model: "gpt-5", apiKey: EDITOR_KEY });
    assert.equal(result.status, 200);
    assert.equal(result.body.status?.model, "gpt-5");
    assert.equal(result.body.status?.configured, false, "a key smuggled into 'save' must not configure anything");
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
  });

  it("404s a project from another agency rather than confirming it exists", async () => {
    const mine = await founder();
    const theirs = await founder();
    const project = projectFor(theirs.agencyId, theirs.userId);

    for (const action of ["status", "save", "set-token", "clear-token"]) {
      const result = await send(mine.token, { action, projectId: project.id, apiKey: EDITOR_KEY, model: "gpt-5" });
      assert.equal(result.status, 404, `${action} must not resolve a cross-tenant project`);
    }
    assert.equal(resolveEditorAiToken(theirs.agencyId, project.id), null, "…and nothing was written to it");
  });

  it("asks which project when none is named, and refuses an empty key", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    assert.equal((await send(token, { action: "status" })).status, 400);
    assert.equal((await send(token, { action: "set-token", projectId: project.id, apiKey: "   " })).status, 400);
    assert.equal((await send(token, { projectId: project.id })).status, 400, "no action");
  });

  it("is behind the same gate as the rest of the dev surface — no Dev Mode, no config", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    // The same request, WITHOUT withDevMode.
    const response = await withSession(token, () => editorAiRoute.POST(new Request(
      "http://localhost/api/portal/dev/editor-ai",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-token", projectId: project.id, apiKey: EDITOR_KEY }),
      },
    )));
    assert.equal(response.status, 403);
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
  });

  it("refuses a cross-origin write", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    const response = await withDevMode(() => withSession(token, () => editorAiRoute.POST(new Request(
      "http://localhost/api/portal/dev/editor-ai",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.test" },
        body: JSON.stringify({ action: "set-token", projectId: project.id, apiKey: EDITOR_KEY }),
      },
    ))));
    assert.equal(response.status, 403);
    assert.equal(resolveEditorAiToken(agencyId, project.id), null);
  });
});

describe("Aqua Editor AI — the configuration survives a restart", () => {
  it("is rebuilt by storage's empty() and parseBlob", () => {
    // `parseBlob` rebuilds PortalState field by field with no spread, so a
    // collection missing there is DESTROYED on every hydration. The generic
    // guard lives in smoke-state-roundtrip; this names THIS collection so a
    // failure points straight here.
    const storage = read("src", "server", "storage.ts");
    assert.match(storage, /^\s+editorAiConfigs: \{\},$/m, "empty() must start it");
    assert.match(storage, /^\s+editorAiConfigs: parsed\.editorAiConfigs \?\? \{\},$/m, "parseBlob must rebuild it");
  });

  it("keys itself by agency AND project, so a project id alone names nothing", async () => {
    const { agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: EDITOR_KEY, actorUserId: userId });
    assert.ok(getState().editorAiConfigs[`${agencyId}|${project.id}`], "keyed `${agencyId}|${projectId}`");
    assert.equal(getState().editorAiConfigs[project.id], undefined, "never keyed by the project alone");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Aqua Editor AI — a provider echoing the key back cannot put it on screen", () => {
  // OpenAI's real 401 echoes the key: "Incorrect API key provided: sk-proj-…".
  // The scrubber used to demand an UNDERSCORE after the prefix, so the
  // hyphenated OpenAI format — the exact format this feature runs on — went to
  // `lastTestMessage` in plaintext, was flushed with the state document,
  // served by the integrations GET and rendered in the settings panel. This
  // is that whole chain, asserted at both ends.
  const LEAKY_KEY = "sk-proj-LEAKY0000000000000000000000000000abcd";

  it("redacts an sk-proj key from a 401 echo — state blob and integrations GET, end to end", async () => {
    const { token, agencyId, userId } = await founder();
    const project = projectFor(agencyId, userId);
    setEditorAiToken({ agencyId, projectId: project.id, apiKey: LEAKY_KEY, actorUserId: userId });
    const connectionId = getEditorAiConfig(agencyId, project.id)!.connectionId!;

    const echoing401 = (async () => Response.json(
      { error: { message: `Incorrect API key provided: ${LEAKY_KEY}. You can find your API key at platform.openai.com.` } },
      { status: 401 },
    )) as typeof fetch;
    const tested = await testIntegrationConnection(agencyId, connectionId, { userId }, echoing401);

    assert.equal(tested.lastTestStatus, "failed");
    assert.match(tested.lastTestMessage ?? "", /\[redacted\]/, "the failure is still reported, scrubbed");
    assert.ok(!(tested.lastTestMessage ?? "").includes(LEAKY_KEY), "…without the key in it");

    // NOWHERE in the state document that flushes to disk and Supabase…
    assert.ok(!JSON.stringify(getState()).includes(LEAKY_KEY), "the plaintext key must not reach persisted state");

    // …and nowhere in what the settings screen is served.
    const response = await withSession(token, () => integrationsRoute.GET());
    assert.equal(response.status, 200);
    const raw = await response.text();
    assert.ok(!raw.includes(LEAKY_KEY), "the integrations GET must not serve the key");
    assert.match(raw, /\[redacted\]/, "the scrubbed sentence is what the panel gets to show");
  });

  it("covers prefixless secrets by exact value — a Vercel token has no shape to match", async () => {
    const { agencyId, userId } = await founder();
    const VERCEL_TOKEN = "vTok3nWithoutAnyPrefix1234567890";
    const saved = saveIntegrationConnection({
      agencyId, provider: "vercel", values: { token: VERCEL_TOKEN }, actorUserId: userId,
    });
    const echoing = (async () => Response.json(
      { error: { message: `Invalid bearer token "${VERCEL_TOKEN}" supplied.` } },
      { status: 403 },
    )) as typeof fetch;
    const tested = await testIntegrationConnection(agencyId, saved.id, { userId }, echoing);

    assert.equal(tested.lastTestStatus, "failed");
    assert.ok(!(tested.lastTestMessage ?? "").includes(VERCEL_TOKEN), "the exact decrypted value is scrubbed");
    assert.match(tested.lastTestMessage ?? "", /\[redacted\]/);
    assert.ok(!JSON.stringify(getState()).includes(VERCEL_TOKEN));
  });
});
