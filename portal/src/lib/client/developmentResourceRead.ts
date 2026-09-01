import type { DevelopmentResourceKind, Role } from "@/server/types";

export interface PublicDevelopmentResource {
  id: string;
  kind: DevelopmentResourceKind;
  title: string;
  description?: string;
  category?: string;
  url?: string;
  localPath?: string;
  framework?: string;
  codeSnippet?: string;
  tags: string[];
  workflowStageIds: string[];
  sopIds: string[];
  visibility: "team" | "private";
  deleteState?: "deleting" | "delete-failed";
  deleteError?: string;
  file?: { fileName: string; contentType: string; size: number };
  credential?: {
    loginUrl?: string;
    username?: string;
    passwordManagerUrl?: string;
    accessRoles: Role[];
    notes?: string;
    hasPassword: boolean;
  };
  createdBy: string;
  updatedAt: number;
}

export interface DevelopmentResourcePage {
  ok?: boolean;
  resources: PublicDevelopmentResource[];
  total: number;
}

const RESOURCE_KINDS = new Set<DevelopmentResourceKind>([
  "tool",
  "app",
  "design-inspiration",
  "saved-page",
  "template",
  "git-template",
  "component",
  "seo-tool",
  "canva-template",
  "inspiration-pack",
  "course",
  "knowledge",
  "credential",
  "sop",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

/** A resource is renderable only when every field used by the mounted UI is safe. */
export function validPublicDevelopmentResource(value: unknown): value is PublicDevelopmentResource {
  const resource = record(value);
  if (!resource) return false;
  if (typeof resource.id !== "string" || !resource.id) return false;
  if (typeof resource.kind !== "string" || !RESOURCE_KINDS.has(resource.kind as DevelopmentResourceKind)) return false;
  if (typeof resource.title !== "string") return false;
  if (!optionalString(resource.description)
    || !optionalString(resource.category)
    || !optionalString(resource.url)
    || !optionalString(resource.localPath)
    || !optionalString(resource.framework)
    || !optionalString(resource.codeSnippet)) return false;
  if (!stringList(resource.tags) || !stringList(resource.workflowStageIds) || !stringList(resource.sopIds)) return false;
  if (resource.visibility !== "team" && resource.visibility !== "private") return false;
  if (resource.deleteState !== undefined && resource.deleteState !== "deleting" && resource.deleteState !== "delete-failed") return false;
  if (!optionalString(resource.deleteError)) return false;
  if (typeof resource.createdBy !== "string" || typeof resource.updatedAt !== "number" || !Number.isFinite(resource.updatedAt)) return false;

  if (resource.file !== undefined) {
    const file = record(resource.file);
    if (!file
      || typeof file.fileName !== "string"
      || typeof file.contentType !== "string"
      || typeof file.size !== "number"
      || !Number.isFinite(file.size)) return false;
  }

  if (resource.credential !== undefined) {
    const credential = record(resource.credential);
    if (!credential
      || !optionalString(credential.loginUrl)
      || !optionalString(credential.username)
      || !optionalString(credential.passwordManagerUrl)
      || !optionalString(credential.notes)
      || !stringList(credential.accessRoles)
      || typeof credential.hasPassword !== "boolean") return false;
  }

  return true;
}

/** Reject partial/malformed 200s instead of treating them as an empty search. */
export function validDevelopmentResourcePage(value: unknown): value is DevelopmentResourcePage {
  const page = record(value);
  return Boolean(page
    && (page.ok === undefined || page.ok === true)
    && Array.isArray(page.resources)
    && page.resources.every(validPublicDevelopmentResource)
    && typeof page.total === "number"
    && Number.isInteger(page.total)
    && page.total >= 0
    && page.total >= page.resources.length);
}
