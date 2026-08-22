import "server-only";

import crypto from "node:crypto";

import { getState, mutate } from "@/server/storage";
import type {
  EditorAiConversation,
  EditorAiMessage,
  EditorAiThread,
} from "@/server/types";
import { getDevProject } from "@/engines/editor/server/devProjects";

// ─── AQUA EDITOR AI — its chat history, per project, and nothing else ────────
//
// Ed, verbatim: "the chat history per project only limited to a project nothing
// else".
//
// This module is the whole of that sentence. A conversation belongs to exactly
// ONE `DevProject`. Reading a project returns that project's messages and no
// others — not the agency assistant's, not another project's, and not another
// tenant's.
//
// ── Why this is a SEPARATE store, not a filter over `assistant` ──────────────
//
// `lib/server/assistants/assistantStore.ts` persists the Aqua Advisor's and the
// Librarian's conversations in `PortalState.assistant`, keyed
// `${agencyId}|${userId}`. This is `PortalState.editorAiConversations`, keyed
// `${agencyId}|${projectId}`. The shape follows that module deliberately —
// threads of messages, newest-first, capped — because two conversation stores
// that behave differently is a second thing to learn for no benefit.
//
// What does NOT follow it is the storage. They are different collections on
// purpose, so that clearing the agency assistant cannot take an editor
// conversation with it and clearing a project's editor history cannot touch the
// Advisor. A "filtered view of one store" would make both of those one bug
// away.
//
// The KEY differs for a reason too. The Advisor's history is per PERSON — a
// private workspace. This is per PROJECT, shared by whoever in the agency is
// editing that project, because "per project only" stops meaning anything the
// moment two operators on one site see two different histories. `authorUserId`
// on a message is what keeps a shared thread legible.
//
// ── Tenant scoping: agency BEFORE project, on every path ─────────────────────
//
// Same rule and same mechanism as `editorAi.ts`. Every entry point resolves
// through `getDevProject(agencyId, projectId)` FIRST, which returns null when
// the project belongs to somebody else, so a foreign or invented id reaches no
// storage key at all. The stored record's own `agencyId` is then re-checked
// against the caller's — a hand-edited state file or a key collision must not
// be able to hand one agency another's conversation.
//
// ── The cap, and what gets evicted ───────────────────────────────────────────
//
// `PortalState` is ONE JSON document and every write rewrites the whole of it,
// so an unbounded conversation is not a big row, it is a growing tax on every
// unrelated save in the product. The rule is OLDEST OUT, at three levels:
//
//   1. A single message is truncated to `messageChars` and marked `truncated`.
//   2. A thread keeps its newest `messagesPerThread`; older messages drop.
//   3. A project keeps its `threadsPerProject` most recently used threads;
//      the least recently used drop entirely.
//   4. Finally, while the project's stored text exceeds `projectChars`, the
//      OLDEST message in the LEAST RECENTLY USED thread is dropped, repeatedly,
//      until it fits. A thread emptied this way is removed. The message that
//      was just appended is never the one evicted — a cap that could swallow
//      the thing you just said would be a bug, not a limit.
//
// (4) is the binding constraint in practice and it is the one that actually
// bounds the blob: (2) and (3) alone permit 12 × 60 messages of any length.
// Every eviction increments `evictedMessages`, so a screen can say the history
// was trimmed rather than leaving somebody to conclude the assistant forgot.

/**
 * The cap. Exported because a limit nobody can read is a limit nobody can test,
 * and because the UI has to be able to say what it is.
 *
 * `projectChars` is the number that matters: ~80KB of text per project, which
 * is a long working conversation and a bounded contribution to a document that
 * is rewritten in full on every save.
 */
export const EDITOR_AI_HISTORY_LIMITS = {
  /** Least recently used thread drops when a project exceeds this. */
  threadsPerProject: 12,
  /** Oldest message drops when a thread exceeds this. */
  messagesPerThread: 60,
  /** A single message is cut to this and marked `truncated`. */
  messageChars: 6_000,
  /** The real bound on the blob. Oldest-message-out until the project fits. */
  projectChars: 80_000,
} as const;

const MAX_TITLE = 80;
const NEW_THREAD_TITLE = "New conversation";

