import { NextResponse, type NextRequest } from "next/server";
import {
  ensurePublicFunnelFoundationRegistered,
  FunnelInputError,
  publicFunnelContainerFor,
} from "@/built-ins/runtime/foundation-adapters/publicFunnelFoundation";
import { sessionCookie } from "@/lib/server/auth/auth";
import { FOUNDER_AGENCY_SLUG, seedFounder } from "@/lib/server/seeds/founderSeed";
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
}

function failure(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message, retryable: status >= 500 }, { status });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as HealthCheckCompletionBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const completionId = typeof body?.completionId === "string" ? body.completionId.trim() : "";
  const slot = body?.slot && typeof body.slot === "object" && !Array.isArray(body.slot)
    ? body.slot as Record<string, unknown>
    : null;

  if (!email || !completionId || !slot) {
    return failure(400, "invalid_body", "Email, completion id and Health Check results are required.");
  }

  try {
    await ensureHydrated({ fresh: true });
    await seedFounder();
    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    if (!agency) {
      return failure(503, "funnel_unavailable", "The Health Check handoff is not configured yet. Please try again.");
    }

    const install = getInstall({ agencyId: agency.id }, "public-funnel");
    if (!install?.enabled) {
      return failure(503, "funnel_unavailable", "The Health Check handoff is not available right now. Please try again.");
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
      captureId: result.capture.id,
      leadUserId: result.leadUserId,
      created: result.created,
      redirect: "/business-os/app.html?from=hc",
    });
    if (result.session) {
      const cookie = sessionCookie(result.session);
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    return response;
  } catch (error) {
    if (error instanceof FunnelInputError) {
      return failure(400, error.message, "The Health Check handoff details are invalid.");
    }
    console.error(
      "[health-check] completion handoff failed:",
      error instanceof Error ? error.message : error,
    );
    return failure(503, "completion_unavailable", "Your results could not be saved yet. Please try again.");
  }
}
