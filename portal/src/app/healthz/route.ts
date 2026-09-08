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
import {
  deployedCommitSha,
  deploymentEnvironmentLabel,
  deploymentPlatform,
} from "@/lib/server/deployment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  const env = (typeof process !== "undefined" ? process.env : {}) as NodeJS.ProcessEnv;
  return NextResponse.json(
    {
      ok: true,
      service: "aqua-portal",
      // Resolved across Vercel/Railway/generic markers so a monitor can detect a
      // rollback on any substrate — no longer `null` on Railway (#187).
      env: deploymentEnvironmentLabel(env),
      platform: deploymentPlatform(env),
      sha: deployedCommitSha(env),
      ts: Date.now(),
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
