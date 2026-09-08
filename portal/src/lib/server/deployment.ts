// Deployment-substrate facts, resolved from the runtime environment.
//
// AquaCRM has moved Vercel → Railway (see CLAUDE.md). Several production
// contracts historically detected "this is a real production deployment" with
// `VERCEL_ENV === "production"` alone. On Railway `VERCEL_ENV` is undefined, so
// those contracts silently fell open: `/healthz/full` folded readiness into its
// HTTP status only on Vercel (#187), the deployed commit SHA read `null`, and the
// storage safety net that refuses file/memory backends in production did not fire.
//
// This module is the ONE place that answers three questions, so a new deploy
// target is added here and everywhere inherits it:
//   1. Are we running as a genuine production deployment?  (isProductionDeployment)
//   2. Which platform is this?                              (deploymentPlatform)
//   3. What source revision is deployed?                    (deployedCommitSha)
//
// It reads only non-secret platform markers, has no server-only imports, and is
// pure over its `env` argument, so it is trivially testable with a synthetic env.

export type DeploymentPlatform = "vercel" | "railway" | "render" | "fly" | "node";

type Env = NodeJS.ProcessEnv;

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function truthyFlag(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return null;
}

/**
 * Which hosting platform this process runs on, by presence of its marker
 * variables. `"node"` means a bare Node host with no recognised platform — which
 * is the correct answer for a local `next dev`/`next start` too.
 */
export function deploymentPlatform(env: Env = process.env): DeploymentPlatform {
  if (env.VERCEL === "1" || env.VERCEL_ENV) return "vercel";
  if (
    env.RAILWAY_ENVIRONMENT_NAME ||
    env.RAILWAY_ENVIRONMENT ||
    env.RAILWAY_PROJECT_ID ||
    env.RAILWAY_SERVICE_ID ||
    env.RAILWAY_DEPLOYMENT_ID
  ) return "railway";
  if (env.RENDER === "true" || env.RENDER_SERVICE_ID) return "render";
  if (env.FLY_APP_NAME || env.FLY_MACHINE_ID) return "fly";
  return "node";
}

/**
 * The deployed source revision, from whichever platform injects it. Order is by
 * specificity: an explicit `PORTAL_BUILD_SHA` (a build arg the operator can set
 * on any host) wins, then each platform's own git-commit variable. Returns the
 * full SHA string, or `null` when no source is identifiable (e.g. local dev) —
 * never a fabricated value.
 */
export function deployedCommitSha(env: Env = process.env): string | null {
  return firstNonEmpty(
    env.PORTAL_BUILD_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
    env.RAILWAY_GIT_COMMIT_SHA,
    env.RENDER_GIT_COMMIT,
    env.GITHUB_SHA,
    env.SOURCE_COMMIT, // Heroku / buildpack style
    env.GIT_COMMIT_SHA,
    env.COMMIT_SHA,
  );
}

/**
 * A short, human-facing label for which environment this deployment serves —
 * the platform's own environment name when it has one, else the generic app/env
 * marker, else `NODE_ENV`. Informational only; enforcement uses
 * `isProductionDeployment`.
 */
export function deploymentEnvironmentLabel(env: Env = process.env): string {
  return firstNonEmpty(
    env.VERCEL_ENV,
    env.RAILWAY_ENVIRONMENT_NAME,
    env.RAILWAY_ENVIRONMENT,
    env.PORTAL_ENV,
    env.APP_ENV,
    env.NODE_ENV,
  ) ?? "unknown";
}

/**
 * Is this a genuine production deployment?
 *
 * This is a PURE platform/environment classification. It consults **no**
 * health/readiness override — deliberately. The production storage safety net
 * (`shouldRefuseEphemeralProductionStorage`, used by `storage.ts`) is built on
 * this answer, and a health-endpoint flag must NEVER be able to declassify a
 * real deployment and thereby switch that guard off. So this function fails
 * CLOSED: a recognised Railway/Vercel/Render/Fly production is always `true`, and
 * nothing an operator can pass to `/healthz` reduces it.
 *
 * Resolution order (first decisive answer wins):
 *   1. Vercel: `VERCEL_ENV === "production"` (preview/development are not).
 *   2. Railway: its environment name is `production`.
 *   3. Generic marker: `PORTAL_ENV`/`APP_ENV === "production"` — the supported way
 *      for a bare-Node production host to opt into FULL production treatment
 *      (this guard included), distinct from the health-only enforcement flag.
 *   4. A recognised deploy platform (Railway/Render/Fly/Vercel markers present)
 *      running with `NODE_ENV === "production"`.
 *
 * A local `next dev` (NODE_ENV development, no platform markers) and an ordinary
 * local `next start` (NODE_ENV production but no platform/`PORTAL_ENV` markers)
 * both resolve to `false`, so local work is never forced into 503s or storage
 * refusals.
 */
