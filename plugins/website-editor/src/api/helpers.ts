// Tiny helpers shared across handler modules. Round-1 minimal — Round-2
// adds proper error mapping, request logging, and rate-limit shims.

import type { PluginCtx } from "../lib/aquaPluginTypes";

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

export function ok<T>(data: T, init: ResponseInit = {}): Response {
  return json({ ok: true, ...data }, init);
}

export function fail(error: string, status = 400): Response {
  return json({ ok: false, error }, { status });
}

export async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function readQuery(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

export function requireClientScope(ctx: PluginCtx): { ok: true; agencyId: string; clientId: string } | { ok: false; res: Response } {
  if (!ctx.clientId) {
    return { ok: false, res: fail("client scope required", 400) };
  }
  return { ok: true, agencyId: ctx.agencyId, clientId: ctx.clientId };
}
