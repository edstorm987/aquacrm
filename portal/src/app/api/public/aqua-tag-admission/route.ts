import { NextResponse, type NextRequest } from "next/server";

import { isSafeCapturedFieldKey, type CapturedField } from "@/lib/enquiries/formCapture";
import { normaliseAquaSubmissionId } from "@/lib/enquiries/submissionIdentity";
import { publicAquaPropertyId } from "@/lib/public/publicSites";
import { parseJsonObject, readBoundedRequestBody } from "@/lib/server/boundedRequestBody";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import {
  AQUA_TAG_FORM_CAPTURE_ACTION,
  issueAquaTagFormAdmission,
  resolveAquaTagAdmissionScope,
  type AquaTagFormFacts,
} from "@/lib/server/security/aquaTagFormAdmission";
import { ensureHydrated } from "@/server/storage";

const MAX_FIELDS = 60;
// 60 captured values can each carry 2,000 characters, plus labels and form
// metadata. Keep the wire ceiling just above that documented contract.
const MAX_ADMISSION_BODY_BYTES = 160 * 1_024;
const ALLOWED_KEYS = new Set([
  "siteKey", "propertyId", "formName", "formId", "purpose", "pageUrl",
  "pagePath", "submittedAt", "submissionId", "fields", "captchaToken",
]);

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fields(value: unknown): CapturedField[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const field = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    return {
      key: clean(field.key, 120),
      ...(clean(field.label, 120) ? { label: clean(field.label, 120) } : {}),
      value: clean(field.value, 2_000),
      ...(clean(field.type, 30) ? { type: clean(field.type, 30) } : {}),
    };
  }).filter(field => isSafeCapturedFieldKey(field.key) && field.value).slice(0, MAX_FIELDS);
}

function cors(origin: string | null): HeadersInit {
  return {
    ...(origin ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const bounded = await readBoundedRequestBody(req, MAX_ADMISSION_BODY_BYTES);
  if (!bounded.ok) {
    return NextResponse.json(
      { ok: false, ...(bounded.status === 413 ? { error: "payload too large" } : {}) },
      { status: bounded.status, headers: cors(origin) },
    );
  }
  const body = parseJsonObject(bounded.rawBody);
  if (!body) return NextResponse.json({ ok: false }, { status: 400, headers: cors(origin) });
  if (Object.keys(body).some(key => !ALLOWED_KEYS.has(key))) {
    return NextResponse.json({ ok: false }, { status: 400, headers: cors(origin) });
  }
  const submissionId = normaliseAquaSubmissionId(clean(body.submissionId, 120));
  const capturedFields = fields(body.fields);
  if (!submissionId || !capturedFields.length) {
    return NextResponse.json({ ok: false }, { status: 400, headers: cors(origin) });
  }

  await ensureHydrated({ fresh: true });
  const scope = resolveAquaTagAdmissionScope(body.siteKey, origin);
  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "This form capture could not be verified." },
      { status: 403, headers: cors(null) },
    );
  }
  const requestedProperty = clean(body.propertyId, 120);
  const propertyId = (
    publicAquaPropertyId(scope.siteKey, requestedProperty)
    ?? scope.propertyId
    ?? requestedProperty
  ) || undefined;
  const pageUrl = clean(body.pageUrl, 500) || undefined;
  if (pageUrl) {
    try {
      if (new URL(pageUrl).hostname.toLowerCase() !== scope.challengeHostname) {
        return NextResponse.json({ ok: false }, { status: 403, headers: cors(null) });
      }
    } catch { return NextResponse.json({ ok: false }, { status: 400, headers: cors(origin) }); }
  }
  const facts: AquaTagFormFacts = {
    submissionId,
    ...(clean(body.formName, 160) ? { formName: clean(body.formName, 160) } : {}),
    ...(clean(body.formId, 120) ? { formId: clean(body.formId, 120) } : {}),
    ...(clean(body.purpose, 40) ? { purpose: clean(body.purpose, 40) } : {}),
    ...(pageUrl ? { pageUrl } : {}),
    pagePath: clean(body.pagePath, 300) || "/",
    ...(propertyId ? { propertyId } : {}),
    fields: capturedFields,
  };

  // Only caller-IP/provider pressure valves run before proof. Address, tenant
  // and install quotas live at the capture transition, after exact managed
  // proof and replay classification, so an attacker cannot spend a victim's
  // budget by naming their email address here.
  const ip = clientIpFromHeaders(req.headers);
  const limit = rateLimit({ key: `aqua-tag-admission:${ip}`, max: 60, windowMs: 60 * 60 * 1_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many form submissions. Please try again later." },
      { status: 429, headers: { ...cors(origin), "retry-after": String(limit.retryAfterSec) } },
    );
  }
  const challenge = await verifyBotChallenge({
    action: AQUA_TAG_FORM_CAPTURE_ACTION,
    token: body.captchaToken,
    remoteIp: ip,
    hostname: scope.challengeHostname,
    tenantId: scope.agencyId,
  });
  if (!challenge.ok) {
    return NextResponse.json(
      { ok: false, error: challenge.message || "This form capture could not be verified." },
      {
        status: challenge.reason === "rate-limited" ? 429 : 403,
        headers: {
          ...cors(null),
          ...(challenge.retryAfterSec ? { "retry-after": String(challenge.retryAfterSec) } : {}),
        },
      },
    );
  }
  const admission = issueAquaTagFormAdmission(scope, facts);
  if (!admission) {
    return NextResponse.json(
      { ok: false, error: "Form capture is temporarily unavailable." },
      { status: 503, headers: cors(origin) },
    );
  }
  return NextResponse.json(
    { ok: true, admission: admission.token, expiresAt: admission.expiresAt, submissionId },
    { status: 201, headers: cors(origin) },
  );
}