export function isProductionDeployment(env: Env = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";

  const railwayEnv = firstNonEmpty(env.RAILWAY_ENVIRONMENT_NAME, env.RAILWAY_ENVIRONMENT);
  if (railwayEnv) return railwayEnv.toLowerCase() === "production";

  const appEnv = firstNonEmpty(env.PORTAL_ENV, env.APP_ENV);
  if (appEnv) return appEnv.toLowerCase() === "production";

  return env.NODE_ENV === "production" && deploymentPlatform(env) !== "node";
}

/**
 * Should `/healthz/full` fold readiness into its HTTP status (i.e. 503 when a
 * required item is unready)?
 *
 * Separated from `isProductionDeployment` on purpose (the two questions are
 * different): this one, and ONLY this one, honours the enforcement flag.
 *
 *   - A genuine production deployment ALWAYS enforces. A `false`/`off` override
 *     cannot disable it — `isProductionDeployment` already returned `true` and the
 *     `|| …` below never reduces that. (This is the fail-open the old code had.)
 *   - The explicit `true` flag (`PORTAL_HEALTHZ_ENFORCE_READINESS` /
 *     `PORTAL_ENFORCE_READINESS`) additionally opts a bare-Node production host
 *     (NODE_ENV=production, no recognised platform markers) into HEALTH
 *     enforcement. It does NOT touch `isProductionDeployment` or the storage
 *     guard; to get full production treatment on a bare host, set
 *     `PORTAL_ENV=production`.
 *   - Everything else (local dev, ordinary local `next start`) does not enforce.
 *
 * There is deliberately no path that turns enforcement OFF for a real production
 * deployment.
 */
export function shouldEnforceHealthReadiness(env: Env = process.env): boolean {
  if (isProductionDeployment(env)) return true;
  return truthyFlag(env.PORTAL_HEALTHZ_ENFORCE_READINESS ?? env.PORTAL_ENFORCE_READINESS) === true;
}

/**
 * Should the durable-storage safety net trip — refusing to serve customer data
 * from an ephemeral file/memory backend?
 *
 * True when a genuine production deployment (platform-detected; NO override) is
 * running on file/memory storage outside the build phase. Because it is built on
 * `isProductionDeployment`, a health/readiness override can NEVER switch it off:
 * it fails closed. The `phase-production-build` exemption is the one moment a
 * production build hydrates once with no durable backend configured and never
 * serves a request.
 */
export function shouldRefuseEphemeralProductionStorage(
  backendKind: string,
  env: Env = process.env,
): boolean {
  const ephemeral = backendKind === "file" || backendKind === "memory";
  const buildPhase = env.NEXT_PHASE === "phase-production-build";
  return ephemeral && !buildPhase && isProductionDeployment(env);
}

/**
 * Pure `/healthz/full` outcome. Kept out of the route module (which pulls in
 * server-only storage) so the #187 contract — production enforcement, correct
 * status code, honest SHA/env — is unit-testable with a synthetic env.
 *
 * `ok` is the liveness-and-readiness verdict:
 *   - a down primary database is never ok;
 *   - where readiness is enforced (`shouldEnforceHealthReadiness`), an unready
 *     required item is not ok;
 *   - where it is not enforced, readiness is reported but not folded into the
 *     status, so local/dev and preview lanes stay green while still telling the
 *     truth in the body.
 */
export function resolveFullHealthOk(input: {
  env?: Env;
  probeOk: boolean;
  ready: boolean;
}): { ok: boolean; enforcingReadiness: boolean } {
  const env = input.env ?? process.env;
  const enforcingReadiness = shouldEnforceHealthReadiness(env);
  const ok = input.probeOk && (!enforcingReadiness || input.ready);
  return { ok, enforcingReadiness };
}
