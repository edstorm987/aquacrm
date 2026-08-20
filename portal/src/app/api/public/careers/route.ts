import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { FOUNDER_AGENCY_SLUG, seedFounder } from "@/lib/server/seeds/founderSeed";
import { storePrivateUpload, PrivateUploadStorageError } from "@/lib/server/privateUploadStorage";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { createPeopleApplication } from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getAgencyBySlug } from "@/server/tenants";
import type { PeopleEmploymentType } from "@/server/types";

export const runtime = "nodejs";

const MAX_CV_BYTES = 8 * 1024 * 1024;
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

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return responseError("This request could not be verified.", 403);

  const ip = clientIpFromHeaders(req.headers);
  const ipLimit = rateLimit({ key: `people-application:${ip}`, max: 5, windowMs: 60 * 60 * 1_000 });
  if (!ipLimit.allowed) return responseError("Too many applications were submitted. Please try again later.", 429, ipLimit.retryAfterSec);

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
  if (!(cv instanceof File) || cv.size < 1 || cv.size > MAX_CV_BYTES || !FILE_TYPES.has(cv.type)) {
    return responseError("Attach a PDF, DOC or DOCX CV no larger than 8 MB.", 400);
  }

  const emailLimit = rateLimit({ key: `people-application-email:${email}`, max: 2, windowMs: 24 * 60 * 60 * 1_000 });
  if (!emailLimit.allowed) return responseError("We already have a recent application for this email address.", 429, emailLimit.retryAfterSec);

  try {
    await ensureHydrated();
    await seedFounder();
    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    if (!agency) return responseError("Applications are temporarily unavailable.", 503);

    const fileKey = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const extension = cv.name.toLowerCase().endsWith(".pdf") ? "pdf" : cv.name.toLowerCase().endsWith(".docx") ? "docx" : "doc";
    const stored = await storePrivateUpload({
      pathname: `people/${agency.id}/applications/${fileKey}.${extension}`,
      file: cv,
      contentType: cv.type,
      localDirectory: "people-cvs",
      localKey: `${fileKey}.${extension}`,
    });
    const employment = field(form, "employmentPreference", 40) as PeopleEmploymentType;
    const { application, statusToken } = createPeopleApplication({
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
      },
    });
    await flushPendingWrites();
    return NextResponse.json({
      ok: true,
      applicationId: application.id,
      statusUrl: new URL(`/careers/status/${statusToken}`, req.nextUrl.origin).toString(),
    }, { status: 201 });
  } catch (cause) {
    if (cause instanceof PrivateUploadStorageError) return responseError(cause.message, 503);
    console.error("[careers] application failed", cause);
    return responseError(cause instanceof Error ? cause.message : "The application could not be saved.", 500);
  }
}
