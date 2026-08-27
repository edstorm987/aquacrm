import "server-only";

import crypto from "node:crypto";

import { getState, mutate } from "@/server/storage";
import type {
  AssistantMemory,
  AssistantMessage,
  AssistantThread,
  AssistantTurnOperation,
  AssistantWorkspaceState,
} from "@/server/types";

const MAX_THREADS = 30;
const MAX_MESSAGES_PER_THREAD = 120;
const MAX_MEMORIES = 100;
const MAX_TURN_OPERATIONS = 100;
const TURN_LEASE_MS = 60_000;

export class AssistantTurnValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantTurnValidationError";
  }
}

export class AssistantTurnConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantTurnConflictError";
  }
}

function key(agencyId: string, userId: string) {
  return `${agencyId}|${userId}`;
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function emptyWorkspace(agencyId: string, userId: string): AssistantWorkspaceState {
  return {
    agencyId,
    userId,
    threads: [],
    memories: [],
    turnOperations: [],
    updatedAt: Date.now(),
  };
}

export function getAssistantWorkspace(agencyId: string, userId: string): AssistantWorkspaceState {
  return getState().assistant?.[key(agencyId, userId)] ?? emptyWorkspace(agencyId, userId);
}

function updateWorkspace(
  agencyId: string,
  userId: string,
  updater: (workspace: AssistantWorkspaceState) => void,
) {
  let saved!: AssistantWorkspaceState;
  mutate(state => {
    state.assistant ??= {};
    const workspace = state.assistant[key(agencyId, userId)]
      ?? emptyWorkspace(agencyId, userId);
    updater(workspace);
    workspace.updatedAt = Date.now();
    state.assistant[key(agencyId, userId)] = workspace;
    saved = workspace;
  });
  return saved;
}

export function createAssistantThread(
  agencyId: string,
  userId: string,
  title = "New conversation",
): AssistantThread {
  const now = Date.now();
  const thread: AssistantThread = {
    id: id("chat"),
    title: title.trim().slice(0, 80) || "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  updateWorkspace(agencyId, userId, workspace => {
    workspace.threads.unshift(thread);
    workspace.threads = workspace.threads.slice(0, MAX_THREADS);
  });
  return thread;
}

export function getAssistantThread(
  agencyId: string,
  userId: string,
  threadId: string,
): AssistantThread | null {
  return getAssistantWorkspace(agencyId, userId).threads.find(thread => thread.id === threadId) ?? null;
}

export function appendAssistantMessage(
  agencyId: string,
  userId: string,
  threadId: string,
  role: AssistantMessage["role"],
  content: string,
  skillId?: string,
): AssistantMessage {
  const message: AssistantMessage = {
    id: id("msg"),
    role,
    content: content.trim(),
    skillId,
    createdAt: Date.now(),
  };
  updateWorkspace(agencyId, userId, workspace => {
    const thread = workspace.threads.find(item => item.id === threadId);
    if (!thread) throw new Error("Conversation not found.");
    thread.messages.push(message);
    thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
    thread.updatedAt = message.createdAt;
    if (thread.title === "New conversation" && role === "user") {
      thread.title = content.trim().replace(/\s+/g, " ").slice(0, 55) || thread.title;
    }
    workspace.threads.sort((a, b) => b.updatedAt - a.updatedAt);
  });
  return message;
}

export interface BeginAssistantTurnInput {
  operationId: string;
  threadId?: string;
  message: string;
  skillId: string;
  memoryContent?: string;
  now?: number;
}

export interface AssistantTurnClaim {
  operation: AssistantTurnOperation;
  claimed: boolean;
  attempt: number;
}

export interface AssistantTurnCompletion {
  operation: AssistantTurnOperation;
  thread: AssistantThread;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  memoryCreated: boolean;
  completedNow: boolean;
}

