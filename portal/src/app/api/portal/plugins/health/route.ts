import "server-only";
// Plugin health — the surface that asks the modules how they are.
//
// ── Why this route exists ────────────────────────────────────────────────
//
// A sweep on 2026-08-28 asked which `AquaPlugin` manifest fields the host
// actually reads. `healthcheck` came back with **ten of the thirteen modules
// implementing one and nothing anywhere calling any of them**.
//
// They are not stubs. `client-crm` counts active contacts and seeded segments
// and reports per-component status; `email-sender` runs an entire
// `buildEmailSenderHealth`. Ten working health reports existed and there was no
// surface that asked for them — the same "declared, never consumed" defect that
// this day already turned up in email-sender's event subscribers and in every
// client-scoped module's `navItems`.
//
// This is the consumer. It deliberately does the smallest honest thing: run the
// hooks that exist and return what they say.
//
// ── Where the asking actually lives ──────────────────────────────────────
//
// In `lib/server/plugins/pluginHealthRunner.ts`, not here. This route is the
// LIVE read — "ask now, show me" — and it writes nothing, because it is a GET
// and `smoke-read-path-mutations.test.ts` is the guard that keeps read paths
// read-only. The same runner is driven on the radar cadence by
// `runPluginHealthSweep`, which persists each answer onto the install record so
// that Radar's `systems:module-health` has evidence whether or not anybody has
// this panel open. One runner, so the answer a person sees and the answer Radar
// counts cannot be produced by two different pieces of code.
//
// The rules that make a health surface honest — a bounded hook, a throwing hook
// contained rather than fatal, no-hook reported as unsupported rather than
// unhealthy, and a read-only storage handle — all live with the runner.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { listInstalledFor } from "@/server/pluginInstalls";
import { runInstallHealthcheck } from "@/lib/server/plugins/pluginHealthRunner";
import type { Role } from "@/server/types";

const VIEWERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];

/**
 * Health for every module installed in the caller's scope.
 *
 * `?clientId=` asks a client's installs; without it, the agency's own. A
 * `?pluginId=` narrows to one module.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(VIEWERS);
    const url = new URL(request.url);
    const requestedClientId = url.searchParams.get("clientId") ?? undefined;
    const pluginId = url.searchParams.get("pluginId") ?? undefined;

    // The same tenant resolution every other plugin-scoped route uses, so a
    // clientId in the query cannot reach another agency's client.
    const tenant = routeTenantScope(session, { clientId: requestedClientId });
    if (requestedClientId && !tenant.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }

    const installs = listInstalledFor(
      tenant.clientId ? { agencyId: tenant.agencyId, clientId: tenant.clientId } : { agencyId: tenant.agencyId },
    ).filter(install => install.enabled && (!pluginId || install.pluginId === pluginId));

    // Concurrent: ten sequential checks with I/O in them is a slow page for no
    // reason, and each one is already individually bounded.
    const health = await Promise.all(installs.map(install => runInstallHealthcheck(install, session.userId)));

    return NextResponse.json({
      ok: true,
      scope: { agencyId: tenant.agencyId, clientId: tenant.clientId },
      health: health.sort((left, right) => left.pluginId.localeCompare(right.pluginId)),
      // Counted here so a caller does not have to re-derive the summary and
      // risk deciding "unhealthy" differently from this route.
      summary: {
        checked: health.filter(row => row.supported).length,
        unsupported: health.filter(row => !row.supported).length,
        unhealthy: health.filter(row => row.supported && row.status?.ok === false).length,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
