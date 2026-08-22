import "server-only";

import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type { EditorAiConfig, EditorAiStatus } from "@/server/types";
import {
  getIntegrationConnection,
  resolveIntegrationConnectionValues,
  revokeIntegrationConnection,
  saveIntegrationConnection,
} from "@/lib/server/integrations/integrationConnections";
import { getDevProject } from "@/engines/editor/server/devProjects";

// ─── AQUA EDITOR AI — its own configuration, its own token, per project ──────
//
// Ed, verbatim: "aqua editor ai needs to be its only thing please now. needs a
// seperate tocken please to configure please. it needs its own thing and its
// saved per project this one is."
//
// This module is the whole of "its own token". It holds, per DevProject, the
// model Aqua Editor AI runs on, the brief it is given, and the VAULT ID of the
// key it runs on. It does not hold the key.
//
// ── The one rule that matters ────────────────────────────────────────────────
//
// `resolveEditorAiToken` is the ONLY function here that ever sees a credential,
// it is `server-only`, and its return value must never be handed to a prop, a
// response body, or a log line. Everything a screen is allowed to know is
// `editorAiStatus`, which is a different shape with no field a token could
// occupy — so leaking one is a compile error rather than a code review.
//
// ── Why the vault, and why a NEW provider kind ───────────────────────────────
//
// This codebase already has exactly one home for a secret: the encrypted
// integrations vault (`integrationConnections`), which is where `DevProject`
// already keeps its GitHub and Vercel credentials by id. Hand-rolling a second
// store — a second AES key, a second decrypt path, a second thing to get wrong
// — is the mistake this reuses its way out of.
//
// The provider kind is NEW (`aqua-editor-ai`) rather than a second `openai`
// connection, and that is load-bearing: `resolveIntegrationValues(agencyId,
// "openai")` is how the Aqua Advisor and the Dev Team Librarian find their key,
// and it selects by PROVIDER. Sharing the kind would have let the editor's key
// be picked up as the Advisor's and the Advisor's as the editor's, depending on
// which was saved last. Separate kinds make that impossible instead of unlikely.
//
// ── Tenant scoping ───────────────────────────────────────────────────────────
//
// Agency BEFORE project, on every path, matching how `devProjects.ts` guards
// (`assertConnection` checks the tenant first). A project id on its own is
// never enough to reach a configuration, a model, or a token: `assertProject`
// resolves through `getDevProject(agencyId, projectId)`, which returns null
// when the project belongs to somebody else, and the storage key is prefixed
// with the agency so even a direct read cannot cross tenants.

/** The vault provider kind this assistant's credential lives under. */
export const EDITOR_AI_PROVIDER = "aqua-editor-ai" as const;

/** What Aqua Editor AI runs on when nobody has chosen. */
export const EDITOR_AI_DEFAULT_MODEL = "gpt-5-mini";

/** Below this a "masked tail" would be most of the key, so there is no hint. */
const MIN_HINTABLE_TOKEN = 12;

