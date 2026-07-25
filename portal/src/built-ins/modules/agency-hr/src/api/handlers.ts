// HTTP handlers for the agency-HR plugin. Each handler unpacks a
// `PluginCtx`, calls into the per-request container built via
// `containerFor({...})`, and returns a JSON response.
//
// Conventions:
//   - 200 on success with `{ ok: true, ...payload }`
//   - 400 on validation errors
//   - 404 when the resource doesn't belong to the agency
//   - 422 when business rules block (e.g. cycles)
//   - 500 on unexpected throws

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreateDepartmentInput,
  CreateLeaveInput,
  CreateRoleInput,
  CreateStaffInput,
  DecideLeaveInput,
  LeaveFilter,
  StaffFilter,
  UpdateDepartmentPatch,
  UpdateRolePatch,
  UpdateStaffPatch,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);

function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage });

// ─── Staff ────────────────────────────────────────────────────────────────

export async function listStaffHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: StaffFilter = {
    status: (url.searchParams.get("status") ?? undefined) as StaffFilter["status"],
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    managerId: url.searchParams.get("managerId") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
  };
  const staff = await buildContainer(ctx).staff.list(filter);
  return json({ ok: true, staff });
}

export async function createStaffHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateStaffInput>(req);
  if (!body || !body.name || !body.email || !body.role || !body.title || !body.joinedAt) {
    return badRequest("name + email + role + title + joinedAt required.");
  }
  try {
    const staff = await buildContainer(ctx).staff.create(body, ctx.actor);
    return json({ ok: true, staff }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function getStaffHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const staff = await buildContainer(ctx).staff.get(id);
  return staff ? json({ ok: true, staff }) : notFound("staff not found");
}

export async function updateStaffHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateStaffPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const staff = await buildContainer(ctx).staff.update(body.id, body.patch ?? {}, ctx.actor);
    return staff ? json({ ok: true, staff }) : notFound("staff not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function archiveStaffHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; leftAt: string }>(req);
  if (!body?.id || !body.leftAt) return badRequest("id + leftAt required.");
  try {
    const staff = await buildContainer(ctx).staff.archive(body.id, ctx.actor, body.leftAt);
    return staff ? json({ ok: true, staff }) : notFound("staff not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Departments ─────────────────────────────────────────────────────────

export async function listDepartmentsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const departments = await buildContainer(ctx).departments.list();
  return json({ ok: true, departments });
}

export async function createDepartmentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateDepartmentInput>(req);
  if (!body?.name) return badRequest("name required.");
  try {
    const department = await buildContainer(ctx).departments.create(body, ctx.actor);
    return json({ ok: true, department }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateDepartmentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateDepartmentPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const department = await buildContainer(ctx).departments.update(body.id, body.patch ?? {}, ctx.actor);
    return department ? json({ ok: true, department }) : notFound("department not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteDepartmentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const ok = await buildContainer(ctx).departments.delete(id, ctx.actor);
  return ok ? json({ ok: true }) : notFound("department not found");
}

// ─── Leave ───────────────────────────────────────────────────────────────

export async function listLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: LeaveFilter = {
    status: (url.searchParams.get("status") ?? undefined) as LeaveFilter["status"],
    staffId: url.searchParams.get("staffId") ?? undefined,
    type: (url.searchParams.get("type") ?? undefined) as LeaveFilter["type"],
  };
  const leave = await buildContainer(ctx).leave.list(filter);
  return json({ ok: true, leave });
}

export async function requestLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateLeaveInput>(req);
  if (!body?.staffId || !body.type || !body.startDate || !body.endDate) {
    return badRequest("staffId + type + startDate + endDate required.");
  }
  try {
    const leave = await buildContainer(ctx).leave.request(body, ctx.actor);
    return json({ ok: true, leave }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function decideLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string } & DecideLeaveInput>(req);
  if (!body?.id || !body.status) return badRequest("id + status required.");
  try {
    const leave = await buildContainer(ctx).leave.decide(body.id, {
      status: body.status,
      approvedBy: body.approvedBy ?? ctx.actor,
      decisionNote: body.decisionNote,
    });
    return leave ? json({ ok: true, leave }) : notFound("leave request not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function cancelLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id") ?? (await safeJson<{ id: string }>(req))?.id;
  if (!id) return badRequest("id required.");
  const ok = await buildContainer(ctx).leave.cancel(id, ctx.actor);
  return ok ? json({ ok: true }) : notFound("leave request not found");
}

// ─── Roles (Employee HQ) ──────────────────────────────────────────────────

export async function listRolesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const roles = await buildContainer(ctx).roles.list();
  return json({ ok: true, roles });
}

export async function createRoleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateRoleInput>(req);
  if (!body || !body.label) return badRequest("label required.");
  try {
    const role = await buildContainer(ctx).roles.create(
      { label: body.label, permissions: body.permissions ?? [], visibleViewIds: body.visibleViewIds, requiresAuth: body.requiresAuth },
      ctx.actor,
    );
    return json({ ok: true, role }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateRoleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateRolePatch }>(req);
  if (!body?.id || !body.patch) return badRequest("id + patch required.");
  try {
    const role = await buildContainer(ctx).roles.update(body.id, body.patch, ctx.actor);
    return role ? json({ ok: true, role }) : notFound("role not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteRoleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id") ?? (await safeJson<{ id: string }>(req))?.id;
  if (!id) return badRequest("id required.");
  try {
    const ok = await buildContainer(ctx).roles.delete(id, ctx.actor);
    return ok ? json({ ok: true }) : notFound("role not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}