export function beginAssistantTurn(
  agencyId: string,
  userId: string,
  input: BeginAssistantTurnInput,
): AssistantTurnClaim {
  const operationId = cleanOperationId(input.operationId);
  const message = input.message.trim();
  const skillId = input.skillId.trim().slice(0, 120);
  const sourceThreadId = input.threadId?.trim() || undefined;
  const memoryContent = input.memoryContent?.trim().slice(0, 1_000) || undefined;
  if (!message || message.length > 6_000) throw new AssistantTurnValidationError("Write a message between 1 and 6,000 characters.");
  if (!skillId) throw new AssistantTurnValidationError("Advisor skill required.");
  const now = input.now ?? Date.now();
  let claim!: AssistantTurnClaim;
  updateWorkspace(agencyId, userId, workspace => {
    workspace.turnOperations ??= [];
    const existing = workspace.turnOperations.find(operation => operation.id === operationId);
    if (existing) {
      if (existing.message !== message || existing.skillId !== skillId || existing.sourceThreadId !== sourceThreadId) {
        throw new AssistantTurnConflictError("That assistant operation ID is already attached to a different turn.");
      }
      if (existing.status === "completed" || existing.status === "provider-complete") {
        claim = { operation: existing, claimed: true, attempt: existing.attempts };
        return;
      }
      if (existing.status === "generating" && (existing.leaseExpiresAt ?? 0) > now) {
        claim = { operation: existing, claimed: false, attempt: existing.attempts };
        return;
      }
      const otherActiveTurn = workspace.turnOperations.find(operation => operation.id !== existing.id
        && operation.threadId === existing.threadId
        && (operation.status === "generating" || operation.status === "provider-complete"));
      if (otherActiveTurn) throw new AssistantTurnConflictError("Another turn is already active in this conversation.");
      existing.status = "generating";
      existing.attempts += 1;
      existing.leaseExpiresAt = now + TURN_LEASE_MS;
      existing.error = undefined;
      existing.updatedAt = now;
      claim = { operation: existing, claimed: true, attempt: existing.attempts };
      return;
    }
    if (sourceThreadId && !workspace.threads.some(thread => thread.id === sourceThreadId)) {
      throw new AssistantTurnConflictError("Conversation not found.");
    }
    if (sourceThreadId && workspace.turnOperations.some(operation => operation.threadId === sourceThreadId
      && (operation.status === "generating" || operation.status === "provider-complete"))) {
      throw new AssistantTurnConflictError("Another turn is already active in this conversation.");
    }
    const operation: AssistantTurnOperation = {
      id: operationId,
      threadId: sourceThreadId ?? id("chat"),
      sourceThreadId,
      message,
      skillId,
      memoryContent,
      userMessageId: id("msg"),
      assistantMessageId: id("msg"),
      memoryId: memoryContent ? id("mem") : undefined,
      status: "generating",
      attempts: 1,
      leaseExpiresAt: now + TURN_LEASE_MS,
      createdAt: now,
      updatedAt: now,
    };
    workspace.turnOperations.unshift(operation);
    workspace.turnOperations = workspace.turnOperations.slice(0, MAX_TURN_OPERATIONS);
    claim = { operation, claimed: true, attempt: 1 };
  });
  return claim;
}

export function recordAssistantTurnFailure(
  agencyId: string,
  userId: string,
  operationId: string,
  attempt: number,
  error: string,
  now = Date.now(),
): { operation: AssistantTurnOperation; accepted: boolean } | null {
  let result: { operation: AssistantTurnOperation; accepted: boolean } | null = null;
  updateWorkspace(agencyId, userId, workspace => {
    const operation = workspace.turnOperations?.find(item => item.id === operationId);
    if (!operation) return;
    if (operation.status !== "generating" || operation.attempts !== attempt) {
      result = { operation, accepted: false };
      return;
    }
    operation.status = "failed";
    operation.error = error.trim().slice(0, 1_000) || "The assistant provider failed.";
    operation.leaseExpiresAt = undefined;
    operation.updatedAt = now;
    result = { operation, accepted: true };
  });
  return result;
}

export function recordAssistantTurnProviderResult(
  agencyId: string,
  userId: string,
  operationId: string,
  attempt: number,
  answer: string,
  now = Date.now(),
): { operation: AssistantTurnOperation; accepted: boolean } | null {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) throw new Error("The assistant returned an empty response.");
  let result: { operation: AssistantTurnOperation; accepted: boolean } | null = null;
  updateWorkspace(agencyId, userId, workspace => {
    const operation = workspace.turnOperations?.find(item => item.id === operationId);
    if (!operation) return;
    if (operation.status !== "generating" || operation.attempts !== attempt) {
      result = { operation, accepted: false };
      return;
    }
    operation.status = "provider-complete";
    operation.answer = cleanAnswer;
    operation.error = undefined;
    operation.leaseExpiresAt = undefined;
    operation.updatedAt = now;
    result = { operation, accepted: true };
  });
  return result;
}

