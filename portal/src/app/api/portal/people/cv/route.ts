import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest, AuthError } from "@/lib/server/auth/auth";
import { requireCsrf } from "@/lib/server/auth/csrf";
import { readPrivateUpload } from "@/lib/server/privateUploadStorage";
import { clientIpFromHeaders, rateLimitBatch } from "@/lib/server/rateLimit";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";
import {
  getPeopleApplication,
  peopleCvAuditActorRef,
  reservePeopleCvScanBudget,
  setPeopleApplicationCvTrust,
} from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import { withPortalProviderLease, withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import {
  assessUploadContent,
  contentTrustObjectVersion,
  hasContentScanner,
  operatorDocumentDownloadAllowed,
} from "@/lib/server/security/contentTrust";

export const runtime = "nodejs";

function headers(file: { fileName: string; contentType: string }, exactSize: number): Headers {
  const value = new Headers();
  value.set("content-type", file.contentType || "application/octet-stream");
  // Candidate documents are downloads, never active inline browser content.
  value.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  value.set("cache-control", "private, no-store");
  value.set("x-content-type-options", "nosniff");
  value.set("content-security-policy", "default-src 'none'; sandbox");
  value.set("content-length", String(exactSize));
  return value;
}

async function digestBlob(blob: Blob): Promise<string> {
  const hash = crypto.createHash("sha256");
  const reader = blob.stream().getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hash.update(chunk.value);
  }
  return hash.digest("hex");
}

function sameStoredCv(
  current: NonNullable<ReturnType<typeof getPeopleApplication>>,
  expected: {
    storageProvider: string;
    storageKey: string;
    digest: string;
    objectVersion: string;
    quarantineStatus: string;
  },
): boolean {
  return current.cv.storageProvider === expected.storageProvider
    && current.cv.storageKey === expected.storageKey
    && (current.cv.contentTrust?.digest ?? "") === expected.digest
    && (current.cv.contentTrust?.objectVersion ?? "") === expected.objectVersion
    && (current.cv.contentTrust?.quarantineStatus ?? "quarantined") === expected.quarantineStatus;
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || (session.role !== "agency-owner" && session.role !== "agency-manager")) throw new AuthError(401, "unauthorized");
    // A candidate's CV is HR recruitment data. Every other application action in
    // the People route answers to `staff.people`; this one was still deciding on
    // the role alone, so a governed manager restricted out of People could read
    // applicants' CVs. It is a read, so `view` — the same level that shows the
    // application it belongs to.
    await requireCurrentWorkspaceElementAccess("staff", "staff.people", "view");
    const applicationId = request.nextUrl.searchParams.get("applicationId")?.trim() ?? "";
    const application = getPeopleApplication(session.agencyId, applicationId);
    if (!application) return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    const file = application.cv;
    // Fail closed for legacy files, scanner outages and signature-only checks.
    // A matching PDF/ZIP header is not malware clearance. Bytes remain in
    // private quarantine until a real AV/CDR scanner returns an explicit clean
    // verdict; neither owner nor manager role overrides this boundary.
    if (!operatorDocumentDownloadAllowed(file.contentTrust, {
      storageProvider: file.storageProvider,
      storageKey: file.storageKey,
    })) {
      return NextResponse.json(
        {
          ok: false,
          code: "cv_quarantined",
          error: "This CV is still in security quarantine and cannot be downloaded yet.",
        },
        { status: 423, headers: { "cache-control": "private, no-store" } },
      );
    }
    const stored = await readPrivateUpload({
      storageProvider: file.storageProvider,
      storageKey: file.storageKey,
      localDirectory: "people-cvs",
    });
    if (!stored) return NextResponse.json({ ok: false, error: "CV file not found." }, { status: 404 });
    // A historical clean verdict is not authority for newly returned bytes.
    // Hash the exact Blob this response would send, then fail closed if the
    // provider object changed under the same key.
    const returnedDigest = await digestBlob(stored);
    if (returnedDigest !== file.contentTrust?.digest) {
      const scanId = crypto.randomUUID();
      const expected = {
        storageProvider: file.storageProvider,
        storageKey: file.storageKey,
        digest: file.contentTrust?.digest ?? "",
        objectVersion: file.contentTrust?.objectVersion ?? "",
        quarantineStatus: file.contentTrust?.quarantineStatus ?? "quarantined",
      };
      try {
        const quarantined = await withPortalStateTransaction(`people-cv:${session.agencyId}:${application.id}`, () => {
          const current = getPeopleApplication(session.agencyId, application.id);
          if (!current || !sameStoredCv(current, expected)) return null;
          const at = Date.now();
          return setPeopleApplicationCvTrust({
            agencyId: session.agencyId,
            applicationId: current.id,
            contentTrust: {
              digest: expected.digest,
              objectVersion: expected.objectVersion,
              signatureVerdict: "unverified",
              scannerVerdict: "not-run",
              quarantineStatus: "quarantined",
              assessedAt: at,
            },
            audit: {
              scanId,
              event: "download-digest-mismatch",
              actorRef: peopleCvAuditActorRef(session.agencyId, session.userId),
              objectVersion: expected.objectVersion,
              digest: returnedDigest,
              signatureVerdict: "unverified",
              scannerVerdict: "not-run",
              quarantineStatus: "quarantined",
              at,
            },
          });
        });
        if (quarantined) {
          recordSecurityEvent({
            kind: "content-trust.download-digest-mismatch",
            severity: "critical",
            tenantId: session.agencyId,
            actor: session.userId,
            detail: { applicationId: application.id, scanId, objectVersion: expected.objectVersion, digest: returnedDigest },
          });
        }
      } catch {
        return NextResponse.json(
          { ok: false, code: "cv_integrity_persistence_failed", error: "The CV failed its integrity check and remains unavailable." },
          { status: 503, headers: { "cache-control": "private, no-store" } },
        );
      }
      return NextResponse.json(
        { ok: false, code: "cv_integrity_mismatch", error: "The CV failed its integrity check and has been quarantined." },
        { status: 423, headers: { "cache-control": "private, no-store" } },
      );
    }
    return new Response(stored, { headers: headers(file, stored.size) });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}

