// Provider integrations — stubbed for v1, real REST calls land in R4
// when each provider's creds are wired (per-install config). Each
// stub returns null when creds aren't configured, so the page falls
// back to the fixture row. The shapes mirror the Monitoring* types
// in lib/monitoring.ts so a real impl can be slotted in without
// touching the page or service.
//
// Read-only env reads — operator-level creds (Vercel, Sentry org
// auth-token) live in env. Per-install creds (Stripe secret, Postmark
// server token) live in `install.config` per the per-deployment vs
// per-install split documented in chapter #44.

export interface ProviderEnv {
  vercelToken?: string;
  vercelTeamId?: string;
  sentryDsn?: string;
  sentryAuthToken?: string;
  sentryOrg?: string;
  sentryProject?: string;
  // Per-install creds are read off `install.config` by the caller and
  // passed in explicitly; not read off env here.
}

export function readProviderEnv(): ProviderEnv {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const out: ProviderEnv = {};
  if (env["VERCEL_TOKEN"]) out.vercelToken = env["VERCEL_TOKEN"];
  if (env["VERCEL_TEAM_ID"]) out.vercelTeamId = env["VERCEL_TEAM_ID"];
  if (env["SENTRY_DSN"]) out.sentryDsn = env["SENTRY_DSN"];
  if (env["SENTRY_AUTH_TOKEN"]) out.sentryAuthToken = env["SENTRY_AUTH_TOKEN"];
  if (env["SENTRY_ORG"]) out.sentryOrg = env["SENTRY_ORG"];
  if (env["SENTRY_PROJECT"]) out.sentryProject = env["SENTRY_PROJECT"];
  return out;
}

// Returns true when the provider has enough config to make a real
// call. Used by the service to decide fixture vs live.
export function isSentryQueryable(env: ProviderEnv): boolean {
  return Boolean(env.sentryAuthToken && env.sentryOrg && env.sentryProject);
}

export function isVercelAnalyticsQueryable(env: ProviderEnv): boolean {
  return Boolean(env.vercelToken);
}

// Live integration stubs. Each returns `null` until R4+ ships the
// real REST call. Importantly: NEVER throw — if a provider call
// fails, return null and let the dashboard fall back to fixture.

export async function fetchSentryErrorTotals(
  _env: ProviderEnv,
  _windowMs: number,
): Promise<{ perMinute: number; total: number } | null> {
  return null;
}

export async function fetchVercelSlowRoutes(
  _env: ProviderEnv,
): Promise<Array<{ path: string; p95Ms: number; samples: number }> | null> {
  return null;
}

export async function fetchStripeSpendCents(
  _secretKey: string | undefined,
  _windowMs: number,
): Promise<{ mtdCents: number; prevMonthCents: number } | null> {
  return null;
}

export async function fetchPostmarkSpendCents(
  _serverToken: string | undefined,
  _windowMs: number,
): Promise<{ mtdCents: number; prevMonthCents: number } | null> {
  return null;
}
