import { NextResponse } from "next/server";

import {
  getLocalRepositoryPreviewSupervisor,
  localRepositoryPreviewProductionRefusal,
  LocalRepositoryPreviewSupervisorError,
} from "@/lib/server/dev/localRepositoryPreviewSupervisor";
import { requireDevProjectAccess } from "@/lib/server/dev/devProjectAccess";
import type { LocalRepositoryPreviewAction } from "@/lib/shared/localRepositoryPreview";
import { accessErrorResponse, AccessControlError } from "@/server/accessControl";
import { LIVE_DATA_REALM_ID } from "@/server/dataRealm";
import type { AccessCapability } from "@/server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: unknown;
  projectId?: unknown;
  limit?: unknown;
};

const ACTIONS = new Set<LocalRepositoryPreviewAction>(["status", "start", "logs", "stop", "restart"]);
const PREVIEW_CAPABILITY_BY_ACTION = {
  status: "project.preview",
  start: "dev.project.run_local",
  logs: "dev.project.logs",
  stop: "dev.project.run_local",
  restart: "dev.project.run_local",
} satisfies Record<LocalRepositoryPreviewAction, AccessCapability>;
const PREVIEW_ELEMENT_CAPABILITY_BY_ACTION = {
  status: "element.development.preview.view",
  start: "element.development.preview.use",
  logs: "element.development.preview.use",
  stop: "element.development.preview.use",
  restart: "element.development.preview.use",
} satisfies Record<LocalRepositoryPreviewAction, AccessCapability>;

function validOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function actionFrom(value: unknown): LocalRepositoryPreviewAction {
  if (typeof value !== "string" || !ACTIONS.has(value as LocalRepositoryPreviewAction)) {
    throw new AccessControlError(400, "invalid_preview_action", "Choose status, start, logs, stop or restart.");
  }
  return value as LocalRepositoryPreviewAction;
}

function projectIdFrom(value: unknown): string {
  if (typeof value !== "string") throw new AccessControlError(400, "project_required", "A project is required.");
  const projectId = value.trim();
  if (!projectId || projectId.length > 160 || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(projectId)) {
    throw new AccessControlError(400, "invalid_project", "A valid project is required.");
  }
  return projectId;
}

function logLimitFrom(value: unknown): number {
  if (value === undefined) return 100;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 400) {
    throw new AccessControlError(400, "invalid_log_limit", "Log limit must be between 1 and 400.");
  }
  return value;
}

export async function POST(request: Request) {
  try {
    if (!validOrigin(request)) {
      throw new AccessControlError(403, "invalid_origin", "Invalid request origin.");
    }
    const body = await request.json().catch(() => null) as Body | null;
    const action = actionFrom(body?.action);
    const projectId = projectIdFrom(body?.projectId);

    // Viewing lifecycle state, controlling a process and reading logs are
    // three independently toggleable permissions. Every value is checked
    // against the canonical AccessCapability type; no private Dev-Team role
    // gate and no route-local capability vocabulary is involved.
    const access = await requireDevProjectAccess({
      projectId,
      capability: PREVIEW_CAPABILITY_BY_ACTION[action],
      elementCapability: PREVIEW_ELEMENT_CAPABILITY_BY_ACTION[action],
    });

    // Capability evaluation proves resource ownership and returns the concrete
    // DevProject before any supervisor state is addressed.
    // A request never supplies an agency, worktree, port, command, args or env.
    const { project, resourceAgencyId } = access;

    const refusal = localRepositoryPreviewProductionRefusal();
    if (refusal) {
      return NextResponse.json(
        { ok: false, code: "production-refused", error: refusal },
        { status: 409, headers: { "cache-control": "private, no-store" } },
      );
    }

    if (access.session.sandbox?.access === "read-only" && ["start", "stop", "restart"].includes(action)) {
      throw new AccessControlError(403, "sandbox_read_only", "This Sandbox environment is read-only.");
    }

    const scope = {
      realmId: access.session.sandbox?.realmId ?? LIVE_DATA_REALM_ID,
      agencyId: resourceAgencyId,
      projectId,
    };
    const supervisor = getLocalRepositoryPreviewSupervisor();
    const preview = action === "status"
      ? supervisor.status(scope)
      : action === "logs"
        ? supervisor.logs(scope, logLimitFrom(body?.limit))
        : action === "start"
          ? await supervisor.start(scope, project)
          : action === "stop"
            ? await supervisor.stop(scope)
            : await supervisor.restart(scope, project);

    return NextResponse.json(
      { ok: true, preview },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof LocalRepositoryPreviewSupervisorError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: error.message },
        { status: error.status, headers: { "cache-control": "private, no-store" } },
      );
    }
    return accessErrorResponse(error);
  }
}
