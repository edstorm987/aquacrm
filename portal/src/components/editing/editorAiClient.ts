// ─── AQUA EDITOR AI — the browser's side of its two endpoints ────────────────
//
// One module, so the panel never writes a `fetch` by hand and the two routes
// are described in exactly one place.
//
// ── Both endpoints are POST-only, including for reading ──────────────────────
//
// `/api/portal/dev/editor-ai` handles a SECRET and exports no GET at all;
// `/api/portal/dev/editor-ai/history` follows the same shape so the family has
// one gate. Reading is `action: "status"` / `action: "read"`. Nothing here may
// put a project id or a key in a URL — a URL is the thing that gets logged,
// cached, prefetched and pasted into a bug report.
//
// ── What may cross, in each direction ────────────────────────────────────────
//
// OUT: `apiKey` is write-only. It appears in exactly one call (`setToken`),
//      goes straight into a request body, and is never stored in this module,
//      never put in a query string, and never logged.
// IN:  `EditorAiStatus` — configured / model / `••••abcd` / brief. There is no
//      field on it a key could occupy, so a leak would be a type error rather
//      than an oversight.
//
// ── The tenant check is not here, and must not be ────────────────────────────
//
// Every one of these calls names a `projectId`, and the SERVER decides whether
// the caller may see it: both routes resolve through
// `getDevProject(session.agencyId, id)` before touching a store, and answer a
// foreign id exactly as they answer an invented one. Nothing the browser sends
// can widen that, which is why the panel is free to ask for a project by id.

import type {
  EditorAiConversation,
  EditorAiMessage,
  EditorAiStatus,
} from "@/server/types";

export const EDITOR_AI_ENDPOINT = "/api/portal/dev/editor-ai";
export const EDITOR_AI_HISTORY_ENDPOINT = "/api/portal/dev/editor-ai/history";
export const EDITOR_AI_REPLY_ENDPOINT = "/api/portal/dev/editor-ai/reply";

/**
 * The browser gives up before the server's own 45s abort would normally have
 * answered — a margin over it, not a race with it — so a dead network cannot
 * leave the panel spinning on a request nothing will ever finish.
 */
const REPLY_WAIT_MS = 60_000;

/**
 * The history cap, as the server reports it.
 *
 * Structurally the same as `EDITOR_AI_HISTORY_LIMITS` in
 * `engines/editor/server/editorAiHistory.ts`, declared again here because that
 * module is `server-only` and importing it into a client component would drag
 * the store — and `getDevProject` behind it — into the browser bundle. Every
 * response carries the real values, so the screen never has to guess: this type
 * is the shape, the endpoint is the authority.
 */
export interface EditorAiHistoryLimits {
  threadsPerProject: number;
  messagesPerThread: number;
  messageChars: number;
  projectChars: number;
}

/**
 * Why a reply failed, machine-readably.
 *
 * Declared here as well as in `engines/editor/server/editorAiReply.ts` for the
 * same reason as `EditorAiHistoryLimits` above: that module is `server-only`.
 * The route's response is the authority; this is its shape.
 */
export type EditorAiReplyFailureCode = "not_configured" | "timeout" | "network" | "provider" | "empty" | "stale";

export type EditorAiReplyResult =
  | {
    ok: true;
    /** The assistant's message — already in the project's thread, server-side. */
    message: EditorAiMessage;
    threadId: string;
    conversation: EditorAiConversation | null;
    limits: EditorAiHistoryLimits | null;
  }
  | { ok: false; error: string; code?: EditorAiReplyFailureCode };

export interface EditorAiConfigResult {
  status: EditorAiStatus;
  /** Why it is off, in the server's words. Empty when it is on. */
  reason: string;
  /** Whether this deployment can store a credential at all. */
  vaultAvailable: boolean;
}

