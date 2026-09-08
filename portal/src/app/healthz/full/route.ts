// `/healthz/full` — deep health probe (T1 R030 — chapter
// `04-observability.md`).
//
// Distinct from `/healthz` (lightweight liveness — never touches the
// DB; "the app is up" is a different signal from "durable storage is up").
// The full probe touches storage + plugin registry + reports uptime.
//
// Returns:
//   200 { ok: true, db: "connected"|"untested", plugins, uptime, sha, env, ts }
//   503 { ok: false, db: "down", error, plugins?, uptime, sha, env, ts }
//
// Used by:
//   - Production deploy gate ("smoke 200 across all surfaces" per
//     chapter #124 ship gate).
//   - Operator dashboard / Sentry health monitor.
//
// Lightweight: either a single `SELECT 1` against Postgres or a one-row
// Supabase datastore read. Local file-backed runs report `db: "untested"`
// rather than fabricating a green light (chapter #68 honesty).

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated, getState } from "@/server/storage";
import { inspectProductionReadiness } from "@/lib/server/productionReadiness";
import { databaseStorageHealth, primaryDbProbeStatus } from "@/lib/server/databaseStorageHealth";
import {
  deployedCommitSha,
  deploymentEnvironmentLabel,
  deploymentPlatform,
  resolveFullHealthOk,
} from "@/lib/server/deployment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOOT_AT = Date.now();

/**
 * Phase 4 (assume-breach containment): in production the DETAILED body —
 * commit sha, platform, plugin count, and above all the readiness item list
 * (which controls are unconfigured) — is reconnaissance, and this route is
 * unauthenticated. Unauthenticated production callers now get `{ ok, ts }`
 * with the same status code, which is all a deploy gate or uptime monitor
 * consumes. Details require either an internal agency session or the
 * `PORTAL_HEALTH_TOKEN` bearer (for the operator's monitor).
 */
async function mayViewDetails(request: NextRequest, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (env.NODE_ENV !== "production") return true;
  const token = env.PORTAL_HEALTH_TOKEN?.trim();
  if (token) {
    const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const presentedBuffer = Buffer.from(presented);
    const tokenBuffer = Buffer.from(token);
    if (presentedBuffer.length === tokenBuffer.length && crypto.timingSafeEqual(presentedBuffer, tokenBuffer)) {
      return true;
    }
  }
  try {
    const session = await getSessionFromRequest(request);
    return Boolean(session && (AGENCY_ROLES as readonly string[]).includes(session.role));
  } catch {
    return false;
  }
}

// Deep DB probe is the promoted, shared `databaseStorageHealth()` (radar upgrade
// Stage 4) — the same probe Radar's Infra sweep uses. `primaryDbProbeStatus`
// projects it back to this route's original `{ ok, db, error }` shape.
async function probeDb(): Promise<{ ok: boolean; db: "connected" | "down" | "untested"; error?: string }> {
  return primaryDbProbeStatus(await databaseStorageHealth());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = process.env;
  // APPLICATION-STATE health, not just connectivity (Phase 8). A connectivity
  // SELECT 1 can succeed while PortalState fails to hydrate/parse — a portal
  // that cannot read its own state is DOWN, and swallowing the hydration error
  // (reporting only a null plugin count) let it read as healthy. A hydration/
  // parse failure now forces `hydrationOk=false`, which forces the whole probe
  // to 503.
  let pluginCount: number | null = null;
  let hydrationOk = true;
  let hydrationError: string | undefined;
  try {
    await ensureHydrated();
    pluginCount = Object.keys(getState().pluginInstalls ?? {}).length;
  } catch (error) {
    hydrationOk = false;
    hydrationError = error instanceof Error ? error.message : "portal state failed to hydrate";
    pluginCount = null;
  }
  const probe = await probeDb();
  const readiness = inspectProductionReadiness(env);
  // Enforce readiness on the ACTUAL production substrate (Railway included), not
  // only Vercel (#187). Outside production the body still reports the truth, but
  // the status stays green so local/dev/preview lanes are not tripped by a
  // deliberately-unset provider. A hydration failure is fatal in EVERY
  // environment: a `probeOk` that ignores it would be a connectivity-only lie.
  const decision = resolveFullHealthOk({ env, probeOk: probe.ok && hydrationOk, ready: readiness.ready });
  const ok = decision.ok && hydrationOk;
  const { enforcingReadiness } = decision;
  const uptimeSec = Math.floor((Date.now() - BOOT_AT) / 1000);
  const body = {
    ok,
    db: probe.db,
    error: probe.error ?? hydrationError,
    state: hydrationOk ? "hydrated" : "hydration-failed",
    plugins: pluginCount,
    uptime: uptimeSec,
    service: "aqua-portal",
    env: deploymentEnvironmentLabel(env),
    platform: deploymentPlatform(env),
    sha: deployedCommitSha(env),
    enforcingReadiness,
    readyForProduction: readiness.ready,
    readiness: readiness.items.map(item => ({
      id: item.id,
      status: item.status,
      required: item.required,
    })),
    ts: Date.now(),
  };
  // The status code (the deploy-gate/monitor signal) is identical either way;
  // only the recon-grade detail is withheld from anonymous production callers.
  const detailed = await mayViewDetails(request, env);
  return NextResponse.json(detailed ? body : { ok, ts: body.ts }, {
    status: ok ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
