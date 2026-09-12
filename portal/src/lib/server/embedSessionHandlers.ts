import "server-only";

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createAquaEmbedToken, verifyAquaEmbedToken, type AquaEmbedMode } from "@/lib/server/aquaEmbedToken";
import {
  bearerFromRequest,
  cancelEmbedRequestBody,
  embedCredentialAllows,
  embedRequestOriginMatches,
  fastEmbedLimit,
  opaqueEmbedIp,
  readBoundedEmbedJson,
  reserveEmbedBudget,
  resolveEmbedBearer,
  revalidateEmbedCredential,
  type EmbedCredentialAuthority,
} from "@/lib/server/embedCredentialAuthority";
import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { getNonceStore, type NonceStore } from "@/lib/server/auth/nonceStore";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";
import { ensureHydrated } from "@/server/storage";
import { getClient } from "@/server/tenants";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { createUser, getUser, listUsersForAgency, listUsersForClient } from "@/server/users";
import type { ServerUser } from "@/server/types";

type BudgetReservation = typeof reserveEmbedBudget;

interface EmbedHandlerDependencies {
  reserveBudget?: BudgetReservation;
  nonceStore?: NonceStore;
}

function noStoreJson(body: Record<string, unknown>, status: number, retryAfterSec?: number): NextResponse {
  const headers: Record<string, string> = { "cache-control": "private, no-store" };
  if (retryAfterSec) headers["retry-after"] = String(retryAfterSec);
  return NextResponse.json(body, { status, headers });
}

function genericAuthorityFailure(status = 401): NextResponse {
  return noStoreJson({ ok: false, error: "This embed request could not be authorised." }, status);
}

