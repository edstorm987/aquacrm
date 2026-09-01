import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type {
  DevelopmentResource,
  DevelopmentResourceFile,
  DevelopmentResourceKind,
  DevelopmentResourceVisibility,
  DevelopmentWorkflow,
  DevelopmentWorkflowStage,
  Role,
} from "./types";
import { pendingPrivateObjectDeletionSnapshots } from "@/lib/server/privateObjectLifecycle";

const KINDS: DevelopmentResourceKind[] = [
  "tool", "app", "design-inspiration", "saved-page", "template", "git-template",
  "component", "seo-tool", "canva-template", "inspiration-pack", "course",
  "knowledge", "credential", "sop",
];
const AGENCY_ROLES: Role[] = ["agency-owner", "agency-manager", "agency-staff"];
const DEFAULT_STAGES = [
  ["discover", "Discover", "Research, references, audience and useful examples."],
  ["plan", "Plan", "Scope, structure, content and technical choices."],
  ["design", "Design", "Visual direction, components and approval-ready work."],
  ["build", "Build", "Reusable code, integrations and implementation."],
  ["quality", "Quality", "Content, accessibility, SEO and device checks."],
  ["launch", "Launch", "Production, monitoring, handover and release."],
  ["care", "Care", "Support, measurement, updates and iteration."],
] as const;

export interface DevelopmentResourceInput {
  kind?: DevelopmentResourceKind;
  title?: string;
  description?: string;
  category?: string;
  url?: string;
  localPath?: string;
  framework?: string;
  codeSnippet?: string;
  tags?: string[];
  workflowStageIds?: string[];
  sopIds?: string[];
  companyIds?: string[];
  visibility?: DevelopmentResourceVisibility;
  file?: DevelopmentResourceFile;
  credential?: {
    loginUrl?: string;
    username?: string;
    password?: string;
    passwordManagerUrl?: string;
    accessRoles?: Role[];
    notes?: string;
  };
}

export interface DevelopmentWorkflowInput {
  name?: string;
  description?: string;
  productCategory?: string;
  stages?: Array<Partial<DevelopmentWorkflowStage>>;
  active?: boolean;
}