function clean(value: string | undefined, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * The storage key. Agency first, so a scan of the collection sorts by tenant
 * and a project id alone names nothing.
 */
function configKey(agencyId: string, projectId: string): string {
  return `${agencyId}|${projectId}`;
}

/**
 * The project, or a refusal — tenant checked FIRST.
 *
 * `getDevProject` compares `project.agencyId === agencyId` before returning,
 * so a project id belonging to another agency comes back null here and never
 * reaches a configuration or a vault lookup.
 */
function assertProject(agencyId: string, projectId: string) {
  const id = clean(projectId, 120);
  if (!id) throw new Error("project_required");
  const project = getDevProject(agencyId, id);
  if (!project) throw new Error("project_not_found");
  return project;
}

/**
 * This project's configuration, or null.
 *
 * The agency is checked twice on purpose: once through `assertProject` at the
 * write paths, and again here against the stored record. A key collision or a
 * hand-edited state file must not be able to hand one agency another's row.
 */
export function getEditorAiConfig(agencyId: string, projectId: string): EditorAiConfig | null {
  const stored = getState().editorAiConfigs?.[configKey(agencyId, projectId)];
  if (!stored) return null;
  return stored.agencyId === agencyId && stored.projectId === projectId ? stored : null;
}

function writeConfig(
  agencyId: string,
  projectId: string,
  actorUserId: string,
  updater: (config: EditorAiConfig) => void,
  now = Date.now(),
): EditorAiConfig {
  const id = configKey(agencyId, projectId);
  let saved!: EditorAiConfig;
  mutate(state => {
    state.editorAiConfigs ??= {};
    const existing = state.editorAiConfigs[id];
    const config: EditorAiConfig = existing && existing.agencyId === agencyId
      ? { ...existing }
      : {
        id,
        agencyId,
        projectId,
        model: EDITOR_AI_DEFAULT_MODEL,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        createdAt: now,
        updatedAt: now,
      };
    updater(config);
    config.id = id;
    config.agencyId = agencyId;
    config.projectId = projectId;
    config.updatedBy = actorUserId;
    config.updatedAt = now;
    state.editorAiConfigs[id] = config;
    saved = config;
  });
  return saved;
}

export interface SaveEditorAiConfigInput {
  agencyId: string;
  projectId: string;
  /** Blank keeps whatever is already set; a value replaces it. */
  model?: string;
  /** An empty string CLEARS the brief; `undefined` leaves it alone. */
  instructions?: string;
  actorUserId: string;
  actorEmail?: string;
  now?: number;
}

/**
 * Set the model and the brief. Never touches the token.
 *
 * Split from `setEditorAiToken` deliberately: changing which model a project
 * talks to should not require re-pasting a key, and re-pasting a key should not
 * be able to quietly rewrite the brief.
 */
export function saveEditorAiConfig(input: SaveEditorAiConfigInput): EditorAiStatus {
  const project = assertProject(input.agencyId, input.projectId);
  const model = clean(input.model, 120);
  const config = writeConfig(input.agencyId, project.id, input.actorUserId, draft => {
    if (model) draft.model = model;
    if (typeof input.instructions === "string") {
      draft.instructions = clean(input.instructions, 4_000) || undefined;
    }
  }, input.now);

  // Keep the vault card honest. The connection's own `model` field is required
  // by the catalog definition, so a card left on the old value would tell an
  // operator the wrong thing. The secret is NOT re-sent — `saveIntegrationConnection`
  // leaves an existing encrypted secret in place when no new value arrives —
  // so this cannot round-trip a key through memory to change a text field.
  if (config.connectionId && getIntegrationConnection(input.agencyId, config.connectionId)) {
    saveIntegrationConnection({
      agencyId: input.agencyId,
      connectionId: config.connectionId,
      provider: EDITOR_AI_PROVIDER,
      label: editorAiConnectionLabel(project.name),
      values: { model: config.model },
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
    });
  }
  return editorAiStatus(input.agencyId, project.id);
}

function editorAiConnectionLabel(projectName: string): string {
  return `Aqua Editor AI — ${clean(projectName, 90) || "project"}`;
}

export interface SetEditorAiTokenInput {
  agencyId: string;
  projectId: string;
  /** The key Ed pastes. Encrypted into the vault; never stored here. */
  apiKey: string;
  model?: string;
  instructions?: string;
  actorUserId: string;
  actorEmail?: string;
  now?: number;
}

/**
 * Paste this project's key.
 *
 * The value goes straight into `saveIntegrationConnection`, which encrypts it
 * before it touches state, and what comes back to this module is an ID. The
 * key is not returned, not logged, and not kept in the config record.
 *
 * Re-pasting UPDATES the project's existing connection rather than minting a
 * second one, so a project accumulates exactly one editor credential and
 * "clear" has exactly one thing to revoke. A connection that has been revoked
 * from the integrations screen underneath us is detected here and replaced,
 * rather than throwing at the operator for a state they did not create.
 */
export function setEditorAiToken(input: SetEditorAiTokenInput): EditorAiStatus {
  const project = assertProject(input.agencyId, input.projectId);
  const apiKey = clean(input.apiKey, 20_000);
  if (!apiKey) throw new Error("token_required");

  const existing = getEditorAiConfig(input.agencyId, project.id);
  const model = clean(input.model, 120) || existing?.model || EDITOR_AI_DEFAULT_MODEL;
  const reusable = existing?.connectionId && getIntegrationConnection(input.agencyId, existing.connectionId)
    ? existing.connectionId
    : undefined;

  const connection = saveIntegrationConnection({
    agencyId: input.agencyId,
    connectionId: reusable,
    provider: EDITOR_AI_PROVIDER,
    label: editorAiConnectionLabel(project.name),
    values: { apiKey, model },
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
  });

  writeConfig(input.agencyId, project.id, input.actorUserId, draft => {
    draft.connectionId = connection.id;
    draft.model = model;
    if (typeof input.instructions === "string") {
      draft.instructions = clean(input.instructions, 4_000) || undefined;
    }
  }, input.now);

  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "settings",
    action: "editor_ai.token_set",
    // No value, no hint, no length. An activity feed is read by more people
    // than a vault is.
    message: `Set the Aqua Editor AI key for ${project.name}.`,
    metadata: { projectId: project.id, connectionId: connection.id, model },
  });
  return editorAiStatus(input.agencyId, project.id);
}

