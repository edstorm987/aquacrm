import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  ensurePublicFunnelFoundationRegistered,
  FunnelInputError,
  publicFunnelContainerFor,
} from "@/built-ins/runtime/foundation-adapters/publicFunnelFoundation";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import { FOUNDER_AGENCY_SLUG } from "@/lib/server/seeds/founderSeed";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { flushPendingWrites, ensureHydrated } from "@/server/storage";
import { getInstall } from "@/server/pluginInstalls";
import { getAgencyBySlug } from "@/server/tenants";

export const runtime = "nodejs";

interface HealthCheckCompletionBody {
  email?: unknown;
  completionId?: unknown;
  slot?: unknown;
  sourceUrl?: unknown;
  captchaToken?: unknown;
}

function failure(status: number, error: string, message: string, retryAfterSec?: number) {
  return NextResponse.json(
    { ok: false, error, message, retryable: status >= 500 || status === 429 },
    { status, headers: retryAfterSec ? { "retry-after": String(retryAfterSec) } : undefined },
  );
}

// Rate limited 2026-08-27 (Phase D public-surface review).
//
// Anonymous completion is capture-only. It must never mint authentication;
// mailbox-verified, single-use continuation is a separate future flow.
//
// The limit is per-IP and generous enough that a real person finishing the
// funnel, or retrying after a dropped connection, will never see it.
const IP_MAX_PER_WINDOW = 15;
const ADDRESS_MAX_PER_WINDOW = 6;
const INSTALL_MAX_PER_WINDOW = 60;
const SHORT_WINDOW_MS = 10 * 60 * 1_000;
const ADDRESS_WINDOW_MS = 60 * 60 * 1_000;

// These are honest process-local fast layers. ABUSE-BASE-001 remains the
// release dependency for atomic multi-instance enforcement; this route does
// not pretend an in-memory Map is durable production evidence.

function addressDigest(email: string): string {
  return createHash("sha256")
    .update("health-check-complete-address\u0000")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  // A cheap caller-owned IP budget runs before the managed provider call. The
  // address and install budgets stay below the challenge so a tokenless bot
  // cannot lock out a victim or spend the shared funnel allowance.
  const ipLimit = rateLimit({
    key: `health-check-complete-ip:${ip}`,
    max: IP_MAX_PER_WINDOW,
    windowMs: SHORT_WINDOW_MS,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Too many attempts. Please try again shortly.", retryable: true },
      { status: 429, headers: { "retry-after": String(ipLimit.retryAfterSec) } },
    );
  }

  const body = await request.json().catch(() => null) as HealthCheckCompletionBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const completionId = typeof body?.completionId === "string" ? body.completionId.trim() : "";
  const slot = body?.slot && typeof body.slot === "object" && !Array.isArray(body.slot)
    ? body.slot as Record<string, unknown>
    : null;

  if (!email || !completionId || !slot) {
    return failure(400, "invalid_body", "Email, completion id and Health Check results are required.");
  }

  // ABUSE-002 / DECISIONS #13: exact action + request-host proof is required
  // before any address/install allowance, hydration or capture work.
  // The verifier has its own per-IP provider budget and single-use token guard.
  const challenge = await verifyBotChallenge({
    action: "health-check-complete",
    token: body?.captchaToken,
    remoteIp: ip,
    hostname: request.nextUrl.hostname,
  });
  if (!challenge.ok) {
    return failure(
      challenge.reason === "rate-limited" ? 429 : 403,
      "challenge_failed",
      challenge.message,
      challenge.retryAfterSec,
    );
  }

  const addressLimit = rateLimit({
    key: `health-check-complete-address:${addressDigest(email)}`,
    max: ADDRESS_MAX_PER_WINDOW,
    windowMs: ADDRESS_WINDOW_MS,
  });
  if (!addressLimit.allowed) {
    return failure(
      429,
      "rate_limited",
      "We already have your recent Health Check requests. Please wait before trying again.",
      addressLimit.retryAfterSec,
    );
  }

  try {
    await ensureHydrated({ fresh: true });
    // This public request must never bootstrap an agency, account or plugin.
    // Provisioning owns that privileged work; an unconfigured installation
    // fails closed below without creating any authentication surface.
    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    if (!agency) {
      return failure(503, "funnel_unavailable", "The Health Check handoff is not configured yet. Please try again.");
    }

    const install = getInstall({ agencyId: agency.id }, "public-funnel");
    if (!install?.enabled) {
      return failure(503, "funnel_unavailable", "The Health Check handoff is not available right now. Please try again.");
    }

    const installLimit = rateLimit({
      key: `health-check-complete-install:${install.id}`,
      max: INSTALL_MAX_PER_WINDOW,
      windowMs: SHORT_WINDOW_MS,
    });
    if (!installLimit.allowed) {
      return failure(
        429,
        "rate_limited",
        "The Health Check handoff is busy. Please wait a moment and try again.",
        installLimit.retryAfterSec,
      );
    }

    ensurePublicFunnelFoundationRegistered();
    const result = await publicFunnelContainerFor({
      agencyId: agency.id,
      install,
      storage: makePluginStorage(install.id),
    }).funnel.captureHcCompletion({
      email,
      completionId,
      slot,
      sourceMeta: {
        journey: "mounted-health-check",
        ...(typeof body?.sourceUrl === "string" ? { sourceUrl: body.sourceUrl.slice(0, 2048) } : {}),
      },
    });

    await flushPendingWrites();

    const response = NextResponse.json({
      ok: true,
      persisted: true,
      created: result.created,
      redirect: "/business-os/app.html?from=hc",
      authentication: "email_verification_required",
    });
    return response;
  } catch (error) {
    if (error instanceof FunnelInputError) {
      // Keep replay, existing-identity and malformed-input refusals
      // indistinguishable to an anonymous caller.
      return failure(400, "invalid_completion", "The Health Check handoff details are invalid.");
    }
    console.error(
      "[health-check] completion handoff failed:",
      error instanceof Error ? error.message : error,
    );
    return failure(503, "completion_unavailable", "Your results could not be saved yet. Please try again.");
  }
}
