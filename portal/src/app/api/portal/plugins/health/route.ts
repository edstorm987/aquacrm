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
// hooks that exist and return what they say. Where that gets DRAWN — Radar, the
// Dev Console, a per-client systems tab — is a product decision, and inventing
// a screen would have been the same mask in a new costume. The capability is no
// longer dead, and a screen can be hung on it whenever one is wanted.
//
// ── The rules a health surface has to follow ─────────────────────────────
//
// A healthcheck is third-party-ish code doing I/O on a request path, so:
//
//   • **It cannot hang the route.** Each hook races a timeout and a slow module
//     is reported as slow, not left to stall the page.
//   • **It cannot take the route down.** A throwing hook becomes an unhealthy
//     row naming the module, because "the health page is broken" is the least
//     useful possible answer to "is anything broken".
//   • **A module with no hook is not unhealthy.** It is `supported: false` —
//     absence of evidence, said out loud, which is the rule Radar already
//     follows for missing evidence.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { listInstalledFor } from "@/server/pluginInstalls";
import { getPlugin } from "@/built-ins/runtime/_registry";
import { makeCtx } from "@/built-ins/runtime/_runtime";
import type { HealthStatus } from "@/built-ins/runtime/_types";
import { readOnlyPluginStorage } from "@/lib/server/plugins/readOnlyPluginStorage";
import type { Role } from "@/server/types";

/** Long enough for a real check, short enough that a page can wait for it. */
const HEALTHCHECK_TIMEOUT_MS = 5_000;

const VIEWERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];

interface PluginHealthRow {
  pluginId: string;
  installId: string;
  /** False when the module ships no healthcheck at all. Not a failure. */
  supported: boolean;
  /** Absent when unsupported. */
  status?: HealthStatus;
  /** Set when the hook threw or timed out — never silently folded into `ok`. */
  error?: string;
  durationMs: number;
}

async function runOne(install: Parameters<typeof makeCtx>[0], actor: string): Promise<PluginHealthRow> {
  const started = Date.now();
  const base = { pluginId: install.pluginId, installId: install.id };
  const plugin = getPlugin(install.pluginId);

  if (!plugin?.healthcheck) {
    return { ...base, supported: false, durationMs: 0 };
  }

  const ctx = makeCtx(install, actor);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      plugin.healthcheck({ ...ctx, storage: readOnlyPluginStorage(ctx.storage, `${install.pluginId} healthcheck`) }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${HEALTHCHECK_TIMEOUT_MS}ms`)), HEALTHCHECK_TIMEOUT_MS);
      }),
    ]);
    return { ...base, supported: true, status, durationMs: Date.now() - started };
  } catch (error) {
    // A module that cannot answer is unhealthy, and says why. It does not take
    // the other nine down with it.
    return {
      ...base,
      supported: true,
      status: { ok: false, message: "This module could not report its health." },
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
    const health = await Promise.all(installs.map(install => runOne(install, session.userId)));

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