/**
 * Remove this project's key.
 *
 * Revokes the vault connection AND unbinds it, in that order, so a failure
 * cannot leave the project pointing at a credential it no longer owns. The
 * model and the brief survive — clearing a key is not "forget the setup".
 */
export function clearEditorAiToken(input: {
  agencyId: string;
  projectId: string;
  actorUserId: string;
  actorEmail?: string;
  now?: number;
}): EditorAiStatus {
  const project = assertProject(input.agencyId, input.projectId);
  const existing = getEditorAiConfig(input.agencyId, project.id);

  if (existing?.connectionId && getIntegrationConnection(input.agencyId, existing.connectionId)) {
    revokeIntegrationConnection({
      agencyId: input.agencyId,
      connectionId: existing.connectionId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
    });
  }
  writeConfig(input.agencyId, project.id, input.actorUserId, draft => {
    draft.connectionId = undefined;
  }, input.now);

  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "settings",
    action: "editor_ai.token_cleared",
    message: `Removed the Aqua Editor AI key for ${project.name}.`,
    metadata: { projectId: project.id },
  });
  return editorAiStatus(input.agencyId, project.id);
}

/**
 * Delete a project's assistant entirely — its key and its configuration.
 *
 * Called when the project itself is deleted. Without it an orphaned encrypted
 * credential outlives the only thing that could ever have used it, which is a
 * credential nobody is watching.
 *
 * Deliberately NOT called from `deleteDevProject` itself: `editorAi` imports
 * `devProjects` for its tenant check, and reaching back the other way would
 * make the pair a cycle. The projects route calls both, in order.
 */
export function forgetEditorAiForProject(input: {
  agencyId: string;
  projectId: string;
  actorUserId: string;
  actorEmail?: string;
}): void {
  const key = configKey(input.agencyId, input.projectId);
  const existing = getState().editorAiConfigs?.[key];
  if (!existing || existing.agencyId !== input.agencyId) return;
  if (existing.connectionId && getIntegrationConnection(input.agencyId, existing.connectionId)) {
    revokeIntegrationConnection({
      agencyId: input.agencyId,
      connectionId: existing.connectionId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
    });
  }
  mutate(state => { delete state.editorAiConfigs?.[key]; });
}

/**
 * ⚠ THE TOKEN. Server-only, and it stops here.
 *
 * The single function in the codebase that turns a project id into Aqua Editor
 * AI's actual key. Its result belongs in an outbound `authorization` header and
 * nowhere else — not a prop, not a response, not a log, not an error message.
 *
 * Null when: the project is not this agency's, no key has been pasted, or the
 * bound connection has since been revoked. Every one of those is "not
 * configured" to a caller, which is why `editorAiConfigured` is defined as this
 * returning something rather than as a flag somebody sets.
 */
