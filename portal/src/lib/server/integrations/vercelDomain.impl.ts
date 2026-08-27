// Foundation-level Vercel domain-attach API client (impl).
// Test-friendly: NO `import "server-only"` so the smoke at
// `scripts/smoke-vercel-domain.test.ts` can import it via tsx.
// The server-only guard lives in `vercelDomain.ts`, the public
// re-export. Application code SHOULD import from `vercelDomain.ts`;
// only the smoke imports this impl file directly.
//
// Same surface as `02 felicias aqua portal work/src/lib/vercel/server.ts`
// (lifted per architecture §13 parked-item directive) but adapted for
// the multi-tenant pool model:
//
//   - Token + project-id + team-id are arguments, not env-only — the
//     foundation reads `VERCEL_TOKEN` from env (operator-level secret),
//     but the project id varies per per-Live-client deployment, so the
//     caller passes it in.
//   - Errors return typed results instead of throwing — handlers care
//     about happy / sad path, not stack traces.
//
// Existing parallel copy at `04-the-final-portal/plugins/domains/src/server/vercelClient.ts`
// (T6 R1 Phase C). The plugin keeps its standalone copy so it tsc-cleans
// without depending on the portal; once the foundation wires the plugin
// as a workspace dep (foundation-pending per
// `04-deployment-domains-observability.md` §4), this module becomes the
// single source and the plugin re-exports.
//
// Reference: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain

import {
  isRemoteOperationError,
  withRemoteOperationDeadline,
  type RemoteOperationRetry,
} from "@/lib/server/remoteOperation";

const VERCEL_API_BASE = "https://api.vercel.com";

export interface VercelDomainConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

export interface VercelDomainCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DnsRequirement {
  type: string;             // "TXT" / "CNAME" / "A" / ...
  name: string;             // hostname the record applies to
  value: string;            // value the operator must paste at the registrar
  reason?: string;          // Vercel-supplied human-readable reason
}

export interface VercelDomainResult {
  ok: boolean;
  verified: boolean;
  hostname: string;
  pending: DnsRequirement[];
  error?: string;
  outcomeUnknown?: boolean;
  retry?: RemoteOperationRetry;
  vercelProjectId: string;
  vercelTeamId?: string;
}

interface VercelResponseBody {
  name?: string;
  verified?: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
  error?: { code: string; message: string };
}

// ─── Env helpers ─────────────────────────────────────────────────────────

export function readEnvToken(): string | null {
  const t = process.env.VERCEL_TOKEN;
  return t && t.length > 0 ? t : null;
}

export function readEnvTeamId(): string | undefined {
  const t = process.env.VERCEL_TEAM_ID;
  return t && t.length > 0 ? t : undefined;
}

export function isVercelDomainConfigured(): boolean {
  return readEnvToken() !== null;
}

/**
 * Build a config from env + per-call project/team args. Throws if
 * `VERCEL_TOKEN` is missing — callers should check `isVercelDomainConfigured()`
 * first when the not-configured path matters (the manual-DNS runbook
 * works without a token).
 */
export function configFromEnv(args: {
  projectId: string;
  teamId?: string;
}): VercelDomainConfig {
  const token = readEnvToken();
  if (!token) {
    throw new Error(
      "VERCEL_TOKEN is not set. Add it to the deploy env (see " +
      "01 development/runbooks/deploy.md §6a) to enable auto-attach. " +
      "Without it the manual-DNS path still applies.",
    );
  }
  return {
    token,
    projectId: args.projectId,
    ...(args.teamId !== undefined ? { teamId: args.teamId } : { ...(readEnvTeamId() !== undefined ? { teamId: readEnvTeamId() as string } : {}) }),
  };
}

// ─── Hostname normalisation (mirror of plugins/domains/src/lib/domain.ts) ─

