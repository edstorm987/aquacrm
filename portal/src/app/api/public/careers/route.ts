import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { FOUNDER_AGENCY_SLUG } from "@/lib/server/seeds/founderSeed";
import { attachStoredPrivateUpload, storePrivateUpload, PrivateUploadStorageError } from "@/lib/server/privateUploadStorage";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { createPeopleApplication } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import { getAgencyBySlug } from "@/server/tenants";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import type { PeopleEmploymentType } from "@/server/types";
import { careerApplicationFailurePayload } from "@/lib/public/careerApplicationFailure";
import { verifyBotChallenge } from "@/lib/server/security/botChallenge";
import { contentTrustObjectVersion } from "@/lib/server/security/contentTrust";

export const runtime = "nodejs";

const MAX_CV_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_CV_BYTES + 512 * 1024;
const PROOF_HEADER = "x-aqua-bot-token";
const FILE_SIZE_HEADER = "x-aqua-upload-size";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYMENT_TYPES = new Set<PeopleEmploymentType>(["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]);
const FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function field(form: FormData, key: string, max: number): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function responseError(error: string, status: number, retryAfter?: number) {
  return NextResponse.json({ ok: false, error }, {
    status,
    headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined,
  });
}

async function cancelUnreadBody(req: NextRequest): Promise<void> {
  if (!req.body || req.body.locked) return;
  await req.body.cancel().catch(() => undefined);
}

function declaredUploadSize(req: NextRequest): number | null {
  const raw = req.headers.get(FILE_SIZE_HEADER)?.trim() ?? "";
  if (!/^[1-9]\d{0,7}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= MAX_CV_BYTES ? value : null;
}

function requestBodyWithinCeiling(req: NextRequest): boolean {
  const raw = req.headers.get("content-length")?.trim();
  // The Fetch/FormData API offers no bounded streaming multipart parser here.
  // Refuse indeterminate/chunked bodies before proof verification or parsing;
  // a trusted proxy must supply the exact wire length for this upload route.
  if (!raw) return false;
  if (!/^\d{1,9}$/.test(raw)) return false;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_MULTIPART_BYTES;
}

function cvOwnerLane(agencyId: string, storageKey: string): string {
  const keyDigest = crypto.createHash("sha256").update(storageKey).digest("hex");
  return `people-cv:${agencyId}:${keyDigest}`;
}

function privateFailure(
  stage: string,
  cause: unknown,
  status: 500 | 503,
  context?: Record<string, unknown>,
) {
  const incidentId = `career_${crypto.randomBytes(12).toString("hex")}`;
  // Full diagnostics stay server-side. The public DTO below has a fixed shape
  // and cannot accidentally spread `attached.detail`, storage keys, provider
  // responses, database errors, or stack traces into an anonymous response.
  console.error("[careers] application failure", {
    incidentId,
    stage,
    error: cause instanceof Error ? cause.message : String(cause),
    ...context,
  });
  return NextResponse.json(careerApplicationFailurePayload(incidentId), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    await cancelUnreadBody(req);
    return responseError("This request could not be verified.", 403);
  }

  // The managed proof and cheap, bounded size metadata live outside the
  // multipart body. They are checked before `formData()` can allocate or drain
  // an attacker-controlled stream. `x-aqua-upload-size` is repeated against
  // the parsed File below; it is an admission bound, not trusted file truth.
  const admittedFileSize = declaredUploadSize(req);
  if (admittedFileSize === null || !requestBodyWithinCeiling(req)) {
    await cancelUnreadBody(req);
    return responseError("Attach a PDF, DOC or DOCX CV no larger than 8 MB.", 413);
  }

  const ip = clientIpFromHeaders(req.headers);
  const ipLimit = rateLimit({ key: `people-application:${ip}`, max: 5, windowMs: 60 * 60 * 1_000 });
  if (!ipLimit.allowed) {
    await cancelUnreadBody(req);
    return responseError("Too many applications were submitted. Please try again later.", 429, ipLimit.retryAfterSec);
  }

  const challenge = await verifyBotChallenge({
    action: "careers-application",
    token: req.headers.get(PROOF_HEADER),
    remoteIp: ip,
    hostname: req.nextUrl.hostname,
  });
  if (!challenge.ok) {
    await cancelUnreadBody(req);
    return responseError(
      challenge.message,
      challenge.reason === "rate-limited" ? 429 : 403,
      challenge.retryAfterSec,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return responseError("Please check the application and try again.", 400);
  }

  // Honeypot: silently accept bot traffic.
  if (field(form, "companyWebsite", 300)) return NextResponse.json({ ok: true });

  const name = field(form, "name", 120);
  const email = field(form, "email", 254).toLowerCase();
  const roleInterest = field(form, "roleInterest", 160);
  const cv = form.get("cv");
  if (name.length < 2 || !EMAIL.test(email) || !roleInterest) {
    return responseError("Add your name, a valid email and the kind of work you are interested in.", 400);
  }
  if (!(cv instanceof File) || cv.size !== admittedFileSize || cv.size > MAX_CV_BYTES || !FILE_TYPES.has(cv.type)) {
    return responseError("Attach a PDF, DOC or DOCX CV no larger than 8 MB.", 400);
  }

  const emailLimit = rateLimit({ key: `people-application-email:${email}`, max: 2, windowMs: 24 * 60 * 60 * 1_000 });
  if (!emailLimit.allowed) return responseError("We already have a recent application for this email address.", 429, emailLimit.retryAfterSec);

  try {
    await ensureHydrated();
    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    if (!agency) return privateFailure("agency_lookup", new Error("founder agency missing"), 503);

    const fileKey = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const extension = cv.name.toLowerCase().endsWith(".pdf") ? "pdf" : cv.name.toLowerCase().endsWith(".docx") ? "docx" : "doc";
    const stored = await storePrivateUpload({
      pathname: `people/${agency.id}/applications/${fileKey}.${extension}`,
      file: cv,
      contentType: cv.type,
      localDirectory: "people-cvs",
      localKey: `${fileKey}.${extension}`,
      trust: { tenantId: agency.id, purpose: "careers.cv" },
    });
    const assessedAt = Date.now();
    const digest = stored.contentTrust?.digest ?? "";
    const version = contentTrustObjectVersion(stored.storageProvider, stored.storageKey, digest);
    const scannerVerdict = stored.contentTrust?.scannerVerdict === "clean"
      ? "clean"
      : stored.contentTrust?.scannerVerdict === "unavailable"
        ? "unavailable"
        : stored.contentTrust?.scannerVerdict === "not-configured"
          ? "not-configured"
          : "not-run";
    const signatureVerdict = stored.contentTrust?.verdict === "clean" ? "clean" : "unverified";
    const quarantineStatus = scannerVerdict === "clean" ? "released" : "quarantined";
    const scanId = crypto.randomUUID();
    const employment = field(form, "employmentPreference", 40) as PeopleEmploymentType;
    const attached = await attachStoredPrivateUpload(stored, "people-cvs", () =>
      withPortalStateTransaction(cvOwnerLane(agency.id, stored.storageKey), () => createPeopleApplication({
        agencyId: agency.id,
        name,
        email,
        phone: field(form, "phone", 50),
        roleInterest,
        employmentPreference: EMPLOYMENT_TYPES.has(employment) ? employment : undefined,
        location: field(form, "location", 160),
        portfolioUrl: field(form, "portfolioUrl", 500),
        linkedInUrl: field(form, "linkedInUrl", 500),
        coverNote: field(form, "coverNote", 6_000),
        availabilityNote: field(form, "availabilityNote", 1_000),
        cv: {
          fileName: cv.name.slice(0, 240),
          contentType: cv.type,
          size: cv.size,
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          contentTrust: {
            digest,
            objectVersion: version,
            signatureVerdict,
            ...(stored.contentTrust?.sniffedType ? { sniffedType: stored.contentTrust.sniffedType } : {}),
            scannerVerdict,
            quarantineStatus,
            assessedAt,
          },
          securityAudit: [{
            scanId,
            event: "initial-assessment",
            actorRef: "system:public-careers-admission",
            objectVersion: version,
            digest,
            signatureVerdict,
            scannerVerdict,
            quarantineStatus,
            at: assessedAt,
          }],
        },
      })),
    );
    if (!attached.ok) {
      return privateFailure("attach_owner", new Error(attached.detail ?? attached.message), 500, {
        compensated: attached.compensated,
      });
    }
    const { application, statusToken } = attached.value;
    return NextResponse.json({
      ok: true,
      applicationId: application.id,
      statusUrl: new URL(`/careers/status/${statusToken}`, req.nextUrl.origin).toString(),
    }, { status: 201 });
  } catch (cause) {
    return privateFailure(
      cause instanceof PrivateUploadStorageError ? "storage_unavailable" : "application_write",
      cause,
      cause instanceof PrivateUploadStorageError ? 503 : 500,
    );
  }
}