export function resolveEditorAiToken(agencyId: string, projectId: string): string | null {
  const project = getDevProject(agencyId, clean(projectId, 120));
  if (!project) return null;
  const config = getEditorAiConfig(agencyId, project.id);
  if (!config?.connectionId) return null;
  try {
    return resolveIntegrationConnectionValues(agencyId, config.connectionId).apiKey || null;
  } catch {
    // The connection was revoked from the integrations screen. Not an error to
    // the editor — just an assistant that is no longer configured.
    return null;
  }
}

/**
 * Is Aqua Editor AI usable on this project?
 *
 * Defined as "a token really resolves", not as "an id is stored". Those differ
 * exactly when somebody revokes the connection from the integrations screen,
 * and reporting `configured: true` there would give the editor an enabled
 * composer that fails on send.
 */
export function editorAiConfigured(agencyId: string, projectId: string): boolean {
  return Boolean(resolveEditorAiToken(agencyId, projectId));
}

/** The model this project's assistant runs on. Never the agency assistant's. */
export function editorAiModel(agencyId: string, projectId: string): string {
  return getEditorAiConfig(agencyId, projectId)?.model || EDITOR_AI_DEFAULT_MODEL;
}

/**
 * `••••4f2a`, or nothing.
 *
 * The only thing derived from a key that is allowed out of this module, and
 * only for keys long enough that four characters are a hint rather than a
 * fraction of the secret. Ed pastes real keys; being able to tell which one is
 * on a project without revealing it is the whole reason this exists.
 */
function tokenHint(token: string | null): string | undefined {
  if (!token || token.length < MIN_HINTABLE_TOKEN) return undefined;
  return `••••${token.slice(-4)}`;
}

/**
 * Everything a screen may know. Safe to send to the client — by construction,
 * not by remembering to strip a field.
 */
export function editorAiStatus(agencyId: string, projectId: string): EditorAiStatus {
  const project = getDevProject(agencyId, clean(projectId, 120));
  if (!project) {
    // A BLANK projectId, never the one that was asked for. Echoing the request
    // back would confirm that a guessed id is a real project somewhere, and it
    // is also what the route reads to decide between 200 and 404 — so echoing
    // here handed a cross-tenant `status` call a cheerful 200. Caught by
    // "404s a project from another agency rather than confirming it exists".
    return { projectId: "", configured: false, model: EDITOR_AI_DEFAULT_MODEL };
  }
  const config = getEditorAiConfig(agencyId, project.id);
  const token = resolveEditorAiToken(agencyId, project.id);
  const connection = config?.connectionId
    ? getIntegrationConnection(agencyId, config.connectionId)
    : null;
  return {
    projectId: project.id,
    configured: Boolean(token),
    model: config?.model || EDITOR_AI_DEFAULT_MODEL,
    tokenHint: tokenHint(token),
    instructions: config?.instructions,
    connectionLabel: connection?.label,
    updatedAt: config?.updatedAt,
  };
}

/**
 * Why the assistant is off, in words — so a screen never has to invent one.
 *
 * Empty string when it is on. Kept beside the gate rather than in the editor so
 * the setup screen, the studio and any future caller say the same sentence.
 */
export function editorAiReason(agencyId: string, projectId: string): string {
  if (!clean(projectId, 120)) {
    return "Aqua Editor AI is configured per project. Open the editor on a project to set its key.";
  }
  if (!getDevProject(agencyId, clean(projectId, 120))) {
    return "That project could not be found in this workspace.";
  }
  const config = getEditorAiConfig(agencyId, projectId);
  if (!config?.connectionId) {
    return "Aqua Editor AI has no key for this project yet. It uses its OWN token, separate from the agency assistant — paste one to switch it on.";
  }
  if (!resolveEditorAiToken(agencyId, projectId)) {
    return "This project's Aqua Editor AI key was removed from the integrations vault. Paste a new one to switch it back on.";
  }
  return "";
}
