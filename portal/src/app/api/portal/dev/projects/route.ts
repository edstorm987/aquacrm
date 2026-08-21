import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  DEV_PROJECT_TYPES,
  deleteDevProject,
  listDevProjects,
  saveDevProject,
} from "@/lib/server/dev/devProjects";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES, type DevProjectType } from "@/server/types";

/**
 * Dev Editor Engine projects — list, save, delete.
 *
 * Projects carry connection ids, never credentials, so the whole row is safe
 * to return to any agency role. Writes are owner/manager, the same bar as
 * saving the connections a project binds.
 */

type Body = {
  action?: "save" | "delete";
  projectId?: string;
  name?: string;
  type?: DevProjectType;
  repository?: string;
  ref?: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagSiteId?: string;
};

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({
      ok: true,
      projects: listDevProjects(session.agencyId),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Choose a project action." }, { status: 400 });

    if (body.action === "save") {
      if (!body.type || !DEV_PROJECT_TYPES.includes(body.type)) {
        return NextResponse.json({ ok: false, error: "Choose what this project is — software, website, or portal." }, { status: 400 });
      }
      const project = saveDevProject({
        agencyId: session.agencyId,
        projectId: body.projectId,
        name: body.name ?? "",
        type: body.type,
        repository: body.repository ?? "",
        ref: body.ref,
        githubConnectionId: body.githubConnectionId,
        vercelConnectionId: body.vercelConnectionId,
        aquaTagSiteId: body.aquaTagSiteId,
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, project, projects: listDevProjects(session.agencyId) });
    }

    if (body.action === "delete") {
      if (!body.projectId) return NextResponse.json({ ok: false, error: "Choose a project." }, { status: 400 });
      deleteDevProject({
        agencyId: session.agencyId,
        projectId: body.projectId,
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, projects: listDevProjects(session.agencyId) });
    }

    return NextResponse.json({ ok: false, error: "Unsupported project action." }, { status: 400 });
  } catch (error) {
    const message = managementError(error);
    if (message) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    return authErrorResponse(error);
  }
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function managementError(error: unknown): string | null {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    dev_project_not_found: "That project could not be found.",
    dev_project_name_required: "Give the project a name.",
    dev_project_type_invalid: "Choose what this project is — software, website, or portal.",
    dev_project_repository_invalid: "Repository must be owner/name, exactly as GitHub spells it.",
    "dev_project_connection_invalid:github": "That GitHub connection is not in this workspace.",
    "dev_project_connection_invalid:vercel": "That Vercel connection is not in this workspace.",
    dev_project_aqua_tag_invalid: "That Aqua Tag site is not in this workspace.",
  };
  return messages[code] ?? null;
}