function consumeFailure(message: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: {
      location: `/login?error=${encodeURIComponent(message)}`,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

function cleanString(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
}

export async function handleEmbedSessionMint(
  request: NextRequest,
  dependencies: EmbedHandlerDependencies = {},
): Promise<NextResponse> {
  const fast = fastEmbedLimit("issue", request.headers);
  if (!fast.allowed) {
    await cancelEmbedRequestBody(request);
    return noStoreJson({ ok: false, error: "Too many embed requests. Try again later." }, 429, fast.retryAfterSec);
  }
  const parsed = await readBoundedEmbedJson(request);
  if (!parsed.ok) return noStoreJson({ ok: false, error: "Invalid embed request." }, parsed.status);
  const clientId = cleanString(parsed.value.clientId, 160) ?? "";
  const requestedMode = parsed.value.mode;
  if (!clientId || (requestedMode !== "client" && requestedMode !== "admin")) {
    return noStoreJson({ ok: false, error: "Invalid embed request." }, 400);
  }

  await ensureHydrated();
  const resolution = resolveEmbedBearer(bearerFromRequest(request), clientId);
  if (resolution.status !== "ok") return genericAuthorityFailure();
  const credential = resolution.credential;
  const reserve = dependencies.reserveBudget ?? reserveEmbedBudget;
  let budget;
  try {
    budget = await reserve({
      action: "issue",
      agencyId: credential.agencyId,
      credentialId: credential.id,
      ipRef: opaqueEmbedIp(request.headers),
    });
  } catch {
    return noStoreJson({ ok: false, error: "Embed access is temporarily unavailable." }, 503);
  }
  if (!budget.allowed) {
    return noStoreJson({ ok: false, error: "Too many embed requests. Try again later." }, 429, budget.retryAfterSec);
  }

  const client = getClient(clientId);
  const mode = requestedMode as AquaEmbedMode;
  if (!client || !embedCredentialAllows(credential, client, mode)) return genericAuthorityFailure(403);

  let issued: ReturnType<typeof createAquaEmbedToken>;
  try {
    issued = createAquaEmbedToken({
      agencyId: credential.agencyId,
      clientId: client.id,
      credentialId: credential.id,
      credentialVersion: credential.version,
      mode,
      email: cleanString(parsed.value.email, 254),
      name: cleanString(parsed.value.name, 160),
      origin: credential.allowedOrigin,
    });
  } catch {
    return noStoreJson({ ok: false, error: "Embed access is temporarily unavailable." }, 503);
  }
  const consumeUrl = new URL("/api/v1/embed/consume", request.nextUrl.origin);
  consumeUrl.searchParams.set("token", issued.token);
  recordSecurityEvent({
    kind: "embed.session-issued",
    severity: "info",
    tenantId: credential.agencyId,
    actor: `embed-credential:${credential.id}`,
    detail: { credentialId: credential.id, clientId: client.id, mode },
  });
  return noStoreJson({
    ok: true,
    url: consumeUrl.toString(),
    // Both entrypoints intentionally exchange through the same single-use URL.
    // The direct /embed/account?token= verifier no longer exists.
    embedUrl: consumeUrl.toString(),
    expiresAt: issued.expiresAt,
    client: { id: client.id, name: client.name },
  }, 200);
}

function clientUser(input: {
  clientId: string;
  agencyId: string;
  clientName: string;
  email?: string;
  name?: string;
}) {
  const requestedEmail = input.email?.trim().toLowerCase();
  const exact = requestedEmail
    ? getUser(requestedEmail, { role: "end-customer", clientId: input.clientId })
    : null;
  if (exact?.role === "end-customer") return exact;
  const existing = listUsersForClient(input.clientId).find(user => user.role === "end-customer");
  if (existing) return existing;
  return createUser({
    email: requestedEmail || `portal-${input.clientId}@access.aqua.local`,
    password: `${randomBytes(24).toString("base64url")}Aa1!`,
    name: input.name || `${input.clientName} client`,
    role: "end-customer",
    agencyId: input.agencyId,
    clientId: input.clientId,
  });
}

export async function handleEmbedSessionConsume(
  request: NextRequest,
  dependencies: EmbedHandlerDependencies = {},
): Promise<NextResponse> {
  const fast = fastEmbedLimit("consume", request.headers);
  if (!fast.allowed) return consumeFailure("This Aqua access link is unavailable. Open Aqua from your portal again.");
  const token = request.nextUrl.searchParams.get("token") ?? "";
  let payload: ReturnType<typeof verifyAquaEmbedToken>;
  try {
    payload = verifyAquaEmbedToken(token);
  } catch {
    return consumeFailure("Embed access is temporarily unavailable. Open Aqua from your portal again.");
  }
  if (!payload) return consumeFailure("This Aqua access link is unavailable. Open Aqua from your portal again.");

  await ensureHydrated();
  const nonceStore = dependencies.nonceStore ?? getNonceStore();
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") && nonceStore.kind === "memory") {
    // Local/test memory keeps development friction low. A production process
    // must never claim single-use semantics without a shared Postgres or
    // Supabase nonce ledger.
    return consumeFailure("Embed access is temporarily unavailable. Open Aqua from your portal again.");
  }
  const reserve = dependencies.reserveBudget ?? reserveEmbedBudget;
  try {
    const outcome = await withPortalStateTransaction(`aqua-embed-consume:${payload.agencyId}`, async () => {
      const credential = revalidateEmbedCredential(payload);
      const client = getClient(payload.clientId);
      if (!credential || !client || !embedCredentialAllows(credential, client, payload.mode)) {
        return { status: "invalid" as const };
      }
      if (!embedRequestOriginMatches(credential.allowedOrigin, request.headers)) {
        return { status: "origin" as const };
      }
      const budget = await reserve({
        action: "consume",
        agencyId: credential.agencyId,
        credentialId: credential.id,
        ipRef: opaqueEmbedIp(request.headers),
      });
      if (!budget.allowed) return { status: "limited" as const, retryAfterSec: budget.retryAfterSec };
      const ttlMs = Math.max(1, payload.exp * 1_000 - Date.now());
      const consumed = await nonceStore.consumeNonce(payload.nonce, "aqua-embed", ttlMs);
      if (!consumed) return { status: "replayed" as const };

      const user = payload.mode === "admin"
        ? listUsersForAgency(client.agencyId).find(candidate => candidate.role === "agency-owner")
          ?? listUsersForAgency(client.agencyId).find(candidate => candidate.role === "agency-manager")
        : clientUser({
            clientId: client.id,
            agencyId: client.agencyId,
            clientName: client.name,
            email: payload.email,
            name: payload.name,
          });
      return user
        ? { status: "ok" as const, credential, client, user }
        : { status: "invalid" as const };
    });

    if (outcome.status === "origin") return consumeFailure("This Aqua access link belongs to a different portal.");
    if (outcome.status !== "ok") return consumeFailure("This Aqua access link is unavailable. Open Aqua from your portal again.");
    return successfulConsume(payload.mode, outcome.credential, outcome.client.id, outcome.user);
  } catch {
    // A nonce-store outage, durable budget failure or PortalState commit failure
    // must never degrade into a reusable or partially authenticated token.
    return consumeFailure("Embed access is temporarily unavailable. Open Aqua from your portal again.");
  }
}

function successfulConsume(
  mode: AquaEmbedMode,
  credential: EmbedCredentialAuthority,
  clientId: string,
  user: ServerUser,
): NextResponse {
  const session = issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: credential.agencyId,
    agencyIds: [credential.agencyId],
    activeAgencyId: credential.agencyId,
    clientId: user.role === "end-customer" ? clientId : user.clientId,
    embed: mode === "client" ? {
      credentialId: credential.id,
      credentialVersion: credential.version,
      allowedOrigin: credential.allowedOrigin,
    } : undefined,
    sessionRev: user.sessionRev ?? 0,
    accessRev: user.accessRev,
  });
  const destination = mode === "admin"
    ? `/portal/clients/${encodeURIComponent(clientId)}?tab=portal`
    : "/embed/account";
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      location: destination,
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
  const cookie = sessionCookie(session);
  response.cookies.set(cookie.name, cookie.value, {
    ...cookie.options,
    // Production embeds need the exchanged session inside a cross-site frame.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
  });
  recordSecurityEvent({
    kind: "embed.session-consumed",
    severity: "info",
    tenantId: credential.agencyId,
    actor: `embed-credential:${credential.id}`,
    detail: { credentialId: credential.id, clientId, mode },
  });
  return response;
}