export function listDevelopmentResources(agencyId: string): DevelopmentResource[] {
  return Object.values(getState().developmentResources)
    .filter(resource => resource.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Toolkit/vault recovery surface only; references and search stay live-only. */
export function listDevelopmentResourcesWithPendingDeletion(agencyId: string): DevelopmentResource[] {
  const stored = listDevelopmentResources(agencyId);
  const existingIds = new Set(stored.map(resource => resource.id));
  const pending = pendingPrivateObjectDeletionSnapshots<DevelopmentResource>(agencyId, "development-resource")
    .filter(item => !existingIds.has(item.snapshot.id))
    .map(item => ({
      ...item.snapshot,
      description: undefined,
      url: undefined,
      localPath: undefined,
      framework: undefined,
      codeSnippet: undefined,
      tags: [],
      workflowStageIds: [],
      sopIds: [],
      file: undefined,
      credential: undefined,
      deleteState: item.record.state === "delete-failed" ? "delete-failed" as const : "deleting" as const,
      deleteError: item.record.error,
      deleteStartedAt: item.record.createdAt,
    }));
  return [...stored, ...pending]
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDevelopmentResource(agencyId: string, resourceId: string): DevelopmentResource | null {
  const resource = getState().developmentResources[resourceId];
  return resource?.agencyId === agencyId ? resource : null;
}

export function listVisibleDevelopmentResources(
  agencyId: string,
  userId: string,
  role: Role,
): DevelopmentResource[] {
  return listDevelopmentResources(agencyId).filter(resource =>
    resource.visibility === "team" || resource.createdBy === userId || role === "agency-owner",
  );
}

export function listVisibleDevelopmentResourcesWithPendingDeletion(
  agencyId: string,
  userId: string,
  role: Role,
): DevelopmentResource[] {
  return listDevelopmentResourcesWithPendingDeletion(agencyId).filter(resource =>
    resource.visibility === "team" || resource.createdBy === userId || role === "agency-owner",
  );
}

export function createDevelopmentResource(
  agencyId: string,
  input: DevelopmentResourceInput,
  actorUserId: string,
): DevelopmentResource {
  const title = clean(input.title, 180);
  if (!title) throw new Error("Resource title required.");
  const kind = cleanKind(input.kind);
  const now = Date.now();
  const resource: DevelopmentResource = {
    id: `devres_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    kind,
    title,
    description: clean(input.description, 4_000) || undefined,
    category: clean(input.category, 120) || undefined,
    url: cleanUrl(input.url),
    localPath: clean(input.localPath, 1_000) || undefined,
    framework: kind === "component" ? clean(input.framework, 120) || undefined : undefined,
    codeSnippet: kind === "component" ? clean(input.codeSnippet, 40_000) || undefined : undefined,
    tags: cleanList(input.tags, 40, 80),
    workflowStageIds: cleanList(input.workflowStageIds, 30, 80),
    sopIds: cleanList(input.sopIds, 100, 120),
    companyIds: cleanList(input.companyIds, 30, 120),
    visibility: input.visibility === "private" ? "private" : "team",
    file: input.file,
    credential: kind === "credential" || (kind === "course" && input.credential) ? cleanCredential(input.credential) : undefined,
    createdBy: actorUserId,
    updatedBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.developmentResources[resource.id] = resource; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "development.resource_created",
    message: `Added ${readable(kind)} resource "${title}".`,
    metadata: { resourceId: resource.id, kind },
  });
  return resource;
}

/** Remove the owner row/audit when its uploaded binary could not be committed. */
export function rollbackDevelopmentResourceUpload(agencyId: string, storageKey: string): boolean {
  let removedId: string | undefined;
  mutate(state => {
    const resource = Object.values(state.developmentResources).find(item =>
      item.agencyId === agencyId && item.file?.storageKey === storageKey);
    if (!resource) return;
    removedId = resource.id;
    delete state.developmentResources[resource.id];
    state.activity = state.activity.filter(entry => !(
      entry.agencyId === agencyId
      && entry.action === "development.resource_created"
      && entry.metadata?.resourceId === resource.id
    ));
  });
  return Boolean(removedId);
}

export function updateDevelopmentResource(
  agencyId: string,
  resourceId: string,
  input: DevelopmentResourceInput,
  actorUserId: string,
): DevelopmentResource | null {
  if (!getState().developmentResources[resourceId]) return null;
  const existing = getDevelopmentResource(agencyId, resourceId);
  if (!existing) return null;
  const kind = input.kind === undefined ? existing.kind : cleanKind(input.kind);
  const updated: DevelopmentResource = {
    ...existing,
    kind,
    title: input.title === undefined ? existing.title : clean(input.title, 180) || existing.title,
    description: input.description === undefined ? existing.description : clean(input.description, 4_000) || undefined,
    category: input.category === undefined ? existing.category : clean(input.category, 120) || undefined,
    url: input.url === undefined ? existing.url : cleanUrl(input.url),
    localPath: input.localPath === undefined ? existing.localPath : clean(input.localPath, 1_000) || undefined,
    framework: kind === "component"
      ? input.framework === undefined ? existing.framework : clean(input.framework, 120) || undefined
      : undefined,
    codeSnippet: kind === "component"
      ? input.codeSnippet === undefined ? existing.codeSnippet : clean(input.codeSnippet, 40_000) || undefined
      : undefined,
    tags: input.tags === undefined ? existing.tags : cleanList(input.tags, 40, 80),
    workflowStageIds: input.workflowStageIds === undefined ? existing.workflowStageIds : cleanList(input.workflowStageIds, 30, 80),
    sopIds: input.sopIds === undefined ? existing.sopIds : cleanList(input.sopIds, 100, 120),
    companyIds: input.companyIds === undefined ? existing.companyIds : cleanList(input.companyIds, 30, 120),
    visibility: input.visibility === undefined ? existing.visibility : input.visibility === "private" ? "private" : "team",
    file: input.file === undefined ? existing.file : input.file,
    credential: kind === "credential" || kind === "course"
      ? mergeCredential(existing.credential, input.credential)
      : undefined,
    updatedBy: actorUserId,
    updatedAt: Date.now(),
  };
  mutate(state => { state.developmentResources[resourceId] = updated; });
  return updated;
}

export function deleteDevelopmentResource(agencyId: string, resourceId: string): DevelopmentResource | null {
  const existing = getDevelopmentResource(agencyId, resourceId);
  if (!existing) return null;
  mutate(state => { delete state.developmentResources[resourceId]; });
  return existing;
}

export function revealDevelopmentPassword(
  agencyId: string,
  resourceId: string,
  role: Role,
): string | null {
  const resource = getDevelopmentResource(agencyId, resourceId);
  if (!resource?.credential?.encryptedPassword) return null;
  if (!resource.credential.accessRoles.includes(role)) throw new Error("You do not have access to this login.");
  return decryptSecret(resource.credential.encryptedPassword);
}

export function listDevelopmentWorkflows(agencyId: string): DevelopmentWorkflow[] {
  return Object.values(getState().developmentWorkflows)
    .filter(workflow => workflow.agencyId === agencyId)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export function ensureDefaultDevelopmentWorkflow(agencyId: string, actorUserId: string): DevelopmentWorkflow {
  const existing = findDefaultDevelopmentWorkflow(agencyId);
  if (existing) {
    migrateLegacyStageRefs(agencyId, existing);
    return existing;
  }
  return createDevelopmentWorkflow(agencyId, {
    name: "Website delivery",
    description: "A reusable route from first reference to a supported live product.",
    productCategory: "Websites",
    stages: DEFAULT_STAGES.map(([id, name, description], order) => ({ id, name, description, order })),
    active: true,
  }, actorUserId);
}

function findDefaultDevelopmentWorkflow(agencyId: string): DevelopmentWorkflow | undefined {
  const workflows = listDevelopmentWorkflows(agencyId);
  return workflows.find(workflow => workflow.name === "Website delivery")
    ?? workflows.find(workflow => workflow.productCategory === "Websites")
    ?? workflows[0];
}

function migrateLegacyStageRefs(agencyId: string, workflow: DevelopmentWorkflow): void {
  const legacyIds = new Set(workflow.stages.map(stage => stage.id));
  const needsMigration = Object.values(getState().developmentResources).some(resource =>
    resource.agencyId === agencyId && resource.workflowStageIds.some(ref => legacyIds.has(ref)),
  );
  if (!needsMigration) return;
  mutate(state => {
    for (const resource of Object.values(state.developmentResources)) {
      if (resource.agencyId !== agencyId) continue;
      resource.workflowStageIds = Array.from(new Set(resource.workflowStageIds.map(ref =>
        legacyIds.has(ref) ? developmentStageRef(workflow.id, ref) : ref,
      )));
    }
  });
}

export function createDevelopmentWorkflow(
  agencyId: string,
  input: DevelopmentWorkflowInput,
  actorUserId: string,
): DevelopmentWorkflow {
  const name = clean(input.name, 160);
  if (!name) throw new Error("Workflow name required.");
  const now = Date.now();
  const workflow: DevelopmentWorkflow = {
    id: `devflow_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    name,
    description: clean(input.description, 1_000) || undefined,
    productCategory: clean(input.productCategory, 120) || undefined,
    stages: cleanStages(input.stages),
    active: input.active !== false,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.developmentWorkflows[workflow.id] = workflow; });
  return workflow;
}

export function updateDevelopmentWorkflow(
  agencyId: string,
  workflowId: string,
  input: DevelopmentWorkflowInput,
): DevelopmentWorkflow | null {
  const existing = getState().developmentWorkflows[workflowId];
  if (!existing || existing.agencyId !== agencyId) return null;
  const nextStages = input.stages === undefined ? existing.stages : reconcileWorkflowStages(existing.stages, input.stages);
  const wasLegacyDefault = findDefaultDevelopmentWorkflow(agencyId)?.id === workflowId;
  const updated: DevelopmentWorkflow = {
    ...existing,
    name: input.name === undefined ? existing.name : clean(input.name, 160) || existing.name,
    description: input.description === undefined ? existing.description : clean(input.description, 1_000) || undefined,
    productCategory: input.productCategory === undefined ? existing.productCategory : clean(input.productCategory, 120) || undefined,
    stages: nextStages,
    active: input.active === undefined ? existing.active : input.active,
    updatedAt: Date.now(),
  };
  mutate(state => {
    state.developmentWorkflows[workflowId] = updated;
    if (input.stages === undefined) return;
    for (const resource of Object.values(state.developmentResources)) {
      if (resource.agencyId !== agencyId) continue;
      const nextStageIds = new Set(nextStages.map(stage => stage.id));
      const nextRefs = resource.workflowStageIds.flatMap(ref => {
        const oldStage = existing.stages.find(stage =>
          ref === `${workflowId}:${stage.id}` || (wasLegacyDefault && ref === stage.id),
        );
        if (!oldStage) return [ref];
        return nextStageIds.has(oldStage.id) ? [`${workflowId}:${oldStage.id}`] : [];
      });
      resource.workflowStageIds = Array.from(new Set(nextRefs));
      resource.updatedAt = Date.now();
    }
  });
  return updated;
}

export function deleteDevelopmentWorkflow(agencyId: string, workflowId: string): boolean {
  const workflow = getState().developmentWorkflows[workflowId];
  if (!workflow || workflow.agencyId !== agencyId) return false;
  mutate(state => {
    delete state.developmentWorkflows[workflowId];
    for (const resource of Object.values(state.developmentResources)) {
      if (resource.agencyId !== agencyId) continue;
      resource.workflowStageIds = resource.workflowStageIds.filter(ref => !ref.startsWith(`${workflowId}:`));
    }
  });
  return true;
}

export function developmentStageRef(workflowId: string, stageId: string): string {
  return `${workflowId}:${stageId}`;
}

export function publicDevelopmentResource(resource: DevelopmentResource) {
  return {
    ...resource,
    credential: resource.credential ? {
      loginUrl: resource.credential.loginUrl,
      username: resource.credential.username,
      passwordManagerUrl: resource.credential.passwordManagerUrl,
      accessRoles: resource.credential.accessRoles,
      notes: resource.credential.notes,
      hasPassword: Boolean(resource.credential.encryptedPassword),
    } : undefined,
  };
}

function cleanCredential(input?: DevelopmentResourceInput["credential"]) {
  const accessRoles = cleanRoles(input?.accessRoles);
  return {
    loginUrl: cleanUrl(input?.loginUrl),
    username: clean(input?.username, 240) || undefined,
    encryptedPassword: input?.password ? encryptSecret(input.password.slice(0, 1_000)) : undefined,
    passwordManagerUrl: cleanUrl(input?.passwordManagerUrl),
    accessRoles,
    notes: clean(input?.notes, 2_000) || undefined,
  };
}

function mergeCredential(
  existing: DevelopmentResource["credential"],
  input?: DevelopmentResourceInput["credential"],
): DevelopmentResource["credential"] {
  if (!input) return existing ?? cleanCredential();
  const next = cleanCredential(input);
  return {
    loginUrl: input.loginUrl === undefined ? existing?.loginUrl : next.loginUrl,
    username: input.username === undefined ? existing?.username : next.username,
    encryptedPassword: input.password ? next.encryptedPassword : existing?.encryptedPassword,
    passwordManagerUrl: input.passwordManagerUrl === undefined ? existing?.passwordManagerUrl : next.passwordManagerUrl,
    accessRoles: input.accessRoles === undefined ? existing?.accessRoles ?? ["agency-owner"] : next.accessRoles,
    notes: input.notes === undefined ? existing?.notes : next.notes,
  };
}

function cleanRoles(value: unknown): Role[] {
  const values = Array.isArray(value) ? value : ["agency-owner"];
  const roles = values.filter((role): role is Role => AGENCY_ROLES.includes(role as Role));
  return Array.from(new Set(roles.length ? roles : ["agency-owner"]));
}

function cleanStages(value: unknown): DevelopmentWorkflowStage[] {
  if (!Array.isArray(value) || !value.length) {
    return DEFAULT_STAGES.map(([id, name, description], order) => ({ id, name, description, order }));
  }
  return value.slice(0, 30).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const stage = raw as Partial<DevelopmentWorkflowStage>;
    const name = clean(stage.name, 120);
    if (!name) return [];
    return [{
      id: clean(stage.id, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-") || `stage-${index + 1}`,
      name,
      description: clean(stage.description, 500) || undefined,
      order: index,
    }];
  });
}

function reconcileWorkflowStages(
  existing: DevelopmentWorkflowStage[],
  value: Array<Partial<DevelopmentWorkflowStage>>,
): DevelopmentWorkflowStage[] {
  const incoming = cleanStages(value);
  const assignments = new Map<number, DevelopmentWorkflowStage>();
  const usedIds = new Set<string>();

  incoming.forEach((stage, index) => {
    const requestedId = clean(value[index]?.id, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const match = existing.find(candidate =>
      !usedIds.has(candidate.id) &&
      ((Boolean(requestedId) && candidate.id === requestedId) ||
        candidate.name.localeCompare(stage.name, undefined, { sensitivity: "accent" }) === 0),
    );
    if (!match) return;
    assignments.set(index, match);
    usedIds.add(match.id);
  });

  incoming.forEach((_stage, index) => {
    if (assignments.has(index)) return;
    const positional = existing[index];
    if (!positional || usedIds.has(positional.id)) return;
    assignments.set(index, positional);
    usedIds.add(positional.id);
  });

  const allocatedIds = new Set(usedIds);
  return incoming.map((stage, index) => {
    const matched = assignments.get(index);
    let id = matched?.id ?? stage.id;
    let suffix = 2;
    while (allocatedIds.has(id) && id !== matched?.id) id = `${stage.id}-${suffix++}`;
    allocatedIds.add(id);
    return { ...stage, id, order: index };
  });
}

function cleanKind(value: unknown): DevelopmentResourceKind {
  return KINDS.includes(value as DevelopmentResourceKind) ? value as DevelopmentResourceKind : "tool";
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string").map(item => clean(item, maxLength)).filter(Boolean))).slice(0, maxItems)
    : [];
}

function cleanUrl(value: unknown): string | undefined {
  const text = clean(value, 1_000);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function encryptionKey(): Buffer {
  const source = process.env.PORTAL_VAULT_ENCRYPTION_KEY;
  if (!source && process.env.NODE_ENV === "production") {
    throw new Error("PORTAL_VAULT_ENCRYPTION_KEY must be configured before passwords can be stored.");
  }
  return crypto.createHash("sha256").update(source || "milesymedia-local-vault-development-key").digest();
}

function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString("base64url")).join(".");
}

function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Stored login could not be decrypted.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

function readable(value: string): string {
  return value.replaceAll("-", " ");
}
