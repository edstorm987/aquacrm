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

import { NextResponse } from "next/server";
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

// Deep DB probe is the promoted, shared `databaseStorageHealth()` (radar upgrade
// Stage 4) — the same probe Radar's Infra sweep uses. `primaryDbProbeStatus`
// projects it back to this route's original `{ ok, db, error }` shape.
async function probeDb(): Promise<{ ok: boolean; db: "connected" | "down" | "untested"; error?: string }> {
  return primaryDbProbeStatus(await databaseStorageHealth());
}

export async function GET(): Promise<NextResponse> {
  const env = process.env;
  // Hydrate so plugin count is honest; cheap on warm path.
  let pluginCount: number | null = null;
  try {
    await ensureHydrated();
    pluginCount = Object.keys(getState().pluginInstalls ?? {}).length;
  } catch {
    pluginCount = null;
  }
  const probe = await probeDb();
  const readiness = inspectProductionReadiness(env);
  // Enforce readiness on the ACTUAL production substrate (Railway included), not
  // only Vercel (#187). Outside production the body still reports the truth, but
  // the status stays green so local/dev/preview lanes are not tripped by a
  // deliberately-unset provider.
  const { ok, enforcingReadiness } = resolveFullHealthOk({ env, probeOk: probe.ok, ready: readiness.ready });
  const uptimeSec = Math.floor((Date.now() - BOOT_AT) / 1000);
  const body = {
    ok,
    db: probe.db,
    error: probe.error,
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
  return NextResponse.json(body, {
    status: ok ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
