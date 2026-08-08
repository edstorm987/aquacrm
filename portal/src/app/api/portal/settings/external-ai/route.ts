import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionFromRequest } from "@/lib/server/auth";
import {
  createExternalAssistantApiKey,
  EXTERNAL_ASSISTANT_PERMISSIONS,
  listExternalAssistantApiKeys,
  revokeExternalAssistantApiKey,
  rotateExternalAssistantApiKey,
} from "@/lib/server/externalAssistantKeys";
import {
  buildExternalAssistantContext,
  EXTERNAL_ASSISTANT_MODULES,
  isExternalAssistantModule,
} from "@/lib/server/externalAssistantApi";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites, getState } from "@/server/storage";
import type { ExternalAssistantApiPermission } from "@/server/types";

const ALLOWED_ROLES = new Set(["agency-owner", "agency-manager"]);
const EXPIRY_OPTIONS = new Set([30, 90, 180, 365]);

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, connection: connectionStatus(session.agencyId) }, {
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!validOrigin(req)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    action?: "create" | "rotate" | "test";
    keyId?: string;
    name?: string;
    modules?: string[];
    permissions?: string[];
    expiresInDays?: number | null;
  };
  const action = body.action ?? "test";

  try {
    if (action === "create") {
      const modules = validModules(body.modules);
      const permissions = validPermissions(body.permissions);
      const expiresInDays = body.expiresInDays ?? null;
      if (expiresInDays !== null && !EXPIRY_OPTIONS.has(expiresInDays)) {
        return NextResponse.json({ ok: false, error: "Choose a supported expiry period." }, { status: 400 });
      }
      const created = createExternalAssistantApiKey({
        agencyId: session.agencyId,
        name: body.name ?? "",
        modules,
        permissions,
        createdBy: session.email,
        expiresAt: expiresInDays ? Date.now() + expiresInDays * 86_400_000 : undefined,
      });
      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        token: created.token,
        key: created.key,
        connection: connectionStatus(session.agencyId),
      }, { status: 201, headers: { "cache-control": "private, no-store" } });
    }

    if (action === "rotate") {
      if (!body.keyId) return NextResponse.json({ ok: false, error: "Key ID is required." }, { status: 400 });
      const rotated = rotateExternalAssistantApiKey({
        agencyId: session.agencyId,
        keyId: body.keyId,
        createdBy: session.email,
      });
      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        token: rotated.token,
        key: rotated.key,
        connection: connectionStatus(session.agencyId),
      }, { headers: { "cache-control": "private, no-store" } });
    }

    const status = connectionStatus(session.agencyId);
    if (!status.ready) {
      return NextResponse.json({
        ok: false,
        error: "Create an active API key before testing the connection.",
        connection: status,
      }, { status: 409 });
    }

    const context = buildExternalAssistantContext(session.agencyId);
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "integrations",
      action: "external_ai.connection_tested",
      message: "Tested the external AI data connection.",
      metadata: {
        modules: context.modules.length,
        records: context.modules.reduce((total, module) => total + module.recordCount, 0),
      },
    });
    await flushPendingWrites();
    return NextResponse.json({
      ok: true,
      connection: status,
      testedAt: new Date().toISOString(),
      moduleCount: context.modules.length,
      recordCount: context.modules.reduce((total, module) => total + module.recordCount, 0),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: managementError(error) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!validOrigin(req)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  const keyId = req.nextUrl.searchParams.get("keyId") ?? "";
  if (!keyId) return NextResponse.json({ ok: false, error: "Key ID is required." }, { status: 400 });

  try {
    const key = revokeExternalAssistantApiKey({
      agencyId: session.agencyId,
      keyId,
      revokedBy: session.email,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, key, connection: connectionStatus(session.agencyId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: managementError(error) }, { status: 404 });
  }
}

function connectionStatus(sessionAgencyId: string) {
  const keys = listExternalAssistantApiKeys(sessionAgencyId);
  const activeKeys = keys.filter(key => key.status === "active");
  const legacyToken = process.env.MILESYMEDIA_ASSISTANT_API_TOKEN?.trim() ?? "";
  const legacyAgencyId = process.env.MILESYMEDIA_ASSISTANT_AGENCY_ID?.trim() || "milesymedia";
  const legacyReady = legacyToken.length >= 32
    && legacyAgencyId === sessionAgencyId
    && Boolean(getState().agencies[legacyAgencyId]);
  const primaryFingerprint = activeKeys[0]?.fingerprint
    || (legacyToken ? crypto.createHash("sha256").update(legacyToken).digest("hex").slice(0, 12) : null);

  return {
    ready: activeKeys.length > 0 || legacyReady,
    readOnly: true,
    tokenConfigured: activeKeys.length > 0 || legacyToken.length > 0,
    tokenStrongEnough: activeKeys.length > 0 || legacyToken.length >= 32,
    tokenFingerprint: primaryFingerprint,
    agencyId: sessionAgencyId,
    agencyExists: Boolean(getState().agencies[sessionAgencyId]),
    agencyMatchesWorkspace: true,
    modules: EXTERNAL_ASSISTANT_MODULES,
    permissions: EXTERNAL_ASSISTANT_PERMISSIONS,
    activeKeyCount: activeKeys.length,
    legacyKeyConfigured: legacyToken.length > 0,
    legacyKeyReady: legacyReady,
    keys,
  };
}

function validModules(values?: string[]) {
  const modules = values?.length ? [...new Set(values)] : [...EXTERNAL_ASSISTANT_MODULES];
  if (modules.some(module => !isExternalAssistantModule(module))) throw new Error("invalid_modules");
  return modules;
}

function validPermissions(values?: string[]): ExternalAssistantApiPermission[] {
  const permissions = values?.length
    ? [...new Set(values)]
    : [...EXTERNAL_ASSISTANT_PERMISSIONS];
  if (permissions.some(permission => !EXTERNAL_ASSISTANT_PERMISSIONS.includes(permission as ExternalAssistantApiPermission))) {
    throw new Error("invalid_permissions");
  }
  return permissions as ExternalAssistantApiPermission[];
}

function validOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin;
}

function managementError(error: unknown) {
  const code = error instanceof Error ? error.message : "unknown_error";
  const messages: Record<string, string> = {
    active_key_limit_reached: "Revoke an active key before creating another one.",
    api_key_not_active: "Only an active key can be rotated.",
    api_key_not_found: "That API key could not be found.",
    invalid_expiry: "The expiry must be in the future.",
    invalid_key_name: "Give the key a clear name containing at least two characters.",
    invalid_modules: "Choose only supported data modules.",
    invalid_permissions: "Choose only supported API permissions.",
    modules_required: "Choose at least one data module.",
    permissions_required: "Choose at least one API permission.",
  };
  return messages[code] ?? "The API key could not be changed.";
}
