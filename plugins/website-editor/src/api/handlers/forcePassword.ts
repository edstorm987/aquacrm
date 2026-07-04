// R007 — Force-password-change API handlers.
//
// All endpoints are agency-scoped (admins toggle the flag for users
// in their agency). The login-time redirect itself is foundation
// work — these handlers expose the toggle + state read.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  getRequirePasswordChange,
  setRequirePasswordChange,
  clearRequirePasswordChange,
  setRequirePasswordChangeForAgency,
  clearRequirePasswordChangeForAgency,
  listRequirePasswordChangeUsers,
} from "../../server/forcePasswordChange";
import { fail, ok, readJsonBody, readQuery } from "../helpers";

// GET /users/force-password?userId=…
//   With userId → returns `{ ok, required }` for that user.
//   Without    → returns `{ ok, users }` (the full per-user roster).
export async function handleGetForcePassword(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const q = readQuery(req);
  if (q.userId) {
    const required = await getRequirePasswordChange(ctx.storage, ctx.agencyId, q.userId);
    return ok({ required });
  }
  const users = await listRequirePasswordChangeUsers(ctx.storage, ctx.agencyId);
  return ok({ users });
}

// POST /users/force-password
//   Body: { userId, value: boolean }                   — per-user toggle
//   Body: { all: true, value: boolean }                — agency-wide toggle
export async function handleSetForcePassword(req: Request, ctx: PluginCtx): Promise<Response> {
  if (!ctx.agencyId) return fail("agency scope required", 400);
  const body = await readJsonBody<{ userId?: string; all?: boolean; value?: boolean }>(req);
  if (!body || typeof body.value !== "boolean") return fail("value (boolean) required", 400);
  const setBy = String(ctx.actor ?? "u_unknown");

  if (body.all === true) {
    if (body.value) {
      const rec = await setRequirePasswordChangeForAgency(ctx.storage, ctx.agencyId, setBy);
      return ok({ scope: "agency", record: rec });
    }
    const removed = await clearRequirePasswordChangeForAgency(ctx.storage, ctx.agencyId);
    return ok({ scope: "agency", removed });
  }

  if (!body.userId) return fail("userId required (or all:true for agency-wide)", 400);
  if (body.value) {
    const rec = await setRequirePasswordChange(ctx.storage, ctx.agencyId, body.userId, setBy);
    return ok({ scope: "user", userId: body.userId, record: rec });
  }
  const removed = await clearRequirePasswordChange(ctx.storage, ctx.agencyId, body.userId);
  return ok({ scope: "user", userId: body.userId, removed });
}