export interface EditorAiHistoryResult {
  conversation: EditorAiConversation | null;
  limits: EditorAiHistoryLimits | null;
  /** Present on `append` only. */
  message?: EditorAiMessage;
  /** Present on `append` and `new-thread`. */
  threadId?: string;
}

type Json = Record<string, unknown>;

interface Envelope {
  ok?: boolean;
  error?: string;
  /** Reply failures only: why, machine-readably, so the panel can point somewhere. */
  code?: EditorAiReplyFailureCode;
  status?: EditorAiStatus;
  reason?: string;
  vaultAvailable?: boolean;
  conversation?: EditorAiConversation | null;
  limits?: EditorAiHistoryLimits;
  message?: EditorAiMessage;
  threadId?: string;
}

/**
 * One POST, one error convention.
 *
 * A failed request throws with the SERVER's sentence. Both routes deliberately
 * map only error codes they recognise and return a generic line otherwise, so
 * what arrives here is already safe to show — there is no path by which a vault
 * or provider message (which could carry the value that caused it) reaches a
 * screen through this function.
 */
async function post(url: string, body: Json): Promise<Envelope> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Same-origin only: both routes reject a cross-origin `Origin` header,
      // and a credential route is not one to be relaxed about it.
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Aqua Editor AI could not be reached.");
  }
  const payload = await response.json().catch(() => null) as Envelope | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "That request could not be completed.");
  }
  return payload;
}

function configResult(payload: Envelope): EditorAiConfigResult {
  return {
    status: payload.status ?? { projectId: "", configured: false, model: "" },
    reason: payload.reason ?? "",
    vaultAvailable: payload.vaultAvailable !== false,
  };
}

function historyResult(payload: Envelope): EditorAiHistoryResult {
  return {
    conversation: payload.conversation ?? null,
    limits: payload.limits ?? null,
    message: payload.message,
    threadId: payload.threadId,
  };
}

// ── Configuration — the key, the model, the brief ────────────────────────────

/** Read the gate without a GET on a route that knows about credentials. */
export async function readEditorAiStatus(projectId: string): Promise<EditorAiConfigResult> {
  return configResult(await post(EDITOR_AI_ENDPOINT, { action: "status", projectId }));
}

/**
 * Paste a key for ONE project.
 *
 * The only place `apiKey` appears in this file. The response has nowhere to put
 * it back — not even as a confirmation, which is exactly the moment a value
 * would end up in a screenshot.
 */
export async function setEditorAiKey(input: {
  projectId: string;
  apiKey: string;
  model?: string;
  instructions?: string;
}): Promise<EditorAiConfigResult> {
  return configResult(await post(EDITOR_AI_ENDPOINT, {
    action: "set-token",
    projectId: input.projectId,
    apiKey: input.apiKey,
    model: input.model,
    instructions: input.instructions,
  }));
}

/** Remove this project's key. The model and the brief are kept. */
export async function clearEditorAiKey(projectId: string): Promise<EditorAiConfigResult> {
  return configResult(await post(EDITOR_AI_ENDPOINT, { action: "clear-token", projectId }));
}

/**
 * Model and brief only.
 *
 * A key is not sent here even if one is to hand: the route ignores `apiKey` on
 * this action on purpose, and mirroring that refusal on the client means the
 * panel cannot develop a second way to write a credential.
 */
export async function saveEditorAiSettings(input: {
  projectId: string;
  model: string;
  instructions: string;
}): Promise<EditorAiConfigResult> {
  return configResult(await post(EDITOR_AI_ENDPOINT, {
    action: "save",
    projectId: input.projectId,
    model: input.model,
    instructions: input.instructions,
  }));
}

// ── History — ONE project's conversation, and nothing else ───────────────────
//
// Every function here names a project. There is deliberately no "list my
// conversations": the endpoint has no such action, because a listing that spans
// projects is the shape Ed asked to have removed.

export async function readEditorAiHistory(projectId: string): Promise<EditorAiHistoryResult> {
  return historyResult(await post(EDITOR_AI_HISTORY_ENDPOINT, { action: "read", projectId }));
}

