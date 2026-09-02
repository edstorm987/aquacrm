import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { NextResponse } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import {
  FULFILMENT_TECHNICAL_ELEMENT_KEY,
  requireCurrentFulfilmentTechnicalAccess,
} from "@/lib/server/access/fulfilmentTechnicalAccess";
import {
  assertWorkspaceElementAccess,
  workspaceElementLevel,
  type WorkspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";
import { deletePrivateObjectWithRecovery, privateObjectDeletionCheckpoint, privateObjectLifecycleLockKey, privateObjectRequestHash, PrivateObjectLifecycleConflictError } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import {
  createDevelopmentResource,
  createDevelopmentWorkflow,
  deleteDevelopmentWorkflow,
  developmentStageRef,
  ensureDefaultDevelopmentWorkflow,
  getDevelopmentResource,
  listDevelopmentWorkflows,
  listDevelopmentResourcesWithPendingDeletion,
  listVisibleDevelopmentResources,
  listVisibleDevelopmentResourcesWithPendingDeletion,
  publicDevelopmentResource,
  revealDevelopmentPassword,
  updateDevelopmentResource,
  updateDevelopmentWorkflow,
  type DevelopmentResourceInput,
  type DevelopmentWorkflowInput,
} from "@/server/developmentToolkit";
import { ensureHydrated } from "@/server/storage";
import type { DevelopmentResource, DevelopmentResourceKind } from "@/server/types";
import { logActivity } from "@/server/activity";
import { SopReferenceValidationError } from "@/engines/sop/server/sopReferences";

export const runtime = "nodejs";
const hasSharedLogin = (input: DevelopmentResourceInput) =>
  input.kind === "credential" || Boolean(
    input.credential?.loginUrl ||
    input.credential?.username ||
    input.credential?.password ||
    input.credential?.passwordManagerUrl ||
    input.credential?.notes,
  );

type Body =
  | { action: "resource:create"; input: DevelopmentResourceInput }
  | { action: "resource:update"; resourceId: string; input: DevelopmentResourceInput }
  | { action: "resource:delete"; resourceId: string }
  | { action: "credential:reveal"; resourceId: string }
  | { action: "workflow:create"; input: DevelopmentWorkflowInput }
  | { action: "workflow:update"; workflowId: string; input: DevelopmentWorkflowInput }
  | { action: "workflow:delete"; workflowId: string }
  | { action: "catalogue:workspace" };

function technicalRequirementForAction(action: Body["action"]): Exclude<WorkspaceElementLevel, "hidden"> {
  if (action === "credential:reveal") return "view";
  if (action.startsWith("workflow:") || action === "catalogue:workspace") return "manage";
  return "use";
}

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentFulfilmentTechnicalAccess("view");
    const session = actor.session;
    const agencyId = actor.resourceAgencyId;
    // NO SEED OR MIGRATION HERE (issue #21, 2026-08-27).
    //
    // This called `ensureDefaultDevelopmentWorkflow(...)` and DISCARDED the
    // result — it was here purely for the side effect, which both creates the
    // default workflow and runs `migrateLegacyStageRefs`, a data migration, while
    // rendering. The seed moved to `bootstrapAgency`; the migration is
    // self-extinguishing and still runs from the write paths.
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode");
    const query = params.get("q")?.trim().toLowerCase() ?? "";
    const kind = params.get("kind");
    const category = params.get("category");
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));
    const allResources = listVisibleDevelopmentResourcesWithPendingDeletion(agencyId, session.userId, session.role)
      .filter(resource => mode === "vault"
        ? ["course", "knowledge", "credential", "sop"].includes(resource.kind)
        : mode === "toolkit"
          ? !["course", "knowledge", "credential", "sop"].includes(resource.kind)
          : true)
      .filter(resource => !kind || kind === "all" || resource.kind === kind)
      .filter(resource => !category || category === "all" || resource.category === category)
      .filter(resource => !query || `${resource.title} ${resource.description ?? ""} ${resource.category ?? ""} ${resource.tags.join(" ")} ${resource.localPath ?? ""} ${resource.framework ?? ""} ${resource.codeSnippet ?? ""}`.toLowerCase().includes(query));
    return NextResponse.json({
      ok: true,
      resources: allResources.slice(offset, offset + limit).map(publicDevelopmentResource),
      total: allResources.length,
      workflows: listDevelopmentWorkflows(agencyId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const { actor, access } = await requireCurrentFulfilmentTechnicalAccess("view");
    const session = actor.session;
    const agencyId = actor.resourceAgencyId;
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Action required." }, { status: 400 });
    assertWorkspaceElementAccess(
      access,
      FULFILMENT_TECHNICAL_ELEMENT_KEY,
      technicalRequirementForAction(body.action),
    );
    const canManageTechnical = workspaceElementLevel(access, FULFILMENT_TECHNICAL_ELEMENT_KEY) === "manage";

    if (body.action === "resource:create") {
      if (hasSharedLogin(body.input) && !canManageTechnical) {
        return NextResponse.json({ ok: false, error: "Technical Manage access is required to add shared logins." }, { status: 403 });
      }
      const resource = await withPortalStateTransaction(privateObjectLifecycleLockKey(agencyId), () =>
        createDevelopmentResource(agencyId, body.input, session.userId));
      return NextResponse.json({ ok: true, resource: publicDevelopmentResource(resource) }, { status: 201 });
    }

    if (body.action === "resource:update") {
      // The resource may own a private upload. Keep the authoritative read,
      // authorization decision and update in the same lifecycle lane as
      // permanent deletion, so a writer that saw the old row cannot recreate
      // it after the provider has deleted its binary.
      const outcome = await withPortalStateTransaction(
        privateObjectLifecycleLockKey(agencyId),
        () => {
          const existing = getDevelopmentResource(agencyId, body.resourceId);
          if (!existing) return { error: "Resource not found.", status: 404 } as const;
          if (!canManageTechnical && existing.createdBy !== session.userId) {
            return { error: "You cannot edit this resource.", status: 403 } as const;
          }
          if ((existing.kind === "credential" || Boolean(existing.credential) || hasSharedLogin(body.input)) && !canManageTechnical) {
            return { error: "Technical Manage access is required to edit shared logins.", status: 403 } as const;
          }
          return {
            resource: updateDevelopmentResource(agencyId, body.resourceId, body.input, session.userId),
          };
        },
      );
      if ("error" in outcome) {
        return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.status });
      }
      return NextResponse.json({ ok: true, resource: outcome.resource ? publicDevelopmentResource(outcome.resource) : null });
    }

    if (body.action === "resource:delete") {
      const existing = getDevelopmentResource(agencyId, body.resourceId)
        ?? privateObjectDeletionCheckpoint<DevelopmentResource>(agencyId, "development-resource", body.resourceId)?.snapshot;
      if (!existing) return NextResponse.json({ ok: false, error: "Resource not found." }, { status: 404 });
      if ((existing.kind === "credential" || Boolean(existing.credential)) && !canManageTechnical) {
        return NextResponse.json({ ok: false, error: "Technical Manage access is required to delete shared logins." }, { status: 403 });
      }
      if (!canManageTechnical && existing.createdBy !== session.userId) {
        return NextResponse.json({ ok: false, error: "You cannot delete this resource." }, { status: 403 });
      }
      const result = await deletePrivateObjectWithRecovery<DevelopmentResource>({
        agencyId,
        purpose: "development-resource",
        objectId: body.resourceId,
        requestHash: privateObjectRequestHash([agencyId, body.resourceId, "permanent-delete"]),
        localDirectory: "development-uploads",
        checkpointSnapshot: snapshot => ({
          ...snapshot,
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
        }),
        completedSnapshot: snapshot => ({ id: snapshot.id, agencyId: snapshot.agencyId, title: snapshot.title, createdBy: snapshot.createdBy }),
        prepare(state) {
          const current = state.developmentResources[body.resourceId];
          if (!current || current.agencyId !== agencyId) throw new Error("Resource not found.");
          delete state.developmentResources[body.resourceId];
          return { snapshot: current, storageProvider: current.file?.storageProvider, storageKey: current.file?.storageKey };
        },
      });
      if (!result.ok) {
        const recoveryResource = listDevelopmentResourcesWithPendingDeletion(agencyId)
          .find(resource => resource.id === body.resourceId);
        return NextResponse.json({
          ok: false,
          code: "storage_delete_failed",
          error: `“${existing.title}” is queued for recovery — retry the delete after the storage provider is available.`,
          detail: result.error,
          resource: recoveryResource ? publicDevelopmentResource(recoveryResource) : undefined,
        }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "credential:reveal") {
      const resource = getDevelopmentResource(agencyId, body.resourceId);
      if (!resource || (resource.visibility === "private" && resource.createdBy !== session.userId && session.role !== "agency-owner")) {
        return NextResponse.json({ ok: false, error: "Login not found." }, { status: 404 });
      }
      try {
        const password = revealDevelopmentPassword(agencyId, body.resourceId, session.role);
        logActivity({
          agencyId,
          actorUserId: session.userId,
          actorEmail: session.email,
          category: "settings",
          action: "development.credential_revealed",
          message: `Revealed shared login "${resource.title}".`,
          metadata: { resourceId: resource.id },
        });
        return NextResponse.json({ ok: true, password });
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Access denied." }, { status: 403 });
      }
    }

    if (body.action === "workflow:create" || body.action === "workflow:update" || body.action === "workflow:delete") {
      // Updating/deleting a workflow rewrites resource stage references, and
      // creating the first/default workflow may run the legacy reference
      // migration. Serialize the complete branch with resource deletion.
      return withPortalStateTransaction(privateObjectLifecycleLockKey(agencyId), () => {
        if (body.action === "workflow:create") {
          const workflow = createDevelopmentWorkflow(agencyId, body.input, session.userId);
          return NextResponse.json({ ok: true, workflow }, { status: 201 });
        }
        if (body.action === "workflow:update") {
          const workflow = updateDevelopmentWorkflow(agencyId, body.workflowId, body.input);
          return workflow ? NextResponse.json({ ok: true, workflow }) : NextResponse.json({ ok: false, error: "Workflow not found." }, { status: 404 });
        }
        const deleted = deleteDevelopmentWorkflow(agencyId, body.workflowId);
        return NextResponse.json({ ok: deleted }, { status: deleted ? 200 : 404 });
      });
    }

    if (body.action === "catalogue:workspace") {
      // `ensureDefaultDevelopmentWorkflow` can migrate every resource's stage
      // refs. Keep migration, workspace scan and imports on one snapshot so a
      // concurrent resource delete cannot be overwritten by the bulk rewrite.
      return withPortalStateTransaction(privateObjectLifecycleLockKey(agencyId), async () => {
        const defaultWorkflow = ensureDefaultDevelopmentWorkflow(agencyId, session.userId);
        const candidates = await scanWorkspace(defaultWorkflow.id);
        const existingPaths = new Set(listVisibleDevelopmentResources(agencyId, session.userId, session.role).map(resource => resource.localPath).filter(Boolean));
        const imported = candidates
          .filter(candidate => !existingPaths.has(candidate.localPath))
          .map(candidate => publicDevelopmentResource(createDevelopmentResource(agencyId, candidate, session.userId)));
        return NextResponse.json({ ok: true, imported, skipped: candidates.length - imported.length });
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof SopReferenceValidationError) {
      return NextResponse.json({
        ok: false,
        reason: error.code,
        error: error.message,
        field: error.field,
        sopIds: error.sopIds,
      }, { status: 422 });
    }
    if (error instanceof PrivateObjectLifecycleConflictError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
    return authErrorResponse(error);
  }
}

async function scanWorkspace(workflowId: string): Promise<DevelopmentResourceInput[]> {
  const portalRoot = process.cwd();
  const workspaceRoot = resolve(portalRoot, "../../..");
  const output: DevelopmentResourceInput[] = [];

  const moduleRoot = resolve(portalRoot, "..", "github-templates", "modules");
  for (const entry of await safeDirectories(moduleRoot)) {
    const packagePath = join(moduleRoot, entry, "package.json");
    const packageJson = await readJson(packagePath);
    output.push({
      kind: entry.includes("seo") || entry.includes("rank") ? "seo-tool" : "git-template",
      title: readableName(entry),
      description: typeof packageJson?.description === "string" ? packageJson.description : "Reusable Milesymedia module.",
      category: "Git modules",
      localPath: relative(workspaceRoot, join(moduleRoot, entry)),
      tags: ["catalogued", "module", entry],
      workflowStageIds: entry.includes("ga4") || entry.includes("notifications")
        ? [developmentStageRef(workflowId, "launch"), developmentStageRef(workflowId, "care")]
        : [developmentStageRef(workflowId, "build")],
      visibility: "team",
    });
  }

  const starterRoot = resolve(portalRoot, "..", "github-templates", "starters");
  for (const entry of await safeDirectories(starterRoot)) {
    output.push({
      kind: "git-template",
      title: `${readableName(entry)} starter`,
      description: "Reusable project starting point.",
      category: "Project starters",
      localPath: relative(workspaceRoot, join(starterRoot, entry)),
      tags: ["catalogued", "starter"],
      workflowStageIds: [developmentStageRef(workflowId, "plan"), developmentStageRef(workflowId, "build")],
      visibility: "team",
    });
  }

  const researchRoot = join(workspaceRoot, "01 development", "context", "prior research");
  const researchFiles = (await safeFiles(researchRoot)).filter(file => file.endsWith(".md")).slice(0, 400);
  for (const file of researchFiles) {
    output.push({
      kind: "knowledge",
      title: readableName(file.replace(/\.md$/i, "")),
      description: "Existing development research imported into AquaCRM.",
      category: "Prior research",
      localPath: relative(workspaceRoot, join(researchRoot, file)),
      tags: ["catalogued", "research"],
      visibility: "team",
    });
  }

  const topLevelDevelopment = join(workspaceRoot, "01 development");
  for (const file of (await safeFiles(topLevelDevelopment)).filter(file => file.endsWith(".md"))) {
    output.push({
      kind: "knowledge",
      title: readableName(file.replace(/\.md$/i, "")),
      category: "Development notes",
      localPath: relative(workspaceRoot, join(topLevelDevelopment, file)),
      tags: ["catalogued", "notes"],
      visibility: "team",
    });
  }

  const scriptTemplates = join(workspaceRoot, "scripts", "templates");
  for (const file of await safeFiles(scriptTemplates)) {
    output.push({
      kind: "template",
      title: readableName(file),
      category: "Deployment templates",
      localPath: relative(workspaceRoot, join(scriptTemplates, file)),
      tags: ["catalogued", "deployment"],
      workflowStageIds: [developmentStageRef(workflowId, "launch")],
      visibility: "team",
    });
  }

  const inspirationRoot = resolve(portalRoot, "..", "development-assets", "inspiration");
  for (const absolutePath of (await recursiveFiles(inspirationRoot)).filter(isImage)) {
    const collection = readableName(relative(inspirationRoot, absolutePath).split(/[\\/]/)[0] ?? "Saved inspiration");
    output.push({
      kind: "design-inspiration",
      title: `${collection} · ${readableName(absolutePath.split(/[\\/]/).at(-1) ?? "Reference")}`,
      description: "Saved visual reference available inside the Development toolkit.",
      category: collection,
      localPath: relative(workspaceRoot, absolutePath),
      tags: ["catalogued", "inspiration", "screenshot"],
      workflowStageIds: [
        developmentStageRef(workflowId, "discover"),
        developmentStageRef(workflowId, "design"),
      ],
      visibility: "team",
    });
  }
  return output;
}

async function safeDirectories(path: string): Promise<string[]> {
  return readdir(path, { withFileTypes: true }).then(entries => entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()).catch(() => []);
}

async function safeFiles(path: string): Promise<string[]> {
  return readdir(path, { withFileTypes: true }).then(entries => entries.filter(entry => entry.isFile()).map(entry => entry.name).sort()).catch(() => []);
}

async function recursiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const output: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await recursiveFiles(path));
    if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

function isImage(path: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  return readFile(path, "utf8").then(value => JSON.parse(value) as Record<string, unknown>).catch(() => null);
}

function readableName(value: string): string {
  return value.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
