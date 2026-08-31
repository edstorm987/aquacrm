import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { attachStoredPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { freelancerJobForAction } from "@/server/freelancerWorkspace";
import { recordPeopleFreelancerSubmission } from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf", "application/zip", "application/x-zip-compressed",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg", "image/png", "image/webp", "text/csv", "text/plain",
  "video/mp4", "video/quicktime", "audio/mpeg", "audio/mp4", "audio/wav",
]);

function safeName(value: string): string {
  return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "work-file";
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (session.role !== "freelancer") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const form = await request.formData().catch(() => null);
    const jobId = typeof form?.get("jobId") === "string" ? String(form.get("jobId")).trim().slice(0, 120) : "";
    const file = form?.get("file");
    if (!jobId || !(file instanceof File)) return NextResponse.json({ ok: false, error: "job and file are required" }, { status: 400 });
    const job = freelancerJobForAction(session.agencyId, session.userId, jobId, "upload");
    if (!job) return NextResponse.json({ ok: false, error: "Uploads are not available for this job." }, { status: 403 });
    if (job.status !== "active" && job.status !== "delivered") {
      return NextResponse.json({ ok: false, error: "Work can only be uploaded to an active or delivered job." }, { status: 409 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "files must be smaller than 50 MB" }, { status: 413 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ ok: false, error: "this file type is not supported" }, { status: 415 });

    const id = `freelancerfile_${crypto.randomBytes(8).toString("hex")}`;
    const filename = safeName(file.name);
    const relativeKey = join(session.agencyId, job.id, `${id}-${filename}`);
    let stored;
    try {
      stored = await storePrivateUpload({
        pathname: `freelancer-work/${session.agencyId}/${job.id}/${id}-${filename}`,
        file,
        contentType: file.type,
        localDirectory: "freelancer-work",
        localKey: relativeKey,
      });
    } catch (error) {
      if (error instanceof PrivateUploadStorageError) {
        return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
      }
      throw error;
    }
    const submission = {
      id,
      name: file.name.trim().slice(0, 180),
      url: `/api/portal/freelancer/work/content?jobId=${encodeURIComponent(job.id)}&fileId=${encodeURIComponent(id)}`,
      uploadedByUserId: session.userId,
      uploadedAt: Date.now(),
      size: file.size,
      contentType: file.type,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
    };
    const attached = await attachStoredPrivateUpload(stored, "freelancer-work", () => {
      recordPeopleFreelancerSubmission({ agencyId: session.agencyId, jobId: job.id, actorUserId: session.userId, submission });
      return submission;
    });
    if (!attached.ok) {
      return NextResponse.json({
        ok: false,
        error: attached.message,
        code: attached.compensated ? "upload_record_failed" : "upload_orphaned",
        detail: attached.detail,
        storageKey: attached.compensated ? undefined : attached.storageKey,
      }, { status: 500 });
    }
    await flushPendingWrites();
    return NextResponse.json({ ok: true, submission: { id, name: submission.name, url: submission.url, uploadedAt: submission.uploadedAt, size: submission.size } }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
