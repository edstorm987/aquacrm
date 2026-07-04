// Typed env reader (T1 R029 — chapter `04-env-secrets-policy.md`).
//
// Two helpers + an allowlist + a startup self-check:
//
//   - `requireEnv(name, opts?)` — throws in production when missing.
//     In dev/test, returns `undefined`. Use for hard requirements.
//   - `optionalEnv(name, fallback)` — always returns a string. Falls
//     back to `fallback` when unset. Use for tunables.
//   - `ENV_ALLOWLIST` — typo guard. The startup self-check warns when
//     `process.env` carries a `*PORTAL_*`/`*FOUNDER_*` key not on
//     the list (likely typo).
//   - `runStartupEnvCheck()` — fail-closed boot: validates required
//     vars are set + meet minimum lengths + don't match dev sentinels.
//     Throws in production; warns + returns issues in dev.
//
// No `server-only` shim so the smoke can drive every branch under
// tsx --test.

export interface EnvIssue {
  name: string;
  severity: "error" | "warn";
  reason: string;
}

const PRODUCTION_REQUIRED = [
  "PORTAL_SESSION_SECRET",
  "DATABASE_URL",
  "NEXT_PUBLIC_PORTAL_BASE_URL",
  "NEXT_PUBLIC_PORTAL_SECURITY",
  "FOUNDER_EMAIL",
  "FOUNDER_PASSWORD",
] as const;

const MIN_LENGTHS: Record<string, number> = {
  PORTAL_SESSION_SECRET: 32,
  FOUNDER_PASSWORD: 12,
};

// Sentinel values we ship in `.env.example`. If any of these survive
// into production, the operator forgot to rotate.
const EXAMPLE_SENTINELS: Record<string, string[]> = {
  FOUNDER_EMAIL: ["edwardhallam07@gmail.com"],
  PORTAL_SESSION_SECRET: ["", "dev-secret", "change-me", "your-secret-here"],
  NEXT_PUBLIC_PORTAL_BASE_URL: ["http://localhost:3030", ""],
};

// Allowlist of recognised env keys. The startup self-check warns when
// `process.env` carries a portal-prefixed key not on this list — typo
// guard for `FOUNDER_PASWORD` etc. Non-portal keys (PATH, NODE_ENV,
// every framework's own surface) are ignored.
export const ENV_ALLOWLIST: readonly string[] = [
  "PORTAL_SESSION_SECRET",
  "PORTAL_BACKEND",
  "PORTAL_PG_POOL_MAX",
  "PORTAL_PG_IDLE_MS",
  "PORTAL_PG_CONNECT_MS",
  "DATABASE_URL",
  "NEXT_PUBLIC_PORTAL_BASE_URL",
  "NEXT_PUBLIC_PORTAL_SECURITY",
  "NEXT_PUBLIC_DEV_BYPASS",
  "FOUNDER_EMAIL",
  "FOUNDER_PASSWORD",
  "FOUNDER_AGENCY_NAME",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "SENTRY_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_DSN",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
] as const;

const PORTAL_KEY_PATTERN = /^(PORTAL_|FOUNDER_|NEXT_PUBLIC_PORTAL_|NEXT_PUBLIC_SENTRY|SENTRY_|VERCEL_|GOOGLE_OAUTH_)/;

interface RequireOpts {
  // When true, also throws in dev (caller treats this var as
  // unconditionally required regardless of NODE_ENV). Useful for
  // module-level reads that should never silently use a default.
  alwaysRequired?: boolean;
}

export function requireEnv(name: string, opts: RequireOpts = {}): string | undefined {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (opts.alwaysRequired || process.env.NODE_ENV === "production") {
    throw new Error(`[env] ${name} is required but not set`);
  }
  return undefined;
}

export function optionalEnv<T extends string>(name: string, fallback: T): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  return fallback;
}

// Pure validation helper. Splits the side-effect (throw / warn) from
// the analysis so the smoke can drive every branch.
export function inspectEnv(env: NodeJS.ProcessEnv = process.env): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const isProd = env.NODE_ENV === "production";

  // Required-in-prod missing → error in prod, warn in dev.
  for (const name of PRODUCTION_REQUIRED) {
    const v = env[name];
    if (!v || v.length === 0) {
      issues.push({
        name,
        severity: isProd ? "error" : "warn",
        reason: "required in production but not set",
      });
      continue;
    }
    const min = MIN_LENGTHS[name];
    if (min && v.length < min) {
      issues.push({
        name,
        severity: isProd ? "error" : "warn",
        reason: `must be ≥${min} chars (got ${v.length})`,
      });
    }
    const sentinels = EXAMPLE_SENTINELS[name];
    if (sentinels && sentinels.includes(v)) {
      issues.push({
        name,
        severity: isProd ? "error" : "warn",
        reason: "matches a known dev / example sentinel — rotate before deploying",
      });
    }
  }

  // NEXT_PUBLIC_PORTAL_SECURITY in prod must be exactly "strict".
  if (isProd) {
    const sec = env.NEXT_PUBLIC_PORTAL_SECURITY;
    if (sec && sec !== "strict") {
      issues.push({
        name: "NEXT_PUBLIC_PORTAL_SECURITY",
        severity: "error",
        reason: `must equal "strict" in production (got "${sec}")`,
      });
    }
  }

  // Typo-guard: any portal-namespaced key not on the allowlist warns.
  for (const k of Object.keys(env)) {
    if (!PORTAL_KEY_PATTERN.test(k)) continue;
    if (ENV_ALLOWLIST.includes(k)) continue;
    issues.push({
      name: k,
      severity: "warn",
      reason: `not on the env allowlist — suspected typo (closest: ${suggestClosest(k)})`,
    });
  }

  return issues;
}

function suggestClosest(name: string): string {
  let best = ENV_ALLOWLIST[0];
  let bestD = Infinity;
  for (const candidate of ENV_ALLOWLIST) {
    const d = levenshtein(name, candidate);
    if (d < bestD) {
      bestD = d;
      best = candidate;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let curr = i;
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
      prev[j] = curr;
    }
  }
  return prev[n];
}

// Startup self-check. Throws in production if any error-severity
// issue exists; warns in dev. Returns issues for callers that want
// to surface them (e.g. /api/internal/sweep diagnostic).
export function runStartupEnvCheck(env: NodeJS.ProcessEnv = process.env): EnvIssue[] {
  const issues = inspectEnv(env);
  const errors = issues.filter(i => i.severity === "error");
  if (errors.length > 0 && env.NODE_ENV === "production") {
    const summary = errors.map(e => `${e.name}: ${e.reason}`).join("; ");
    throw new Error(`[env] startup self-check failed in production: ${summary}`);
  }
  if (issues.length > 0 && env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    for (const issue of issues) {
      console.warn(`[env] ${issue.severity.toUpperCase()} ${issue.name}: ${issue.reason}`);
    }
  }
  return issues;
}
