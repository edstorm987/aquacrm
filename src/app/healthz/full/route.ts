// `/healthz/full` — deep health probe (T1 R030 — chapter
// `04-observability.md`).
//
// Distinct from `/healthz` (lightweight liveness — never touches the
// DB; "the app is up" is a different signal from "Postgres is up").
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
// Lightweight: a single `SELECT 1` against Postgres. The check is
// gated on PORTAL_BACKEND === "postgres" || DATABASE_URL set —
// file-backend deploys report `db: "untested"` rather than fabricating
// a green light (chapter #68 honesty).

import { NextResponse } from "next/server";
import { ensureHydrated, getState } from "@/server/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOOT_AT = Date.now();

interface ProbeResult {
  ok: boolean;
  db: "connected" | "down" | "untested";
  error?: string;
}

async function probeDb(): Promise<ProbeResult> {
  const explicit = (process.env.PORTAL_BACKEND ?? "").toLowerCase();
  const wantsPostgres = explicit === "postgres" || (!explicit && !!process.env.DATABASE_URL);
  if (!wantsPostgres) {
    return { ok: true, db: "untested" };
  }
  try {
    const { getPool } = await import("@/server/storagePostgres");
    const pool = getPool();
    await pool.query("SELECT 1");
    return { ok: true, db: "connected" };
  } catch (e) {
    return {
      ok: false,
      db: "down",
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
  const uptimeSec = Math.floor((Date.now() - BOOT_AT) / 1000);
  const body = {
    ok: probe.ok,
    db: probe.db,
    error: probe.error,
    plugins: pluginCount,
    uptime: uptimeSec,
    service: "aqua-portal",
    env: env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown",
    sha: env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? null,
    ts: Date.now(),
  };
  return NextResponse.json(body, {
    status: probe.ok ? 200 : 503,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
