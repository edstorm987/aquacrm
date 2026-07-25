// `/healthz` — lightweight liveness probe.
//
// Used by:
//   1. The ops plugin's hourly cron (sample → UptimeStore).
//   2. External monitors (Vercel deploy checks, Pingdom, etc.).
//
// Returns the build SHA (when available) + the runtime env so a
// monitor can detect rollbacks. NEVER touches the database — a
// healthz that depends on Postgres is a false-positive when the
// app is up but Postgres is paged. A separate `/healthz/full`
// could probe storage in a later round if Ed needs it.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return NextResponse.json(
    {
      ok: true,
      service: "aqua-portal",
      env: env["VERCEL_ENV"] ?? env["NODE_ENV"] ?? "unknown",
      sha: env["VERCEL_GIT_COMMIT_SHA"] ?? env["GITHUB_SHA"] ?? null,
      ts: Date.now(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