function clean(value: string | undefined, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * The storage key. Agency first, so a project id on its own names nothing and
 * a scan of the collection sorts by tenant.
 */
function conversationKey(agencyId: string, projectId: string): string {
  return `${agencyId}|${projectId}`;
}

function emptyConversation(agencyId: string, projectId: string, now = Date.now()): EditorAiConversation {
  return {
    id: conversationKey(agencyId, projectId),
    agencyId,
    projectId,
    threads: [],
    evictedMessages: 0,
    updatedAt: now,
  };
}

/**
 * The project, or a refusal — TENANT CHECKED FIRST.
 *
 * Everything in this module goes through here before it touches a storage key.
 * `getDevProject` compares `project.agencyId === agencyId` before returning, so
 * another agency's project id, a project id from a different agency, and an
 * invented id are all the same answer: null, and no conversation.
 */
function assertProject(agencyId: string, projectId: string) {
  const agency = clean(agencyId, 120);
  const project = clean(projectId, 120);
  if (!agency) throw new Error("agency_required");
  if (!project) throw new Error("project_required");
  const found = getDevProject(agency, project);
  if (!found) throw new Error("project_not_found");
  // The CLEANED agency id travels with the project. Every write below must key
  // on it — reads clean before building their key, so a write keyed on the raw
  // input would strand the conversation somewhere no read (and no retention
  // delete) could ever find it.
  return { agencyId: agency, project: found };
}

/**
 * ONE project's whole history, or null when the caller has no business reading
 * it.
 *
 * The two answers are deliberately different shapes. `null` means "that is not
 * a project of yours" — an invented id and another agency's id are
 * indistinguishable, which is the point. An empty conversation means "your
 * project, nothing said yet". Nothing here ever returns a record belonging to
 * a different agency or a different project, whatever is in state.
 */
export function getEditorAiConversation(agencyId: string, projectId: string): EditorAiConversation | null {
  const agency = clean(agencyId, 120);
  const project = clean(projectId, 120);
  if (!agency || !project) return null;
  // 1. TENANT. Before anything else, and before any key is built.
  if (!getDevProject(agency, project)) return null;
  // 2. PROJECT. The record, re-checked against the tenant that asked for it.
  const stored = getState().editorAiConversations?.[conversationKey(agency, project)];
  if (!stored) return emptyConversation(agency, project);
  if (stored.agencyId !== agency || stored.projectId !== project) return null;
  return stored;
}

/** One thread of one project's history, or null. Same guards. */
export function getEditorAiThread(
  agencyId: string,
  projectId: string,
  threadId: string,
): EditorAiThread | null {
  const conversation = getEditorAiConversation(agencyId, projectId);
  if (!conversation) return null;
  return conversation.threads.find(thread => thread.id === clean(threadId, 120)) ?? null;
}

/** The stored text of a conversation, in characters. What the cap measures. */
function conversationChars(conversation: EditorAiConversation): number {
  let total = 0;
  for (const thread of conversation.threads) {
    total += thread.title.length;
    for (const message of thread.messages) total += message.content.length;
  }
  return total;
}

/**
 * Bring a conversation back inside the cap. OLDEST OUT.
 *
 * `keepMessageId` is the message that was just appended: it is never the one
 * evicted, however long it is. Without that, saying something long enough
 * would delete it as it arrived.
 */
function evict(conversation: EditorAiConversation, keepMessageId: string | null): void {
  const limits = EDITOR_AI_HISTORY_LIMITS;

  // Newest-used first, which is also the order a screen wants them in.
  conversation.threads.sort((a, b) => b.updatedAt - a.updatedAt);

  if (conversation.threads.length > limits.threadsPerProject) {
    const dropped = conversation.threads.slice(limits.threadsPerProject);
    conversation.evictedMessages += dropped.reduce((total, thread) => total + thread.messages.length, 0);
    conversation.threads = conversation.threads.slice(0, limits.threadsPerProject);
  }

  // The bound that actually holds. `guard` is belt and braces: the loop always
  // removes something or breaks, but this collection is inside the document
  // every save rewrites and an infinite loop here would take the process out.
  let guard = 0;
  while (conversationChars(conversation) > limits.projectChars && guard < 100_000) {
    guard += 1;
    const oldestFirst = [...conversation.threads].sort((a, b) => a.updatedAt - b.updatedAt);
    const thread = oldestFirst.find(candidate =>
      candidate.messages.some(message => message.id !== keepMessageId));
    if (!thread) break;
    const index = thread.messages.findIndex(message => message.id !== keepMessageId);
    if (index < 0) break;
    thread.messages.splice(index, 1);
    conversation.evictedMessages += 1;
    if (!thread.messages.length) {
      conversation.threads = conversation.threads.filter(candidate => candidate !== thread);
    }
  }
}

function writeConversation(
  agencyId: string,
  projectId: string,
  updater: (conversation: EditorAiConversation) => void,
  keepMessageId: string | null = null,
  now = Date.now(),
): EditorAiConversation {
  const key = conversationKey(agencyId, projectId);
  let saved!: EditorAiConversation;
  mutate(state => {
    state.editorAiConversations ??= {};
    const existing = state.editorAiConversations[key];
    // A record whose stamps disagree with the key is not trusted into the
    // update — it is replaced. Merging it would be the one path by which a
    // corrupted blob could graft one tenant's messages onto another's project.
    const conversation: EditorAiConversation =
      existing && existing.agencyId === agencyId && existing.projectId === projectId
        ? existing
        : emptyConversation(agencyId, projectId, now);
    updater(conversation);
    evict(conversation, keepMessageId);
    conversation.id = key;
    conversation.agencyId = agencyId;
    conversation.projectId = projectId;
    conversation.updatedAt = now;
    state.editorAiConversations[key] = conversation;
    saved = conversation;
  });
  return saved;
}

export interface StartEditorAiThreadInput {
  agencyId: string;
  projectId: string;
  title?: string;
  actorUserId: string;
  now?: number;
}

/** Open a new conversation on this project. */
export function startEditorAiThread(input: StartEditorAiThreadInput): EditorAiThread {
  const { agencyId, project } = assertProject(input.agencyId, input.projectId);
  const now = input.now ?? Date.now();
  const thread: EditorAiThread = {
    id: id("editchat"),
    title: clean(input.title, MAX_TITLE) || NEW_THREAD_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  writeConversation(agencyId, project.id, conversation => {
    conversation.threads.unshift(thread);
  }, null, now);
  // Read it back rather than returning the local object: eviction may have
  // dropped it (a thread cap of 12 and a 13th thread), and handing back a
  // thread that is not in the store is how a client ends up writing into
  // nothing.
  return getEditorAiThread(agencyId, project.id, thread.id) ?? thread;
}

export interface AppendEditorAiMessageInput {
  agencyId: string;
  projectId: string;
  /** Blank or unknown opens a new thread rather than throwing at a person. */
  threadId?: string;
  role: EditorAiMessage["role"];
  content: string;
  /** Assistant-only: the saved user message this line answers. */
  replyToMessageId?: string;
  actorUserId: string;
  now?: number;
}

/**
 * Add one message to one project's history.
 *
 * An unknown `threadId` starts a thread instead of failing. The alternative is
 * an operator losing what they typed because their tab held a thread id that
 * eviction had since dropped, and the message is the thing worth keeping.
 */
export function appendEditorAiMessage(input: AppendEditorAiMessageInput): {
  message: EditorAiMessage;
  threadId: string;
  conversation: EditorAiConversation;
} {
  const { agencyId, project } = assertProject(input.agencyId, input.projectId);
  const body = clean(input.content, EDITOR_AI_HISTORY_LIMITS.messageChars + 1);
  if (!body) throw new Error("message_required");
  const now = input.now ?? Date.now();

  const truncated = body.length > EDITOR_AI_HISTORY_LIMITS.messageChars;
  const message: EditorAiMessage = {
    id: id("editmsg"),
    role: input.role === "assistant" ? "assistant" : "user",
    content: truncated ? body.slice(0, EDITOR_AI_HISTORY_LIMITS.messageChars) : body,
    createdAt: now,
  };
  if (message.role === "user") message.authorUserId = input.actorUserId;
  if (message.role === "assistant") {
    const replyToMessageId = clean(input.replyToMessageId, 120);
    if (replyToMessageId) message.replyToMessageId = replyToMessageId;
  }
  if (truncated) message.truncated = true;

  let threadId = clean(input.threadId, 120);
  const conversation = writeConversation(agencyId, project.id, draft => {
    let thread = threadId ? draft.threads.find(item => item.id === threadId) : undefined;
    if (!thread) {
      thread = {
        id: id("editchat"),
        title: NEW_THREAD_TITLE,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      draft.threads.unshift(thread);
    }
    threadId = thread.id;
    thread.messages.push(message);
    // The per-thread cap fires FIRST in real use — 60 short messages arrive
    // long before 80k characters do — so it counts its evictions like the
    // other two levels, or the "earlier messages were trimmed" notice would
    // never appear on the one cap that actually trims.
    const overCap = thread.messages.length - EDITOR_AI_HISTORY_LIMITS.messagesPerThread;
    if (overCap > 0) {
      thread.messages = thread.messages.slice(overCap);
      draft.evictedMessages += overCap;
    }
    thread.updatedAt = now;
    if (thread.title === NEW_THREAD_TITLE && message.role === "user") {
      thread.title = message.content.replace(/\s+/g, " ").trim().slice(0, 55) || thread.title;
    }
  }, message.id, now);

  return { message, threadId, conversation };
}

export function renameEditorAiThread(input: {
  agencyId: string;
  projectId: string;
  threadId: string;
  title: string;
  now?: number;
}): EditorAiConversation {
  const { agencyId, project } = assertProject(input.agencyId, input.projectId);
  const threadId = clean(input.threadId, 120);
  const now = input.now ?? Date.now();
  return writeConversation(agencyId, project.id, conversation => {
    const thread = conversation.threads.find(item => item.id === threadId);
    if (!thread) throw new Error("thread_not_found");
    thread.title = clean(input.title, MAX_TITLE) || "Conversation";
    // NOT `thread.updatedAt = now`. Renaming is housekeeping, not use, and
    // bumping it would let a rename push a genuinely older thread past a
    // busier one on the eviction ladder.
  }, null, now);
}

export function deleteEditorAiThread(input: {
  agencyId: string;
  projectId: string;
  threadId: string;
  now?: number;
}): EditorAiConversation {
  const { agencyId, project } = assertProject(input.agencyId, input.projectId);
  const threadId = clean(input.threadId, 120);
  // Nothing stored, or no such thread: NO write. A project with no
  // conversation costs nothing in the blob, and a delete must never be the
  // operation that mints the very record it exists to remove.
  const existing = getEditorAiConversation(agencyId, project.id);
  if (!existing || !existing.threads.some(thread => thread.id === threadId)) {
    return existing ?? emptyConversation(agencyId, project.id, input.now ?? Date.now());
  }
  return writeConversation(agencyId, project.id, conversation => {
    conversation.threads = conversation.threads.filter(thread => thread.id !== threadId);
  }, null, input.now);
}

/**
 * Wipe ONE project's history. Nothing else.
 *
 * The record is removed rather than emptied, so a project with no conversation
 * costs nothing in the blob. `evictedMessages` goes with it: this was a person
 * deleting, not the cap trimming, and reporting "42 earlier messages trimmed"
 * after a deliberate clear would be a lie.
 *
 * It cannot reach `PortalState.assistant`. That is the separation Ed asked for,
 * and it is enforced by the two stores being two collections.
 */
export function clearEditorAiHistory(input: {
  agencyId: string;
  projectId: string;
  now?: number;
}): EditorAiConversation {
  const { agencyId, project } = assertProject(input.agencyId, input.projectId);
  const key = conversationKey(agencyId, project.id);
  mutate(state => { delete state.editorAiConversations?.[key]; });
  return emptyConversation(agencyId, project.id, input.now ?? Date.now());
}

/**
 * Delete a project's conversation because the PROJECT is being deleted.
 *
 * Separate from `clearEditorAiHistory` because it must survive the project no
 * longer resolving — it runs beside `forgetEditorAiForProject`, before
 * `deleteDevProject`, and the tenant check is on the stored record's own
 * `agencyId` rather than on a project row that is about to disappear.
 */
export function forgetEditorAiHistoryForProject(input: {
  agencyId: string;
  projectId: string;
}): void {
  const agencyId = clean(input.agencyId, 120);
  const key = conversationKey(agencyId, clean(input.projectId, 120));
  const existing = getState().editorAiConversations?.[key];
  // Compared against the CLEANED id — the stored record's stamp is cleaned,
  // so comparing it to the raw input would refuse to delete for exactly the
  // caller whose text this retention function exists to remove.
  if (!existing || existing.agencyId !== agencyId) return;
  mutate(state => { delete state.editorAiConversations?.[key]; });
}