export function completeAssistantTurn(
  agencyId: string,
  userId: string,
  operationId: string,
  now = Date.now(),
): AssistantTurnCompletion | null {
  let completion: AssistantTurnCompletion | null = null;
  updateWorkspace(agencyId, userId, workspace => {
    const operation = workspace.turnOperations?.find(item => item.id === operationId);
    if (!operation) return;
    const existingThread = workspace.threads.find(thread => thread.id === operation.threadId);
    const existingUserMessage = existingThread?.messages.find(message => message.id === operation.userMessageId);
    const existingAssistantMessage = existingThread?.messages.find(message => message.id === operation.assistantMessageId);
    if (operation.status === "completed") {
      if (!existingThread || !existingUserMessage || !existingAssistantMessage) {
        throw new AssistantTurnConflictError("Completed assistant turn history is no longer available.");
      }
      completion = {
        operation,
        thread: existingThread,
        userMessage: existingUserMessage,
        assistantMessage: existingAssistantMessage,
        memoryCreated: Boolean(operation.memoryId && workspace.memories.some(memory => memory.id === operation.memoryId)),
        completedNow: false,
      };
      return;
    }
    if (operation.status !== "provider-complete" || !operation.answer) {
      throw new AssistantTurnConflictError("The assistant turn is not ready to complete.");
    }
    if (operation.sourceThreadId && !existingThread) throw new AssistantTurnConflictError("Conversation not found.");
    const thread = existingThread ?? {
      id: operation.threadId,
      title: operation.message.replace(/\s+/g, " ").slice(0, 55) || "Conversation",
      createdAt: operation.createdAt,
      updatedAt: now,
      messages: [],
    };
    if (!existingThread) workspace.threads.unshift(thread);
    const userMessage: AssistantMessage = existingUserMessage ?? {
      id: operation.userMessageId,
      role: "user",
      content: operation.message,
      skillId: operation.skillId,
      createdAt: operation.createdAt,
    };
    const assistantMessage: AssistantMessage = existingAssistantMessage ?? {
      id: operation.assistantMessageId,
      role: "assistant",
      content: operation.answer,
      skillId: operation.skillId,
      createdAt: now,
    };
    if (!existingUserMessage) thread.messages.push(userMessage);
    if (!existingAssistantMessage) thread.messages.push(assistantMessage);
    thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
    thread.updatedAt = now;
    workspace.threads.sort((left, right) => right.updatedAt - left.updatedAt);
    workspace.threads = workspace.threads.slice(0, MAX_THREADS);
    let memoryCreated = false;
    if (operation.memoryContent && operation.memoryId) {
      const duplicate = workspace.memories.some(memory => memory.content.toLocaleLowerCase("en-GB") === operation.memoryContent?.toLocaleLowerCase("en-GB"));
      if (!duplicate) {
        workspace.memories.unshift({
          id: operation.memoryId,
          content: operation.memoryContent,
          createdAt: now,
          sourceThreadId: thread.id,
        });
        workspace.memories = workspace.memories.slice(0, MAX_MEMORIES);
        memoryCreated = true;
      }
    }
    operation.status = "completed";
    operation.completedAt = now;
    operation.updatedAt = now;
    operation.leaseExpiresAt = undefined;
    completion = { operation, thread, userMessage, assistantMessage, memoryCreated, completedNow: true };
  });
  return completion;
}

export function getAssistantTurnOperation(
  agencyId: string,
  userId: string,
  operationId: string,
): AssistantTurnOperation | null {
  return getAssistantWorkspace(agencyId, userId).turnOperations?.find(operation => operation.id === operationId) ?? null;
}

export function deleteAssistantThread(agencyId: string, userId: string, threadId: string) {
  updateWorkspace(agencyId, userId, workspace => {
    workspace.threads = workspace.threads.filter(thread => thread.id !== threadId);
    workspace.turnOperations = workspace.turnOperations?.filter(operation => operation.threadId !== threadId);
  });
}

export function renameAssistantThread(
  agencyId: string,
  userId: string,
  threadId: string,
  title: string,
) {
  return updateWorkspace(agencyId, userId, workspace => {
    const thread = workspace.threads.find(item => item.id === threadId);
    if (!thread) throw new Error("Conversation not found.");
    thread.title = title.trim().slice(0, 80) || "Conversation";
    thread.updatedAt = Date.now();
  });
}

export function addAssistantMemory(
  agencyId: string,
  userId: string,
  content: string,
  sourceThreadId?: string,
): AssistantMemory {
  const memory: AssistantMemory = {
    id: id("mem"),
    content: content.trim().slice(0, 1000),
    createdAt: Date.now(),
    sourceThreadId,
  };
  if (!memory.content) throw new Error("Memory cannot be empty.");
  updateWorkspace(agencyId, userId, workspace => {
    const duplicate = workspace.memories.some(
      item => item.content.toLowerCase() === memory.content.toLowerCase(),
    );
    if (!duplicate) workspace.memories.unshift(memory);
    workspace.memories = workspace.memories.slice(0, MAX_MEMORIES);
  });
  return memory;
}

export function deleteAssistantMemory(agencyId: string, userId: string, memoryId: string) {
  updateWorkspace(agencyId, userId, workspace => {
    workspace.memories = workspace.memories.filter(memory => memory.id !== memoryId);
  });
}

function cleanOperationId(value: string): string {
  const clean = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,119}$/.test(clean)) {
    throw new AssistantTurnValidationError("A valid assistant operation ID is required.");
  }
  return clean;
}
