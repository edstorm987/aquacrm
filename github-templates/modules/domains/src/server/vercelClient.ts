// Server-only Vercel REST API client for domain attach + verify +
// remove. Lifted from `02 felicias aqua portal work/src/lib/vercel/server.ts`
// and adapted:
//
//   - Token + project + team are arguments, not env-only — the plugin
//     reads `VERCEL_TOKEN` from env (operator-level secret) but the
//     `vercelProjectId` + `vercelTeamId` are per-domain (each Live
//     client's portal is its own Vercel project, so one install can
//     manage multiple project ids).
//   - All errors return a typed result instead of throwing — plugin
//     handlers care about happy/sad path, not stack traces.
//
// Reference: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain

const API_BASE = "https://api.vercel.com";

export interface VercelClientConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

export interface AttachDomainResult {
  ok: boolean;
  verified: boolean;
  hostname: string;
  pending: Array<{ type: string; name: string; value: string; reason?: string }>;
  error?: string;
  // Echoed back for the caller's convenience.
  vercelProjectId: string;
  vercelTeamId?: string;
}

interface VercelDomainResponse {
  name: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
  error?: { code: string; message: string };
}

export function readEnvToken(): string | null {
  const t = process.env.VERCEL_TOKEN;
  return t && t.length > 0 ? t : null;
}

export function readEnvTeamId(): string | undefined {
  const t = process.env.VERCEL_TEAM_ID;
  return t && t.length > 0 ? t : undefined;
}

export function isConfigured(): boolean {
  return !!readEnvToken();
}

function teamScope(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function call(
  cfg: VercelClientConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE}${path}${teamScope(cfg.teamId)}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

function projectionFromResponse(
  hostname: string,
  cfg: VercelClientConfig,
): Pick<AttachDomainResult, "vercelProjectId" | "vercelTeamId" | "hostname"> {
  return {
    hostname,
    vercelProjectId: cfg.projectId,
    vercelTeamId: cfg.teamId,
  };
}

export async function attachDomain(
  cfg: VercelClientConfig,
  hostname: string,
): Promise<AttachDomainResult> {
  if (!hostname) {
    return {
      ok: false,
      verified: false,
      hostname: "",
      pending: [],
      error: "missing-hostname",
      vercelProjectId: cfg.projectId,
      vercelTeamId: cfg.teamId,
    };
  }
  let res: Response;
  try {
    res = await call(cfg, `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: hostname }),
    });
  } catch (e) {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: e instanceof Error ? e.message : "vercel-network-error",
      ...projectionFromResponse(hostname, cfg),
    };
  }
  let data: VercelDomainResponse;
  try {
    data = (await res.json()) as VercelDomainResponse;
  } catch {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: `Vercel ${res.status} (non-json body)`,
      ...projectionFromResponse(hostname, cfg),
    };
  }

  // 409 = already attached to this project — operator's intent satisfied.
  const alreadyAttached =
    res.status === 409 || data.error?.code === "domain_already_in_use";
  if (!res.ok && !alreadyAttached) {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: data.error?.message ?? `Vercel ${res.status}`,
      ...projectionFromResponse(hostname, cfg),
    };
  }

  return {
    ok: true,
    verified: !!data.verified,
    pending: (data.verification ?? []).map((v) => ({
      type: v.type,
      name: v.domain,
      value: v.value,
      reason: v.reason,
    })),
    ...projectionFromResponse(data.name ?? hostname, cfg),
  };
}

export async function verifyDomain(
  cfg: VercelClientConfig,
  hostname: string,
): Promise<AttachDomainResult> {
  if (!hostname) {
    return {
      ok: false,
      verified: false,
      hostname: "",
      pending: [],
      error: "missing-hostname",
      vercelProjectId: cfg.projectId,
      vercelTeamId: cfg.teamId,
    };
  }
  let res: Response;
  try {
    res = await call(
      cfg,
      `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
      { method: "POST" },
    );
  } catch (e) {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: e instanceof Error ? e.message : "vercel-network-error",
      ...projectionFromResponse(hostname, cfg),
    };
  }
  let data: VercelDomainResponse;
  try {
    data = (await res.json()) as VercelDomainResponse;
  } catch {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: `Vercel ${res.status} (non-json body)`,
      ...projectionFromResponse(hostname, cfg),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: data.error?.message ?? `Vercel ${res.status}`,
      ...projectionFromResponse(hostname, cfg),
    };
  }
  return {
    ok: true,
    verified: !!data.verified,
    pending: (data.verification ?? []).map((v) => ({
      type: v.type,
      name: v.domain,
      value: v.value,
      reason: v.reason,
    })),
    ...projectionFromResponse(data.name ?? hostname, cfg),
  };
}

export async function removeDomain(
  cfg: VercelClientConfig,
  hostname: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!hostname) return { ok: false, error: "missing-hostname" };
  let res: Response;
  try {
    res = await call(
      cfg,
      `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(hostname)}`,
      { method: "DELETE" },
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "vercel-network-error" };
  }
  if (!res.ok) {
    let message = `Vercel ${res.status}`;
    try {
      const data = (await res.json()) as VercelDomainResponse;
      if (data.error?.message) message = data.error.message;
    } catch {
      /* keep status fallback */
    }
    return { ok: false, error: message };
  }
  return { ok: true };
}