export function normaliseHostname(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

// ─── Internal HTTP ───────────────────────────────────────────────────────

function teamScope(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function call(
  cfg: VercelDomainConfig,
  path: string,
  init: RequestInit,
  options: VercelDomainCallOptions,
): Promise<{ ok: boolean; status: number; body: string }> {
  return withRemoteOperationDeadline({
    operation: `Vercel domain ${init.method?.toUpperCase() ?? "request"}`,
    budget: "providerWrite",
    outcome: "idempotent-write",
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  }, async signal => {
    const response = await fetch(`${VERCEL_API_BASE}${path}${teamScope(cfg.teamId)}`, {
      ...init,
      headers: {
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal,
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  });
}

function failureFor(error: unknown): { error: string; outcomeUnknown?: boolean; retry?: RemoteOperationRetry } {
  if (!isRemoteOperationError(error)) {
    return { error: error instanceof Error ? error.message : "vercel-network-error" };
  }
  return {
    error: error.message,
    outcomeUnknown: error.outcomeUnknown,
    retry: error.retry,
  };
}

function projectionFor(
  hostname: string,
  cfg: VercelDomainConfig,
): Pick<VercelDomainResult, "vercelProjectId" | "vercelTeamId" | "hostname"> {
  return {
    hostname,
    vercelProjectId: cfg.projectId,
    ...(cfg.teamId ? { vercelTeamId: cfg.teamId } : {}),
  };
}

function projectVerification(
  v: Array<{ type: string; domain: string; value: string; reason?: string }> | undefined,
): DnsRequirement[] {
  return (v ?? []).map((r) => ({
    type: r.type,
    name: r.domain,
    value: r.value,
    ...(r.reason ? { reason: r.reason } : {}),
  }));
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Attach a domain to a Vercel project. Returns ok+verified+pending
 * DNS requirements on success; ok:false + error on failure.
 *
 * Idempotent: 409 `domain_already_in_use` is treated as success
 * (operator's intent satisfied).
 */
export async function attachDomain(
  cfg: VercelDomainConfig,
  rawHostname: string,
  options: VercelDomainCallOptions = {},
): Promise<VercelDomainResult> {
  const hostname = normaliseHostname(rawHostname);
  if (!hostname) {
    return {
      ok: false,
      verified: false,
      hostname: "",
      pending: [],
      error: "missing-hostname",
      vercelProjectId: cfg.projectId,
      ...(cfg.teamId ? { vercelTeamId: cfg.teamId } : {}),
    };
  }
  let res: { ok: boolean; status: number; body: string };
  try {
    res = await call(
      cfg,
      `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`,
      { method: "POST", body: JSON.stringify({ name: hostname }) },
      options,
    );
  } catch (e) {
    return {
      ok: false,
      verified: false,
      pending: [],
      ...failureFor(e),
      ...projectionFor(hostname, cfg),
    };
  }
  let data: VercelResponseBody;
  try {
    data = JSON.parse(res.body) as VercelResponseBody;
  } catch {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: `Vercel ${res.status} (non-json body)`,
      ...projectionFor(hostname, cfg),
    };
  }

  const alreadyAttached =
    res.status === 409 || data.error?.code === "domain_already_in_use";
  if (!res.ok && !alreadyAttached) {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: data.error?.message ?? `Vercel ${res.status}`,
      ...projectionFor(hostname, cfg),
    };
  }

  return {
    ok: true,
    verified: !!data.verified,
    pending: projectVerification(data.verification),
    ...projectionFor(data.name ?? hostname, cfg),
  };
}

/**
 * Re-verify a previously attached domain. Returns the same shape as
 * attachDomain — `verified` flips true once Vercel sees the DNS
 * records propagate.
 */
export async function verifyDomain(
  cfg: VercelDomainConfig,
  rawHostname: string,
  options: VercelDomainCallOptions = {},
): Promise<VercelDomainResult> {
  const hostname = normaliseHostname(rawHostname);
  if (!hostname) {
    return {
      ok: false,
      verified: false,
      hostname: "",
      pending: [],
      error: "missing-hostname",
      vercelProjectId: cfg.projectId,
      ...(cfg.teamId ? { vercelTeamId: cfg.teamId } : {}),
    };
  }
  let res: { ok: boolean; status: number; body: string };
  try {
    res = await call(
      cfg,
      `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
      { method: "POST" },
      options,
    );
  } catch (e) {
    return {
      ok: false,
      verified: false,
      pending: [],
      ...failureFor(e),
      ...projectionFor(hostname, cfg),
    };
  }
  let data: VercelResponseBody;
  try {
    data = JSON.parse(res.body) as VercelResponseBody;
  } catch {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: `Vercel ${res.status} (non-json body)`,
      ...projectionFor(hostname, cfg),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      verified: false,
      pending: [],
      error: data.error?.message ?? `Vercel ${res.status}`,
      ...projectionFor(hostname, cfg),
    };
  }
  return {
    ok: true,
    verified: !!data.verified,
    pending: projectVerification(data.verification),
    ...projectionFor(data.name ?? hostname, cfg),
  };
}

/**
 * Remove a domain from a Vercel project. 200 on success; ok:false +
 * error otherwise.
 */
export async function removeDomain(
  cfg: VercelDomainConfig,
  rawHostname: string,
  options: VercelDomainCallOptions = {},
): Promise<{ ok: boolean; hostname: string; error?: string; outcomeUnknown?: boolean; retry?: RemoteOperationRetry }> {
  const hostname = normaliseHostname(rawHostname);
  if (!hostname) return { ok: false, hostname: "", error: "missing-hostname" };
  let res: { ok: boolean; status: number; body: string };
  try {
    res = await call(
      cfg,
      `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(hostname)}`,
      { method: "DELETE" },
      options,
    );
  } catch (e) {
    return {
      ok: false,
      hostname,
      ...failureFor(e),
    };
  }
  if (res.status === 404) return { ok: true, hostname };
  if (!res.ok) {
    let message = `Vercel ${res.status}`;
    try {
      const data = JSON.parse(res.body) as VercelResponseBody;
      if (data.error?.message) message = data.error.message;
    } catch {
      /* keep status fallback */
    }
    return { ok: false, hostname, error: message };
  }
  return { ok: true, hostname };
}
