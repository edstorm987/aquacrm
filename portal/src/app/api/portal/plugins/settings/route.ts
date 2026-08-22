import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { logActivity } from "@/server/activity";
import {
  PluginSettingsError,
  describePluginSettings,
  writePluginSettings,
} from "@/lib/server/plugins/pluginSettingsSurface";

/**
 * The one endpoint behind the generic plugin settings surface.
 *
 * A plugin declares `settings.groups` in its manifest; this reads them back
 * with their current values and writes new ones. Nothing here is
 * plugin-specific — agency-finance's Stripe keys were the reason it exists,
 * but any manifest gets it for free.
 *
 * Secrets never travel in the GET response. A password field reports only
 * whether a value is stored and whether it came from this workspace's own
 * vault entry or from the deployment's environment.
 *
 * Admin-only in both directions. Reading which credentials exist is itself
 * sensitive, and every plugin's Settings tab is already an admin surface.
 */

const SETTINGS_ADMINS = ["agency-owner", "agency-manager"] as const;

function scopeFrom(url: URL | Record<string, unknown>, agencyId: string) {
  const clientId = url instanceof URL
    ? url.searchParams.get("clientId")?.trim()
    : typeof url.clientId === "string" ? url.clientId.trim() : "";
  return { agencyId, ...(clientId ? { clientId } : {}) };
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...SETTINGS_ADMINS]);
    const url = new URL(request.url);
    const pluginId = url.searchParams.get("pluginId")?.trim() ?? "";
    if (!pluginId) return NextResponse.json({ ok: false, error: "pluginId is required." }, { status: 400 });

    const settings = describePluginSettings(pluginId, scopeFrom(url, session.agencyId));
    if (!settings) return NextResponse.json({ ok: false, error: "unknown_plugin" }, { status: 404 });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole([...SETTINGS_ADMINS]);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const pluginId = typeof body?.pluginId === "string" ? body.pluginId.trim() : "";
    const values = body?.values;
    if (!pluginId) return NextResponse.json({ ok: false, error: "pluginId is required." }, { status: 400 });
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return NextResponse.json({ ok: false, error: "values is required." }, { status: 400 });
    }

    const scope = scopeFrom(body ?? {}, session.agencyId);
    const result = writePluginSettings({
      pluginId,
      scope,
      values: values as Record<string, unknown>,
      actorUserId: session.userId,
      actorEmail: session.email,
    });
    await flushPendingWrites();

    // Field IDS only. A secret's value never reaches the log, and neither does
    // a redacted stand-in that could be mistaken for one.
    logActivity({
      agencyId: session.agencyId,
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "plugin",
      action: "plugin.settings.updated",
      message: `${pluginId} settings updated`,
      metadata: {
        pluginId,
        configFields: result.configFields,
        secretFields: result.secretFields,
      },
    });

    const settings = describePluginSettings(pluginId, scope);
    return NextResponse.json({ ok: true, settings, saved: result });
  } catch (error) {
    if (error instanceof PluginSettingsError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
