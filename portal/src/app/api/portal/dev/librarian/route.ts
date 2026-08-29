import { NextResponse } from "next/server";

import { accessErrorResponse } from "@/server/accessControl";
import {
  requireDevProjectAccess,
  requireWholeWorkingTreeFounderAccess,
} from "@/lib/server/dev/devProjectAccess";
import { fileFindingWorld, findFiles } from "@/lib/server/dev/fileFinding";
import { UNRESTRICTED, isUnrestricted, scopeAllows, type DevPathScope } from "@/lib/server/dev/devPathScope";

// ─── THE LIBRARIAN — find, never edit ────────────────────────────────────────
//
// The one door to the file-finding SKILL (`src/lib/server/dev/fileFinding.ts`)
// for the Librarian's surfaces: the Dev Team drawer and Dev mode in the
// editor. Read-only by contract — the skill retrieves, this route gates, and
// nothing here writes a byte (no `flushPendingWrites`).
//
// ── The gate ─────────────────────────────────────────────────────────────────
//
// A project search requires project/explorer view and is resolved tenant-first
// through the canonical access kernel. Searching the entire checked-out Aqua
// tree is a separate local-only owner path; a project grant can never widen
// into `process.cwd()`.
//
// ── POST only. On purpose. ───────────────────────────────────────────────────
//
// A find query names what somebody is working on — client projects, unshipped
// features. A GET puts that in query strings that get logged, cached and
// prefetched; the safest way to keep questions out of logs is for this route
// to have no GET to widen. Same rationale as `editor-ai`.

type Body = {
  action?: "world";
  query?: string;
  projectId?: string;
  limit?: number;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Body | null;
    if (body?.action === "world") {
      const access = await requireWholeWorkingTreeFounderAccess();
      const world = await fileFindingWorld(access.resourceAgencyId);
      return NextResponse.json({
        ok: true,
        world: {
          docsTotal: world.docs.total,
          referencePages: world.reference.pages,
          projects: world.projects.map(project => ({ id: project.id, name: project.name, repo: project.repo })),
        },
      }, { headers: { "cache-control": "private, no-store" } });
    }
    if (!body || typeof body.query !== "string") {
      return NextResponse.json({ ok: false, error: "Ask the Librarian for something." }, { status: 400 });
    }
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    let agencyId: string;
    let allowWorkspace = false;
    let includeInternalSources = false;
    let allowSharedCredentials = false;
    let pathScope: DevPathScope = UNRESTRICTED;
    if (projectId) {
      const access = await requireDevProjectAccess({
        projectId,
        capability: "project.view",
        elementCapability: "element.development.explorer.view",
      });
      agencyId = access.resourceAgencyId;
      allowSharedCredentials = access.resolution.ownerBaseline;
      pathScope = access.pathScope;
      if (!access.project.repository || access.project.map?.repo?.source === "workspace") {
        // A workspace-backed project is Aqua's checkout, not a delegable
        // repository. The separate local-owner gate is mandatory here.
        await requireWholeWorkingTreeFounderAccess();
        allowWorkspace = true;
        includeInternalSources = true;
      }
    } else {
      agencyId = (await requireWholeWorkingTreeFounderAccess()).resourceAgencyId;
      includeInternalSources = true;
      allowSharedCredentials = true;
    }

    try {
      const result = await findFiles({
        // The access kernel's tenancy, never the request body's: nothing the
        // browser sends can widen whose repository answers.
        agencyId,
        projectId: projectId || undefined,
        query: body.query,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      }, {
        allowWorkspace,
        includeInternalSources,
        allowSharedCredentials,
      });
      // The librarian ANSWERS WITH FILE PATHS, so it is a listing like any
      // other and takes the same scope. Without this, a person narrowed to one
      // folder could still ask "where is the Stripe key configured?" and be told.
      //
      // The no-project branch above requires whole-working-tree owner access, so
      // its scope is unrestricted and this costs it nothing.
      const scoped = isUnrestricted(pathScope)
        ? result
        : {
            ...result,
            hits: result.hits.filter(hit => scopeAllows(pathScope, hit.path)),
            // Say the answer is partial. "No results" must not be read as "it is
            // not in the repository" by somebody who simply cannot see it.
            scoped: true,
          };
      return NextResponse.json({ ok: true, result: scoped }, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      if (error instanceof Error && error.message === "project_not_found") {
        return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    return accessErrorResponse(error);
  }
}
