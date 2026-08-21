import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import {
  deleteDevProject,
  listDevProjects,
  saveDevProject,
} from "@/engines/editor/server/devProjects";
import { listIntegrationConnections } from "@/lib/server/integrations/integrationConnections";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { DevProjectKind } from "@/server/types";

// Dev Editor Engine — projects API.
//
// A project binds {repo, ref, github/vercel connection ids, aqua tag, kind}.
// Founder + Dev Mode only, the same layered gate as every dev-team surface:
// role first, then `devDocsAccessible`. Connections are returned alongside so
// the engine's project form can offer the ones already in the vault without
// ever handling a secret itself.

type Body = {
  action?: "save" | "delete";
  id?: string;
  name?: string;
  kind?: DevProjectKind;
  repository?: string;
  ref?: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagId?: string;
  clientId?: string;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required." }, { status: 403 });
    }
    const connections = listIntegrationConnections(session.agencyId);
    return NextResponse.json({
      ok: true,
      projects: listDevProjects(session.agencyId),
      // Browser-safe projections only (no encrypted secrets) — the engine shows
      // which connections exist so a project can be bound to one.
      githubConnections: connections.filter(c => c.provider === "github"),
      vercelConnections: connections.filter(c => c.provider === "vercel"),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required." }, { status: 403 });
    }
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Choose a project action." }, { status: 400 });

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      const removed = deleteDevProject(session.agencyId, body.id, session.userId);
      if (!removed) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, projects: listDevProjects(session.agencyId) });
    }

    try {
      const project = saveDevProject({
        agencyId: session.agencyId,
        id: body.id,
        name: body.name ?? "",
        kind: body.kind,
        repository: body.repository,
        ref: body.ref,
        githubConnectionId: body.githubConnectionId,
        vercelConnectionId: body.vercelConnectionId,
        aquaTagId: body.aquaTagId,
        clientId: body.clientId,
        actorUserId: session.userId,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, project, projects: listDevProjects(session.agencyId) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message = code === "integration_not_found"
        ? "That saved connection could not be found."
        : code.startsWith("connection_provider_mismatch:")
          ? `That connection is not a ${code.split(":")[1]} connection.`
          : code === "project_not_found"
            ? "That project could not be found."
            : code || "That project could not be saved.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
