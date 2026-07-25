import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  confirmDiscovery,
  dismissDiscovery,
  listDiscoveries,
  recordHeartbeat,
} from "../../server/discovery";
import { fail, ok, readJsonBody, readQuery } from "../helpers";

export async function handleListDiscoveries(_req: Request, ctx: PluginCtx): Promise<Response> {
  // Agency-scoped — no clientId needed.
  const records = await listDiscoveries(ctx.storage, ctx.agencyId);
  return ok({ discoveries: records });
}

export async function handleHeartbeat(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await readJsonBody<{ host?: string; metadata?: Record<string, unknown> }>(req);
  if (!body?.host) return fail("host required", 400);
  const record = await recordHeartbeat(ctx.storage, ctx.agencyId, body.host, body.metadata);
  return ok({ record });
}

export async function handleDismissDiscovery(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await readJsonBody<{ host?: string }>(req);
  if (!body?.host) return fail("host required", 400);
  const ok_ = await dismissDiscovery(ctx.storage, ctx.agencyId, body.host);
  if (!ok_) return fail("not found", 404);
  return ok({ ok: true });
}

export async function handleConfirmDiscovery(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await readJsonBody<{ host?: string }>(req);
  if (!body?.host) return fail("host required", 400);
  const ok_ = await confirmDiscovery(ctx.storage, ctx.agencyId, body.host);
  if (!ok_) return fail("not found", 404);
  return ok({ ok: true });
}

export async function handleConfigStub(req: Request, ctx: PluginCtx): Promise<Response> {
  // `/api/portal/website-editor/config` — used by storefront for the
  // initial config snapshot. Round-1 returns a minimal payload so the
  // storefront can render; round-2 wires brand/theme/active-variants.
  const q = readQuery(req);
  return ok({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId ?? null,
    siteId: q.siteId ?? null,
  });
}