/** Retry AV/CDR for a quarantined CV after a scanner outage was restored. */
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 415 });
    }
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return NextResponse.json({ ok: false, error: "This request could not be verified." }, { status: 403 });
    }
    const csrf = requireCsrf(request);
    if (!csrf.ok) {
      return NextResponse.json({ ok: false, error: csrf.error }, { status: 403 });
    }
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || (session.role !== "agency-owner" && session.role !== "agency-manager")) throw new AuthError(401, "unauthorized");
    await requireCurrentWorkspaceElementAccess("staff", "staff.people", "manage");
    const body = await request.json().catch(() => null) as { applicationId?: unknown } | null;
    const applicationId = typeof body?.applicationId === "string" ? body.applicationId.trim() : "";
    const application = getPeopleApplication(session.agencyId, applicationId);
    if (!application) return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    if (application.cv.contentTrust?.quarantineStatus === "released") {
      return NextResponse.json({ ok: false, code: "cv_already_released", error: "This CV is already cleared." }, { status: 409 });
    }
    if (!hasContentScanner()) {
      return NextResponse.json(
        { ok: false, code: "scanner_unavailable", error: "The security scanner is unavailable. This CV remains quarantined." },
        { status: 503, headers: { "cache-control": "private, no-store" } },
      );
    }
    const ip = clientIpFromHeaders(request.headers);
    const budget = rateLimitBatch([
      { key: `people-cv-rescan-user:${session.userId}`, max: 5, windowMs: 15 * 60_000 },
      { key: `people-cv-rescan-tenant:${session.agencyId}`, max: 30, windowMs: 60 * 60_000 },
      { key: `people-cv-rescan-ip:${ip}`, max: 20, windowMs: 60 * 60_000 },
    ]);
    if (!budget.allowed) {
      return NextResponse.json(
        { ok: false, code: "rescan_rate_limited", error: "Too many security scans. Please try again later." },
        { status: 429, headers: { "retry-after": String(budget.retryAfterSec), "cache-control": "private, no-store" } },
      );
    }
    const scanId = crypto.randomUUID();
    const actorRef = peopleCvAuditActorRef(session.agencyId, session.userId);
    const result = await withPortalProviderLease(`people-cv-rescan:${session.agencyId}:${application.id}`, async () => {
      // Snapshot the exact durable owner tuple under a short state transaction.
      // The expensive storage read and scanner call happen only after it exits.
      const snapshot = await withPortalStateTransaction(`people-cv:${session.agencyId}:${application.id}`, () => {
        const current = getPeopleApplication(session.agencyId, application.id);
        if (!current || current.cv.contentTrust?.quarantineStatus === "released") return null;
        return {
          storageProvider: current.cv.storageProvider,
          storageKey: current.cv.storageKey,
          contentType: current.cv.contentType,
          digest: current.cv.contentTrust?.digest ?? "",
          objectVersion: current.cv.contentTrust?.objectVersion ?? "",
          quarantineStatus: current.cv.contentTrust?.quarantineStatus ?? "quarantined",
        };
      });
      if (!snapshot) return { kind: "stale" as const };
      const stored = await readPrivateUpload({
        storageProvider: snapshot.storageProvider,
        storageKey: snapshot.storageKey,
        localDirectory: "people-cvs",
      });
      if (!stored) return { kind: "missing" as const };

      // Hashing the private Blob is local/provider-read work, not scanner cost.
      // Persist the exact provider-call reservation under the agency-wide
      // budget lock before the file can leave through AV/CDR transport.
      const admittedDigest = await digestBlob(stored);
      const admittedVersion = contentTrustObjectVersion(snapshot.storageProvider, snapshot.storageKey, admittedDigest);
      const durableBudget = await withPortalStateTransaction(`people-cv-budget:${session.agencyId}`, () =>
        reservePeopleCvScanBudget({
          agencyId: session.agencyId,
          userId: session.userId,
          applicationId: application.id,
          storageProvider: snapshot.storageProvider,
          storageKey: snapshot.storageKey,
          scanId,
          objectVersion: admittedVersion,
          digest: admittedDigest,
        }));
      if (!durableBudget.allowed) {
        return durableBudget.reason === "rate"
          ? { kind: "rate" as const, retryAfterSec: durableBudget.retryAfterSec }
          : { kind: "stale" as const };
      }

      const assessment = await assessUploadContent({
        file: stored,
        declaredType: snapshot.contentType,
        purpose: "careers.cv-rescan",
        tenantId: session.agencyId,
        actor: session.userId,
      });
      const digestChanged = Boolean(snapshot.digest) && snapshot.digest !== assessment.digest;
      const scanInputChanged = admittedDigest !== assessment.digest;
      const released = !digestChanged
        && !scanInputChanged
        && assessment.verdict !== "blocked"
        && assessment.scannerVerdict === "clean";
      const version = contentTrustObjectVersion(snapshot.storageProvider, snapshot.storageKey, assessment.digest);
      const at = Date.now();

      // Re-read the exact owner tuple and publish trust + audit in one durable
      // transaction. A commit failure rolls the process cache back to the
      // pre-scan quarantined record; no scanner-clean state was visible early.
      const updated = await withPortalStateTransaction(`people-cv:${session.agencyId}:${application.id}`, () => {
        const current = getPeopleApplication(session.agencyId, application.id);
        if (!current || !sameStoredCv(current, snapshot)) return null;
        return setPeopleApplicationCvTrust({
          agencyId: session.agencyId,
          applicationId: current.id,
          contentTrust: {
            digest: assessment.digest,
            objectVersion: version,
            signatureVerdict: assessment.verdict,
            ...(assessment.sniffedType ? { sniffedType: assessment.sniffedType } : {}),
            scannerVerdict: assessment.scannerVerdict,
            quarantineStatus: released ? "released" : "quarantined",
            assessedAt: at,
          },
          audit: {
            scanId,
            event: "rescan",
            actorRef,
            objectVersion: version,
            digest: assessment.digest,
            signatureVerdict: assessment.verdict,
            scannerVerdict: assessment.scannerVerdict,
            quarantineStatus: released ? "released" : "quarantined",
            at,
          },
        });
      });
      if (!updated) return { kind: "stale" as const };
      return { kind: "assessed" as const, updated, assessment, released, digestChanged: digestChanged || scanInputChanged, scanId, objectVersion: version };
    });
    if (result.kind === "stale") {
      return NextResponse.json({ ok: false, code: "cv_changed", error: "The CV changed while it was being checked. It remains quarantined." }, { status: 409 });
    }
    if (result.kind === "missing") {
      return NextResponse.json({ ok: false, error: "CV file not found." }, { status: 404 });
    }
    if (result.kind === "rate") {
      return NextResponse.json(
        { ok: false, code: "rescan_rate_limited", error: "Too many security scans. Please try again later." },
        { status: 429, headers: { "retry-after": String(result.retryAfterSec), "cache-control": "private, no-store" } },
      );
    }
    const { updated, assessment, released, digestChanged, scanId: completedScanId, objectVersion: version } = result;
    recordSecurityEvent({
      kind: released ? "content-trust.cv-released" : "content-trust.cv-quarantined",
      severity: released ? "info" : assessment.scannerVerdict === "malicious" || digestChanged ? "critical" : "warning",
      tenantId: session.agencyId,
      actor: session.userId,
      detail: { applicationId: application.id, scanId: completedScanId, objectVersion: version, digest: assessment.digest, scannerVerdict: assessment.scannerVerdict },
    });
    if (!updated || !released) {
      return NextResponse.json(
        {
          ok: false,
          code: digestChanged ? "cv_integrity_mismatch" : assessment.scannerVerdict === "malicious" ? "cv_blocked" : "scanner_unavailable",
          error: digestChanged
            ? "The stored CV changed after upload. It remains quarantined."
            : assessment.scannerVerdict === "malicious"
            ? "The scanner blocked this CV. It remains quarantined."
            : "The security scan could not complete. This CV remains quarantined.",
        },
        { status: digestChanged || assessment.scannerVerdict === "malicious" ? 422 : 503, headers: { "cache-control": "private, no-store" } },
      );
    }
    return NextResponse.json({ ok: true, applicationId: updated.id, quarantineStatus: "released" });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}
