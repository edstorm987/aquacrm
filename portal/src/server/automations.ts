import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { createAgencyTask } from "./tasks";
import { getState, mutate } from "./storage";
import { getAgency } from "./tenants";
import { listUsersForAgency } from "./users";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { listWebsiteEnquiries } from "@/lib/server/websiteEnquiries";
import type {
  AgencyTaskPriority,
  AutomationConditionOperator,
  AutomationFolder,
  AutomationRun,
  AutomationRunLog,
  AutomationTriggerType,
  AutomationWorkflow,
  AutomationWorkflowEdge,
  AutomationWorkflowNode,
  AutomationWorkflowStatus,
} from "./types";

const MAX_NODES = 50;
const MAX_RUN_STEPS = 75;
const MAX_RUN_LOGS = 120;
const TRIGGERS = new Set<AutomationTriggerType>([
  "manual",
  "website-enquiry.received",
  "client-form.received",
  "client-request.received",
  "social-message.received",
  "client.created",
  "client.updated",
  "client.archived",
  "client.stage_changed",
  "phase.advanced",
  "phase.checklist_item_completed",
  "deliverable.submitted",
  "deliverable.approved",
  "page.published",
  "invoice.paid",
  "email.delivered",
  "schedule.daily",
  "custom.event",
]);

const FOLDER_COLORS = new Set(["teal", "blue", "violet", "amber", "rose", "emerald", "slate"]);

type EventData = Record<string, string | number | boolean | null>;

export interface SaveAutomationWorkflowInput {
  name?: string;
  description?: string;
  folderId?: string | null;
  status?: AutomationWorkflowStatus;
  nodes?: AutomationWorkflowNode[];
  edges?: AutomationWorkflowEdge[];
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normaliseNode(raw: AutomationWorkflowNode, index: number): AutomationWorkflowNode {
  const kind = raw.kind === "trigger" || raw.kind === "delay" || raw.kind === "condition" || raw.kind === "action"
    ? raw.kind
    : "action";
  const triggerType = TRIGGERS.has(raw.config?.triggerType as AutomationTriggerType)
    ? raw.config.triggerType
    : undefined;
  const actionType = raw.config?.actionType === "send-email" || raw.config?.actionType === "create-task" || raw.config?.actionType === "log-activity" || raw.config?.actionType === "send-webhook"
    ? raw.config.actionType
    : undefined;
  const conditionType = raw.config?.conditionType === "enquiry.awaiting-response" || raw.config?.conditionType === "client-request.awaiting-response" || raw.config?.conditionType === "event-field"
    ? raw.config.conditionType
    : undefined;
  const operator = normaliseOperator(raw.config?.operator);
  const taskPriority: AgencyTaskPriority = ["low", "normal", "high", "urgent"].includes(raw.config?.taskPriority ?? "")
    ? raw.config.taskPriority as AgencyTaskPriority
    : "normal";
  return {
    id: cleanText(raw.id, 100) || `node_${index}`,
    kind,
    position: {
      x: safeNumber(raw.position?.x, index * 240, -10_000, 10_000),
      y: safeNumber(raw.position?.y, 120, -10_000, 10_000),
    },
    config: {
      label: cleanText(raw.config?.label, 120) || defaultNodeLabel(kind),
      description: cleanText(raw.config?.description, 500) || undefined,
      triggerType,
      eventName: cleanText(raw.config?.eventName, 160) || undefined,
      scheduleHour: safeNumber(raw.config?.scheduleHour, 9, 0, 23),
      delayMinutes: safeNumber(raw.config?.delayMinutes, 60, 0, 525_600),
      conditionType,
      field: cleanText(raw.config?.field, 120) || undefined,
      operator,
      value: cleanText(raw.config?.value, 500) || undefined,
      actionType,
      recipient: cleanText(raw.config?.recipient, 320) || undefined,
      subject: cleanText(raw.config?.subject, 240) || undefined,
      message: cleanText(raw.config?.message, 8_000) || undefined,
      taskTitle: cleanText(raw.config?.taskTitle, 240) || undefined,
      taskPriority,
      dueInMinutes: safeNumber(raw.config?.dueInMinutes, 1_440, 0, 525_600),
      webhookUrl: cleanText(raw.config?.webhookUrl, 2_000) || undefined,
      webhookMethod: normaliseWebhookMethod(raw.config?.webhookMethod),
      webhookHeaders: cleanText(raw.config?.webhookHeaders, 8_000) || undefined,
      webhookBody: cleanText(raw.config?.webhookBody, 20_000) || undefined,
    },
  };
}

function normaliseOperator(value: unknown): AutomationConditionOperator {
  return value === "not-equals" || value === "contains" || value === "starts-with" || value === "ends-with" || value === "greater-than" || value === "less-than" || value === "exists" || value === "not-exists"
    ? value
    : "equals";
}

function normaliseWebhookMethod(value: unknown): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  return value === "GET" || value === "PUT" || value === "PATCH" || value === "DELETE" ? value : "POST";
}