export async function appendEditorAiMessage(input: {
  projectId: string;
  threadId?: string;
  message: string;
}): Promise<EditorAiHistoryResult> {
  // No role field, deliberately. A browser only ever speaks as the person —
  // the route refuses any other claim — and the assistant's replies are
  // written server-side by the reply path, never posted from here.
  return historyResult(await post(EDITOR_AI_HISTORY_ENDPOINT, {
    action: "append",
    projectId: input.projectId,
    threadId: input.threadId,
    role: "user",
    message: input.message,
  }));
}

export async function startEditorAiThread(projectId: string, title?: string): Promise<EditorAiHistoryResult> {
  return historyResult(await post(EDITOR_AI_HISTORY_ENDPOINT, { action: "new-thread", projectId, title }));
}

export async function renameEditorAiThread(input: {
  projectId: string;
  threadId: string;
  title: string;
}): Promise<EditorAiHistoryResult> {
  return historyResult(await post(EDITOR_AI_HISTORY_ENDPOINT, {
    action: "rename-thread",
    projectId: input.projectId,
    threadId: input.threadId,
    title: input.title,
  }));
}

export async function deleteEditorAiThread(input: {
  projectId: string;
  threadId: string;
}): Promise<EditorAiHistoryResult> {
  return historyResult(await post(EDITOR_AI_HISTORY_ENDPOINT, {
    action: "delete-thread",
    projectId: input.projectId,
    threadId: input.threadId,
  }));
}

/**
 * Wipe ONE project's history.
 *
 * It cannot reach the Aqua Advisor's conversations: that is a different
 * collection behind a different endpoint, and this call names a project rather
 * than a person.
 */
export async function clearEditorAiHistory(projectId: string): Promise<EditorAiHistoryResult> {
  return historyResult(await post(EDITOR_AI_HISTORY_ENDPOINT, { action: "clear", projectId }));
}

// ── The reply — the model answers, server-side, on the project's own key ─────

/**
 * Ask the server to answer the latest message in one project's thread.
 *
 * NOT routed through `post()`, and it does not throw: a reply can honestly
 * fail — no key on the project, the provider refused, the model took too long
 * — and the panel needs the failure as a VALUE with a code it can act on
 * (`not_configured` points at the Key panel), not as a thrown sentence.
 *
 * The browser never posts the assistant's message itself — the history route
 * refuses `role: "assistant"` from a client. The reply is appended server-side
 * and comes back here already part of the conversation.
 *
 * Never a spinner that lies forever: the server aborts its model call at 45s
 * with words, and this call carries its own later abort so a dead network
 * turns into a sentence too.
 */
export async function requestEditorAiReply(input: {
  projectId: string;
  threadId: string;
  /** The exact saved user message to answer. */
  messageId: string;
  /** What the editor is pointing at — target, clicked words, source focus. */
  context?: string;
}): Promise<EditorAiReplyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPLY_WAIT_MS);
  try {
    const response = await fetch(EDITOR_AI_REPLY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        projectId: input.projectId,
        threadId: input.threadId,
        messageId: input.messageId,
        context: input.context,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as Envelope | null;
    if (!response.ok || !payload?.ok || !payload.message) {
      return {
        ok: false,
        error: payload?.error || "Aqua Editor AI could not reply. Your message is saved — try again.",
        code: payload?.code,
      };
    }
    return {
      ok: true,
      message: payload.message,
      threadId: payload.threadId ?? input.threadId,
      conversation: payload.conversation ?? null,
      limits: payload.limits ?? null,
    };
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "AbortError";
    return {
      ok: false,
      code: timedOut ? "timeout" : "network",
      error: timedOut
        ? "Aqua Editor AI took too long to answer, so the wait was stopped. Your message is saved — try again."
        : "Aqua Editor AI could not be reached. Your message is saved — check the connection and try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}
