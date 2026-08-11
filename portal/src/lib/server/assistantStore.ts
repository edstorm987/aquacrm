import "server-only";

import crypto from "node:crypto";

import { getState, mutate } from "@/server/storage";
import type {
  AssistantMemory,
  AssistantMessage,
  AssistantThread,
  AssistantWorkspaceState,
} from "@/server/types";

const MAX_THREADS = 30;
const MAX_MESSAGES_PER_THREAD = 120;
const MAX_MEMORIES = 100;

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

export function deleteAssistantThread(agencyId: string, userId: string, threadId: string) {
  updateWorkspace(agencyId, userId, workspace => {
    workspace.threads = workspace.threads.filter(thread => thread.id !== threadId);
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