function defaultNodeLabel(kind: AutomationWorkflowNode["kind"]): string {
  if (kind === "trigger") return "Start";
  if (kind === "delay") return "Wait";
  if (kind === "condition") return "Check condition";
  return "Take action";
}

function normaliseEdges(rawEdges: AutomationWorkflowEdge[], nodeIds: Set<string>): AutomationWorkflowEdge[] {
  const seen = new Set<string>();
  return rawEdges.flatMap((raw, index) => {
    const source = cleanText(raw.source, 100);
    const target = cleanText(raw.target, 100);
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return [];
    const key = `${source}:${raw.sourceHandle ?? "next"}:${target}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: cleanText(raw.id, 160) || `edge_${index}_${source}_${target}`,
      source,
      target,
      sourceHandle: raw.sourceHandle === "yes" || raw.sourceHandle === "no" ? raw.sourceHandle : undefined,
    }];
  });
}

function normaliseGraph(nodes: AutomationWorkflowNode[] = [], edges: AutomationWorkflowEdge[] = []) {
  const cleanNodes = nodes.slice(0, MAX_NODES).map(normaliseNode);
  const nodeIds = new Set<string>();
  const uniqueNodes = cleanNodes.filter(node => {
    if (nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
    return true;
  });
  return { nodes: uniqueNodes, edges: normaliseEdges(edges, nodeIds) };
}

export function validateAutomationGraph(workflow: Pick<AutomationWorkflow, "nodes" | "edges">): string[] {
  const errors: string[] = [];
  const triggers = workflow.nodes.filter(node => node.kind === "trigger");
  const actions = workflow.nodes.filter(node => node.kind === "action");
  if (triggers.length !== 1) errors.push("An active automation needs exactly one trigger.");
  if (actions.length === 0) errors.push("Add at least one action before activating this automation.");
  if (workflow.nodes.length > MAX_NODES) errors.push(`Automations can contain up to ${MAX_NODES} nodes.`);
  const ids = new Set(workflow.nodes.map(node => node.id));
  if (ids.size !== workflow.nodes.length) errors.push("Every node needs a unique id.");
  if (workflow.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target)) {
    errors.push("One or more connections are invalid.");
  }
  if (triggers[0]) {
    const reachable = reachableNodeIds(triggers[0].id, workflow.edges);
    if (!actions.some(action => reachable.has(action.id))) errors.push("Connect the trigger to at least one action.");
  }
  if (graphHasCycle(workflow.nodes, workflow.edges)) errors.push("Automation loops are not supported. Remove the circular connection.");
  for (const node of workflow.nodes) {
    if (node.kind === "trigger" && !node.config.triggerType) errors.push(`Choose a trigger for "${node.config.label}".`);
    if (node.kind === "trigger" && node.config.triggerType === "custom.event" && !node.config.eventName) errors.push(`Enter an event name for "${node.config.label}".`);
    if (node.kind === "condition" && !node.config.conditionType) errors.push(`Choose a condition for "${node.config.label}".`);
    if (node.kind === "action" && !node.config.actionType) errors.push(`Choose an action for "${node.config.label}".`);
    if (node.kind === "action" && node.config.actionType === "send-webhook" && !node.config.webhookUrl) errors.push(`Enter a webhook URL for "${node.config.label}".`);
  }
  return [...new Set(errors)];
}

function reachableNodeIds(start: string, edges: AutomationWorkflowEdge[]): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) if (edge.source === current) queue.push(edge.target);
  }
  return seen;
}

function graphHasCycle(nodes: AutomationWorkflowNode[], edges: AutomationWorkflowEdge[]): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const edge of edges) if (edge.source === nodeId && visit(edge.target)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return nodes.some(node => visit(node.id));
}

export function listAutomationFolders(agencyId: string): AutomationFolder[] {
  return Object.values(getState().automationFolders)
    .filter(folder => folder.agencyId === agencyId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getAutomationFolder(agencyId: string, folderId: string): AutomationFolder | null {
  const folder = getState().automationFolders[folderId];
  return folder?.agencyId === agencyId ? folder : null;
}

export function createAutomationFolder(
  agencyId: string,
  input: { name?: string; description?: string; color?: string },
  actorUserId: string,
): AutomationFolder {
  const name = cleanText(input.name, 100);
  if (!name) throw new Error("Folder name required.");
  const duplicate = listAutomationFolders(agencyId).some(folder => folder.name.toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error("An automation folder with that name already exists.");
  const now = Date.now();
  const folder: AutomationFolder = {
    id: id("autofolder"),
    agencyId,
    name,
    description: cleanText(input.description, 500) || undefined,
    color: normaliseFolderColor(input.color),
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.automationFolders[folder.id] = folder; });
  logActivity({ agencyId, actorUserId, category: "system", action: "automation.folder_created", message: `Created automation folder "${folder.name}".`, metadata: { folderId: folder.id } });
  return folder;
}

export function updateAutomationFolder(
  agencyId: string,
  folderId: string,
  input: { name?: string; description?: string; color?: string },
  actorUserId: string,
): AutomationFolder | null {
  const existing = getAutomationFolder(agencyId, folderId);
  if (!existing) return null;
  const name = input.name === undefined ? existing.name : cleanText(input.name, 100);
  if (!name) throw new Error("Folder name required.");
  const duplicate = listAutomationFolders(agencyId).some(folder => folder.id !== folderId && folder.name.toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error("An automation folder with that name already exists.");
  const folder: AutomationFolder = {
    ...existing,
    name,
    description: input.description === undefined ? existing.description : cleanText(input.description, 500) || undefined,
    color: input.color === undefined ? existing.color : normaliseFolderColor(input.color),
    updatedAt: Date.now(),
  };
  mutate(state => { state.automationFolders[folder.id] = folder; });
  logActivity({ agencyId, actorUserId, category: "system", action: "automation.folder_updated", message: `Updated automation folder "${folder.name}".`, metadata: { folderId: folder.id } });
  return folder;
}

export function deleteAutomationFolder(agencyId: string, folderId: string, actorUserId: string): boolean {
  const folder = getAutomationFolder(agencyId, folderId);
  if (!folder) return false;
  mutate(state => {
    delete state.automationFolders[folderId];
    for (const workflow of Object.values(state.automationWorkflows)) {
      if (workflow.agencyId === agencyId && workflow.folderId === folderId) {
        workflow.folderId = undefined;
        workflow.updatedAt = Date.now();
      }
    }
  });
  logActivity({ agencyId, actorUserId, category: "system", action: "automation.folder_deleted", message: `Deleted automation folder "${folder.name}". Its flows were moved to Unfiled.`, metadata: { folderId } });
  return true;
}

function normaliseFolderColor(value: unknown): string {
  return typeof value === "string" && FOLDER_COLORS.has(value) ? value : "teal";
}

export function listAutomationWorkflows(agencyId: string): AutomationWorkflow[] {
  return Object.values(getState().automationWorkflows)
    .filter(workflow => workflow.agencyId === agencyId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getAutomationWorkflow(agencyId: string, workflowId: string): AutomationWorkflow | null {
  const workflow = getState().automationWorkflows[workflowId];
  return workflow?.agencyId === agencyId ? workflow : null;
}

export function listAutomationRuns(agencyId: string, workflowId?: string, limit = 100): AutomationRun[] {
  return Object.values(getState().automationRuns)
    .filter(run => run.agencyId === agencyId && (!workflowId || run.workflowId === workflowId))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, Math.min(Math.max(limit, 1), 250));
}

export function createAutomationWorkflow(
  agencyId: string,
  input: SaveAutomationWorkflowInput,
  actorUserId: string,
): AutomationWorkflow {
  const now = Date.now();
  const graph = normaliseGraph(input.nodes, input.edges);
  const status = input.status === "active" || input.status === "paused" ? input.status : "draft";
  const workflow: AutomationWorkflow = {
    id: id("auto"),
    agencyId,
    name: cleanText(input.name, 160) || "Untitled automation",
    description: cleanText(input.description, 1_000) || undefined,
    folderId: resolveAutomationFolderId(agencyId, input.folderId),
    status,
    ...graph,
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  if (status === "active") assertActivatable(workflow);
  mutate(state => { state.automationWorkflows[workflow.id] = workflow; });
  logActivity({ agencyId, actorUserId, category: "system", action: "automation.created", message: `Created automation "${workflow.name}".`, metadata: { workflowId: workflow.id } });
  return workflow;
}

export function updateAutomationWorkflow(
  agencyId: string,
  workflowId: string,
  input: SaveAutomationWorkflowInput,
  actorUserId: string,
): AutomationWorkflow | null {
  const existing = getAutomationWorkflow(agencyId, workflowId);
  if (!existing) return null;
  const graph = input.nodes || input.edges
    ? normaliseGraph(input.nodes ?? existing.nodes, input.edges ?? existing.edges)
    : { nodes: existing.nodes, edges: existing.edges };
  const status = input.status ?? existing.status;
  const updated: AutomationWorkflow = {
    ...existing,
    name: input.name === undefined ? existing.name : cleanText(input.name, 160) || existing.name,
    description: input.description === undefined ? existing.description : cleanText(input.description, 1_000) || undefined,
    folderId: input.folderId === undefined ? existing.folderId : resolveAutomationFolderId(agencyId, input.folderId),
    status,
    ...graph,
    updatedAt: Date.now(),
  };
  if (status === "active") assertActivatable(updated);
  mutate(state => { state.automationWorkflows[workflowId] = updated; });
  logActivity({ agencyId, actorUserId, category: "system", action: "automation.updated", message: `Updated automation "${updated.name}".`, metadata: { workflowId, status } });
  return updated;
}

export function duplicateAutomationWorkflow(agencyId: string, workflowId: string, actorUserId: string): AutomationWorkflow | null {
  const workflow = getAutomationWorkflow(agencyId, workflowId);
  if (!workflow) return null;
  return createAutomationWorkflow(agencyId, {
    name: `${workflow.name} copy`,
    description: workflow.description,
    folderId: workflow.folderId,
    status: "draft",
    nodes: workflow.nodes.map(node => ({ ...node, position: { ...node.position }, config: { ...node.config } })),
    edges: workflow.edges.map(edge => ({ ...edge })),
  }, actorUserId);
}

export function deleteAutomationWorkflow(agencyId: string, workflowId: string, actorUserId: string): boolean {
  const workflow = getAutomationWorkflow(agencyId, workflowId);
  if (!workflow) return false;
  mutate(state => {
    delete state.automationWorkflows[workflowId];
    for (const run of Object.values(state.automationRuns)) {
      if (run.agencyId === agencyId && run.workflowId === workflowId) delete state.automationRuns[run.id];
    }
  });
  logActivity({ agencyId, actorUserId, category: "system", action: "automation.deleted", message: `Deleted automation "${workflow.name}".`, metadata: { workflowId } });
  return true;
}

function resolveAutomationFolderId(agencyId: string, folderId?: string | null): string | undefined {
  if (!folderId) return undefined;
  if (!getAutomationFolder(agencyId, folderId)) throw new Error("Automation folder not found.");
  return folderId;
}

function assertActivatable(workflow: Pick<AutomationWorkflow, "nodes" | "edges">): void {
  const errors = validateAutomationGraph(workflow);
  if (errors.length) throw new Error(errors.join(" "));
}

export async function triggerAutomations(
  agencyId: string,
  triggerType: string,
  eventData: Record<string, unknown> = {},
  options: { mode?: "live" | "test"; workflowId?: string; initiatedBy?: string; idempotencyKey?: string } = {},
): Promise<AutomationRun[]> {
  const eventName = cleanText(triggerType, 160);
  if (!eventName) return [];
  const workflows = listAutomationWorkflows(agencyId).filter(workflow => {
    if (options.workflowId && workflow.id !== options.workflowId) return false;
    if (!options.workflowId && workflow.status !== "active") return false;
    const trigger = workflow.nodes.find(node => node.kind === "trigger");
    if (trigger?.config.triggerType === "custom.event") return trigger.config.eventName === eventName;
    return TRIGGERS.has(eventName as AutomationTriggerType) && trigger?.config.triggerType === eventName;
  });
  const runs: AutomationRun[] = [];
  for (const workflow of workflows) {
    const workflowTrigger = workflow.nodes.find(node => node.kind === "trigger")?.config.triggerType;
    if (!workflowTrigger) continue;
    const idempotencyKey = cleanText(options.idempotencyKey, 500);
    const existing = idempotencyKey
      ? Object.values(getState().automationRuns).find(run => run.agencyId === agencyId
        && run.workflowId === workflow.id
        && run.idempotencyKey === idempotencyKey)
      : undefined;
    if (existing) {
      runs.push(existing);
      continue;
    }
    const run = createRun(workflow, workflowTrigger, sanitiseEventData({ ...eventData, eventName }), {
      ...options,
      idempotencyKey: idempotencyKey || undefined,
    });
    runs.push(await executeRun(run.id));
  }
  return runs;
}

export async function runAutomationWorkflow(
  agencyId: string,
  workflowId: string,
  mode: "live" | "test",
  initiatedBy: string,
  eventData: Record<string, unknown> = {},
): Promise<AutomationRun> {
  const workflow = getAutomationWorkflow(agencyId, workflowId);
  if (!workflow) throw new Error("Automation not found.");
  if (mode === "live") assertActivatable(workflow);
  const trigger = workflow.nodes.find(node => node.kind === "trigger");
  if (!trigger?.config.triggerType) throw new Error("Choose a trigger before running this automation.");
  const run = createRun(workflow, trigger.config.triggerType, sanitiseEventData(eventData), { mode, initiatedBy });
  return executeRun(run.id);
}

function createRun(
  workflow: AutomationWorkflow,
  triggerType: AutomationTriggerType,
  eventData: EventData,
  options: { mode?: "live" | "test"; initiatedBy?: string; idempotencyKey?: string },
): AutomationRun {
  const trigger = workflow.nodes.find(node => node.kind === "trigger");
  if (!trigger) throw new Error("Automation trigger missing.");
  const now = Date.now();
  const run: AutomationRun = {
    id: id("run"),
    agencyId: workflow.agencyId,
    workflowId: workflow.id,
    triggerType,
    mode: options.mode ?? "live",
    status: "running",
    currentNodeId: trigger.id,
    completedNodeIds: [],
    eventData,
    logs: [{ at: now, nodeId: trigger.id, level: "info", message: `${runModeLabel(options.mode)} run started by ${triggerType}.` }],
    initiatedBy: options.initiatedBy,
    idempotencyKey: options.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => {
    state.automationRuns[run.id] = run;
    const current = state.automationWorkflows[workflow.id];
    if (current) {
      current.runCount += 1;
      current.lastRunAt = now;
      current.updatedAt = now;
    }
  });
  return run;
}

function runModeLabel(mode?: "live" | "test"): string {
  return mode === "test" ? "Test" : "Live";
}

async function executeRun(runId: string): Promise<AutomationRun> {
  for (let step = 0; step < MAX_RUN_STEPS; step += 1) {
    const run = getState().automationRuns[runId];
    if (!run) throw new Error("Automation run missing.");
    if (run.status === "waiting" || isFinished(run.status)) return run;
    const workflow = getAutomationWorkflow(run.agencyId, run.workflowId);
    if (!workflow) return finishRun(run.id, "failed", "The automation was deleted before this run finished.");
    const node = workflow.nodes.find(candidate => candidate.id === run.currentNodeId);
    if (!node) return finishRun(run.id, "succeeded", "Flow reached its end.");
    if (run.completedNodeIds.includes(node.id)) return finishRun(run.id, "failed", "Execution stopped because a node was visited twice.");

    if (node.kind === "trigger") {
      appendRunLog(run.id, { nodeId: node.id, level: "success", message: `${node.config.label} received.` });
      markNodeComplete(run.id, node.id, nextNodeId(workflow, node.id));
      continue;
    }
    if (node.kind === "delay") {
      const minutes = safeNumber(node.config.delayMinutes, 60, 0, 525_600);
      const next = nextNodeId(workflow, node.id);
      if (run.mode === "test" || minutes === 0) {
        appendRunLog(run.id, { nodeId: node.id, level: "info", message: run.mode === "test" ? `Test skipped the ${formatDelay(minutes)} wait.` : "No wait was required." });
        markNodeComplete(run.id, node.id, next);
        continue;
      }
      const waitUntil = Date.now() + minutes * 60_000;
      appendRunLog(run.id, { nodeId: node.id, level: "info", message: `Waiting ${formatDelay(minutes)} before checking live CRM state.` });
      mutate(state => {
        const current = state.automationRuns[run.id];
        if (!current) return;
        current.completedNodeIds.push(node.id);
        current.currentNodeId = next;
        current.status = "waiting";
        current.waitUntil = waitUntil;
        current.updatedAt = Date.now();
      });
      return getState().automationRuns[run.id];
    }
    if (node.kind === "condition") {
      const passed = await evaluateCondition(run, node);
      appendRunLog(run.id, { nodeId: node.id, level: "info", message: `${node.config.label}: ${passed ? "yes" : "no"}.` });
      markNodeComplete(run.id, node.id, nextNodeId(workflow, node.id, passed ? "yes" : "no"));
      continue;
    }
    try {
      await executeAction(workflow, run, node);
      markNodeComplete(run.id, node.id, nextNodeId(workflow, node.id));
    } catch (error) {
      return finishRun(run.id, "failed", error instanceof Error ? error.message : "Automation action failed.");
    }
  }
  return finishRun(runId, "failed", "Execution stopped after reaching the safety step limit.");
}

function nextNodeId(workflow: AutomationWorkflow, nodeId: string, branch?: "yes" | "no"): string | undefined {
  const outgoing = workflow.edges.filter(edge => edge.source === nodeId);
  if (branch) return outgoing.find(edge => edge.sourceHandle === branch)?.target;
  return outgoing.find(edge => !edge.sourceHandle)?.target ?? outgoing[0]?.target;
}

function markNodeComplete(runId: string, nodeId: string, next?: string): void {
  mutate(state => {
    const run = state.automationRuns[runId];
    if (!run) return;
    run.completedNodeIds.push(nodeId);
    run.currentNodeId = next;
    run.updatedAt = Date.now();
  });
  if (!next) finishRun(runId, "succeeded", "Flow completed.");
}

function appendRunLog(runId: string, entry: Omit<AutomationRunLog, "at"> & { at?: number }): void {
  mutate(state => {
    const run = state.automationRuns[runId];
    if (!run) return;
    run.logs.push({ ...entry, at: entry.at ?? Date.now() });
    if (run.logs.length > MAX_RUN_LOGS) run.logs.splice(0, run.logs.length - MAX_RUN_LOGS);
    run.updatedAt = Date.now();
  });
}

function finishRun(runId: string, status: "succeeded" | "failed" | "skipped", message: string): AutomationRun {
  const now = Date.now();
  mutate(state => {
    const run = state.automationRuns[runId];
    if (!run || isFinished(run.status)) return;
    run.status = status;
    run.currentNodeId = undefined;
    run.waitUntil = undefined;
    run.finishedAt = now;
    run.updatedAt = now;
    run.logs.push({ at: now, level: status === "failed" ? "error" : "success", message });
    const workflow = state.automationWorkflows[run.workflowId];
    if (workflow) {
      if (status === "succeeded") workflow.successCount += 1;
      if (status === "failed") workflow.failureCount += 1;
      workflow.lastOutcome = status;
      workflow.updatedAt = now;
    }
  });
  return getState().automationRuns[runId];
}

function isFinished(status: AutomationRun["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "skipped";
}

async function evaluateCondition(run: AutomationRun, node: AutomationWorkflowNode): Promise<boolean> {
  if (node.config.conditionType === "enquiry.awaiting-response") {
    const enquiryId = String(run.eventData.enquiryId ?? "");
    if (enquiryId) {
      try {
        const enquiry = (await listWebsiteEnquiries(run.agencyId, 500)).find(item => item.id === enquiryId);
        if (enquiry) return !enquiry.firstRespondedAt && enquiry.status !== "resolved";
      } catch (error) {
        appendRunLog(run.id, { nodeId: node.id, level: "info", message: `Live enquiry check was unavailable; using the captured event state (${error instanceof Error ? error.message : "unknown reason"}).` });
      }
    }
    return run.eventData.awaitingResponse !== false;
  }
  if (node.config.conditionType === "client-request.awaiting-response") {
    const clientId = String(run.eventData.clientId ?? "");
    const requestId = String(run.eventData.requestId ?? "");
    const client = clientId ? getState().clients[clientId] : undefined;
    const metadata = client?.metadata as { clientRequests?: Array<{ id: string; status?: string; replies?: Array<{ from?: string }> }> } | undefined;
    const request = metadata?.clientRequests?.find(item => item.id === requestId);
    if (request) {
      const agencyReplied = request.replies?.some(reply => reply.from === "milesymedia") ?? false;
      return request.status !== "closed" && !agencyReplied;
    }
    return run.eventData.awaitingResponse !== false;
  }
  const actual = readEventField(run.eventData, node.config.field ?? "");
  return compare(actual, node.config.operator ?? "equals", node.config.value ?? "");
}

function readEventField(data: EventData, field: string): string | number | boolean | null | undefined {
  const direct = data[field];
  if (direct !== undefined) return direct;
  return data[field.replace(/^event\./, "")];
}

function compare(actual: string | number | boolean | null | undefined, operator: AutomationConditionOperator, expected: string): boolean {
  if (operator === "exists") return actual !== undefined && actual !== null && String(actual).length > 0;
  if (operator === "not-exists") return actual === undefined || actual === null || String(actual).length === 0;
  const left = String(actual ?? "").toLowerCase();
  const right = expected.toLowerCase();
  if (operator === "not-equals") return left !== right;
  if (operator === "contains") return left.includes(right);
  if (operator === "starts-with") return left.startsWith(right);
  if (operator === "ends-with") return left.endsWith(right);
  if (operator === "greater-than" || operator === "less-than") {
    const leftNumber = Number(actual);
    const rightNumber = Number(expected);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
    return operator === "greater-than" ? leftNumber > rightNumber : leftNumber < rightNumber;
  }
  return left === right;
}

async function executeAction(workflow: AutomationWorkflow, run: AutomationRun, node: AutomationWorkflowNode): Promise<void> {
  const context = templateContext(workflow, run);
  if (node.config.actionType === "send-email") {
    const recipientTemplate = node.config.recipient || "{{owner.email}}";
    const recipient = interpolate(recipientTemplate, context);
    const subject = interpolate(node.config.subject || `Aqua automation: ${workflow.name}`, context);
    const message = interpolate(node.config.message || "Aqua has an update that needs your attention.", context);
    if (!recipient || !recipient.includes("@")) throw new Error("The email action needs a valid recipient.");
    if (run.mode === "test") {
      appendRunLog(run.id, { nodeId: node.id, level: "success", message: `Would send "${subject}" to ${recipient}.` });
      return;
    }
    const result = await sendTransactionalEmail({
      to: recipient,
      subject,
      bodyText: message,
      bodyHtml: `<p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
      agencyId: workflow.agencyId,
      externalRef: `automation:${run.id}:${node.id}`,
    });
    if (!result.delivered) throw new Error(result.reason || "The email could not be delivered.");
    appendRunLog(run.id, { nodeId: node.id, level: "success", message: `Email sent to ${recipient}.` });
    return;
  }
  if (node.config.actionType === "create-task") {
    const title = interpolate(node.config.taskTitle || node.config.label || workflow.name, context);
    const notes = interpolate(node.config.message || `Created by automation: ${workflow.name}`, context);
    if (run.mode === "test") {
      appendRunLog(run.id, { nodeId: node.id, level: "success", message: `Would create task "${title}".` });
      return;
    }
    const dueIn = safeNumber(node.config.dueInMinutes, 1_440, 0, 525_600);
    const task = createAgencyTask({
      agencyId: workflow.agencyId,
      title,
      notes,
      priority: node.config.taskPriority ?? "normal",
      dueAt: Date.now() + dueIn * 60_000,
      origin: "crm",
      sourceId: `automation:${workflow.id}:${node.id}`,
      sourceHref: "/portal/agency/marketing?view=automations",
      createdBy: run.initiatedBy || workflow.createdBy,
    });
    appendRunLog(run.id, { nodeId: node.id, level: "success", message: `Created task "${task.title}".` });
    return;
  }
  if (node.config.actionType === "log-activity") {
    const message = interpolate(node.config.message || `${workflow.name} completed an action.`, context);
    if (run.mode === "test") {
      appendRunLog(run.id, { nodeId: node.id, level: "success", message: `Would add activity: ${message}` });
      return;
    }
    logActivity({ agencyId: workflow.agencyId, actorUserId: run.initiatedBy || workflow.createdBy, category: "system", action: "automation.action", message, metadata: { workflowId: workflow.id, runId: run.id } });
    appendRunLog(run.id, { nodeId: node.id, level: "success", message: "Activity was recorded." });
    return;
  }
  if (node.config.actionType === "send-webhook") {
    const urlValue = interpolate(node.config.webhookUrl || "", context);
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      throw new Error("The webhook action needs a valid URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Webhook URLs must use HTTP or HTTPS.");
    const method = normaliseWebhookMethod(node.config.webhookMethod);
    const headers = parseWebhookHeaders(node.config.webhookHeaders, context);
    const body = interpolate(node.config.webhookBody || node.config.message || "", context);
    if (body && !Object.keys(headers).some(key => key.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    if (run.mode === "test") {
      appendRunLog(run.id, { nodeId: node.id, level: "success", message: `Would send ${method} webhook to ${url.host}.` });
      return;
    }
    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : body || undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Webhook returned ${response.status}${detail ? `: ${detail}` : "."}`);
    }
    appendRunLog(run.id, { nodeId: node.id, level: "success", message: `${method} webhook delivered to ${url.host} (${response.status}).` });
    return;
  }
  throw new Error("Choose an action before running this node.");
}

function parseWebhookHeaders(template: string | undefined, context: Record<string, string>): Record<string, string> {
  if (!template?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(interpolate(template, context));
  } catch {
    throw new Error("Webhook headers must be a valid JSON object.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Webhook headers must be a JSON object.");
  return Object.fromEntries(Object.entries(parsed).slice(0, 40).map(([key, value]) => [key.slice(0, 120), String(value).slice(0, 2_000)]));
}

function templateContext(workflow: AutomationWorkflow, run: AutomationRun): Record<string, string> {
  const agency = getAgency(workflow.agencyId);
  const owner = listUsersForAgency(workflow.agencyId).find(user => user.role === "agency-owner");
  const context: Record<string, string> = {
    "workflow.name": workflow.name,
    "owner.email": agency?.ownerEmail || owner?.email || "",
    "owner.name": owner?.name || "Owner",
    "agency.name": agency?.name || "AquaCRM",
    now: new Date().toLocaleString("en-GB"),
  };
  for (const [key, value] of Object.entries(run.eventData)) context[`event.${key}`] = value == null ? "" : String(value);
  return context;
}

function interpolate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => context[key] ?? "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function sanitiseEventData(input: Record<string, unknown>): EventData {
  const output: EventData = {};
  for (const [rawKey, value] of Object.entries(input).slice(0, 100)) {
    const key = rawKey.trim().slice(0, 120);
    if (!key) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = typeof value === "string" ? value.slice(0, 8_000) : value;
    } else if (value !== undefined) {
      output[key] = JSON.stringify(value).slice(0, 8_000);
    }
  }
  return output;
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 1_440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
  }
  const days = minutes / 1_440;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? "" : "s"}`;
}

/**
 * Runs whose wait has expired and which the scheduler has not picked up yet.
 *
 * Pure. Added 2026-08-27 (issue #21) when the sweep was taken off the Marketing
 * RENDER: a page load used to resume and EXECUTE these, which meant opening a
 * screen could send a customer an email. The sweep belongs to the scheduler, so
 * the render now reports the backlog instead of quietly working through it —
 * because a scheduler that has stopped is something to be told about, not
 * something to paper over on whichever page somebody happens to open.
 */
export function dueAutomationRuns(agencyId?: string, now = Date.now()): number {
  return Object.values(getState().automationRuns)
    .filter(run => (!agencyId || run.agencyId === agencyId)
      && run.status === "waiting"
      && (run.waitUntil ?? Number.MAX_SAFE_INTEGER) <= now)
    .length;
}

export async function processAutomationSweep(agencyId?: string): Promise<{ resumed: number; scheduled: number; failed: number }> {
  const now = Date.now();
  let resumed = 0;
  let scheduled = 0;
  let failed = 0;
  const waiting = Object.values(getState().automationRuns)
    .filter(run => (!agencyId || run.agencyId === agencyId) && run.status === "waiting" && (run.waitUntil ?? Number.MAX_SAFE_INTEGER) <= now);
  for (const run of waiting) {
    mutate(state => {
      const current = state.automationRuns[run.id];
      if (!current) return;
      current.status = "running";
      current.waitUntil = undefined;
      current.updatedAt = Date.now();
      current.logs.push({ at: Date.now(), level: "info", message: "Wait finished. Live conditions are being checked again." });
    });
    try {
      const result = await executeRun(run.id);
      resumed += 1;
      if (result.status === "failed") failed += 1;
    } catch {
      failed += 1;
      finishRun(run.id, "failed", "The delayed run could not resume.");
    }
  }

  const localDate = localDateKey(now);
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
  const scheduledWorkflows = Object.values(getState().automationWorkflows).filter(workflow => {
    if (agencyId && workflow.agencyId !== agencyId) return false;
    if (workflow.status !== "active" || workflow.lastScheduledFor === localDate) return false;
    const trigger = workflow.nodes.find(node => node.kind === "trigger" && node.config.triggerType === "schedule.daily");
    return Boolean(trigger && safeNumber(trigger.config.scheduleHour, 9, 0, 23) <= localHour);
  });
  for (const workflow of scheduledWorkflows) {
    mutate(state => {
      const current = state.automationWorkflows[workflow.id];
      if (current) current.lastScheduledFor = localDate;
    });
    try {
      const runs = await triggerAutomations(workflow.agencyId, "schedule.daily", { date: localDate }, { workflowId: workflow.id });
      scheduled += runs.length;
      failed += runs.filter(run => run.status === "failed").length;
    } catch {
      failed += 1;
    }
  }
  return { resumed, scheduled, failed };
}

function localDateKey(now: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
