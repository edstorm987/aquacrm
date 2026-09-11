import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";
import { assertFreshWritesAllowed } from "@/lib/server/auth/securityControl";
import {
  assessUploadContent,
  type ContentTrustAssessment,
} from "@/lib/server/security/contentTrust";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";
import {
  ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES,
  MAX_PUBLIC_MEDIA_BYTES,
  normalizePublicUploadContentType,
  publicUploadContentTypeAllowed,
  type AllowedPublicUploadContentType,
} from "@/lib/shared/publicMediaLimits";

export {
  ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES,
  normalizePublicUploadContentType,
  publicUploadContentTypeAllowed,
};
export type { AllowedPublicUploadContentType };

// Public media storage boundary. Local development can materialise inspected
// media beneath Next's public/ tree. Remote Supabase/CDN writes are deliberately
// unavailable: the current page-publish flow cannot atomically bind an object
// to its page generation or prove exclusive ownership during recall. Keeping
// that provider implementation out of this module means a future refactor
// cannot accidentally bypass the release-blocking lifecycle error by moving a
// conditional. See docs/development/plans/public-bucket.md.

export type PublicUploadStorageProvider = "supabase" | "local";

export const MAX_PUBLIC_UPLOAD_BYTES = MAX_PUBLIC_MEDIA_BYTES;

// Local-dev only. Approved public media is written under Next's `public/`
// directory — the same home as the published site folders (milesymedia,
// aquacrm-site, …) — so it serves at a real URL (`/uploads-public/...`) with
// no proxy and zero extra wiring. The durable branch throws before this runs
// in production, so nothing is ever written here outside local development.
const LOCAL_PUBLIC_DIR = "uploads-public";

export class PublicUploadStorageError extends Error {
  readonly code = "durable_public_uploads_required";

  constructor() {
    super("Public media storage is not connected. Connect the Supabase public media bucket (aquacrm-public) before publishing website media.");
    this.name = "PublicUploadStorageError";
  }
}

/**
 * A transient provider failure raised only after the bytes passed the content
 * policy. Publication still fails closed: provider availability is not allowed
 * to select an inline-media bypass path.
 */
export class PublicUploadProviderError extends Error {
  readonly code = "public_upload_provider_failed";

  constructor(readonly provider: PublicUploadStorageProvider) {
    super("Public media could not be stored by the configured provider.");
    this.name = "PublicUploadProviderError";
  }
}

/**
 * New public-CDN objects cannot be made production-safe by the storage helper
 * alone. Website publication currently uploads objects before it commits the
 * page, uses shared content-addressed keys, and has no durable ownership/
 * reference ledger. A later page-write failure can therefore leave public
 * bytes behind, while a compensating delete could remove an object already in
 * use by another page. Keep the remote branch disabled until the publication
 * saga can prove plan/commit/recall ownership end to end.
 */
export class PublicUploadAtomicLifecycleError extends Error {
  readonly code = "public_upload_atomic_lifecycle_required";

  constructor() {
    super("Public media publication is disabled until its durable atomic publication and recall lifecycle is available.");
    this.name = "PublicUploadAtomicLifecycleError";
  }
}

/**
 * A legacy public object cannot be deleted safely from a content-addressed key
 * until a durable reference/ownership ledger proves no other live page uses it.
 * The exported compatibility helper below therefore refuses every deletion;
 * incident responders must use the owner-approved provider procedure after an
 * independent reference inventory and durable evidence checkpoint.
 */
export class PublicUploadOwnershipProofError extends Error {
  readonly code = "public_upload_ownership_proof_required";

  constructor() {
    super("Public media deletion is disabled until exclusive ownership and reference safety are proven.");
    this.name = "PublicUploadOwnershipProofError";
  }
}

// Defence in depth at the storage boundary (audit: docs/development/audits.md
// § public upload storage). Public media is served straight off a CDN origin
// with no proxy, so whatever lands here is fetchable as-is at a top-level URL
// — it must be *inert*. The allow-list is raster image + video only:
//   · `image/svg+xml` is rejected — an SVG can carry `<script>` and executes
//     when navigated to directly (same reason `avatarDataUrl.ts` rejects it).
//   · `text/html` and everything else is rejected by omission.
// The uploader is a trusted agency user, but the boundary must not depend on
// that: "approved website media" should never be able to be executable.
export class PublicUploadContentTypeError extends Error {
  readonly code = "public_upload_content_type_not_allowed";

  constructor(readonly contentType: string) {
    super(`Content type "${contentType}" is not allowed for public website media. Allowed: ${ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES.join(", ")}.`);
    this.name = "PublicUploadContentTypeError";
  }
}

export class PublicUploadSizeError extends Error {
  readonly code = "public_upload_size_not_allowed";

  constructor(readonly sizeBytes: number) {
    super(`Public website media must be non-empty and no larger than ${MAX_PUBLIC_UPLOAD_BYTES} bytes.`);
    this.name = "PublicUploadSizeError";
  }
}

export type PublicUploadTrustFailureReason =
  | "blocked"
  | "quarantined"
  | "malware-scan-required"
  | "byte-verification-required";

/**
 * Public objects are served directly by a CDN, so there is no later response
 * boundary at which the portal can correct a bad content type or contain a
 * malicious object. This error is raised before provider I/O whenever the
 * byte-level verdict is not strong enough for the destination.
 */
export class PublicUploadContentTrustError extends Error {
  readonly code = "public_upload_content_not_cleared";

  constructor(
    readonly assessment: ContentTrustAssessment,
    readonly reason: PublicUploadTrustFailureReason,
  ) {
    super(
      reason === "malware-scan-required"
        ? "Public media was not stored because a malware scanner has not cleared it."
        : "Public media was not stored because its bytes did not pass the public-content trust policy.",
    );
    this.name = "PublicUploadContentTrustError";
  }
}

export class PublicUploadPathError extends Error {
  readonly code = "public_upload_path_escape";

  constructor(readonly attemptedPath: string) {
    super("Refusing to write public media outside public/uploads-public/.");
    this.name = "PublicUploadPathError";
  }
}

export class PublicUploadTenantScopeError extends Error {
  readonly code = "public_upload_tenant_scope_mismatch";

  constructor() {
    super("Refusing a public-media operation outside the authenticated tenant namespace.");
    this.name = "PublicUploadTenantScopeError";
  }
}

export interface StorePublicUploadInput {
  pathname: string;
  file: Blob;
  contentType: string;
  /** Required, secret-free lineage for containment and incident evidence. */
  trust: {
    tenantId: string;
    clientId?: string;
    siteId?: string;
    actor?: string;
    purpose: string;
  };
}

export interface StoredPublicUpload {
  storageProvider: PublicUploadStorageProvider;
  storageKey: string;
  /** A browser-servable URL. The remote durable provider is currently blocked. */
  publicUrl: string;
  /** The exact byte-level judgement that authorised this public write. */
  contentTrust: Pick<ContentTrustAssessment, "verdict" | "digest" | "sniffedType">;
}

export function supabasePublicUploadsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && (env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  );
}

export function durablePublicUploadsRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production"
    || env.VERCEL === "1"
    || Boolean(env.VERCEL_ENV);
}

const SAFE_PUBLIC_PATH_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const SAFE_TENANT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertTenantScopedPublicPath(pathname: string, tenantId: string): void {
  // Compare canonical segments, not a raw prefix. URL clients normalize slash,
  // backslash, percent-encoded separators and dot segments after a naive
  // startsWith check; service-role storage writes must reject those spellings
  // before the SDK ever constructs a request URL.
  if (!SAFE_TENANT_SEGMENT.test(tenantId)) throw new PublicUploadTenantScopeError();
  if (pathname.includes("\\") || pathname.includes("%") || /[?#\u0000-\u001f\u007f]/.test(pathname)) {
    throw new PublicUploadTenantScopeError();
  }
  const segments = pathname.split("/");
  if (
    segments.length < 3
    || segments[0] !== "website-media"
    || segments[1] !== tenantId
    || segments.some(segment => !SAFE_PUBLIC_PATH_SEGMENT.test(segment) || segment === "." || segment === "..")
  ) {
    throw new PublicUploadTenantScopeError();
  }
}

async function assertPublicUploadWritesAllowed(input: StorePublicUploadInput): Promise<void> {
  await assertFreshWritesAllowed("storage.public-upload", {
    tenantId: input.trust.tenantId,
    actor: input.trust.actor,
  });
}

function recordPublicUploadStored(
  input: StorePublicUploadInput,
  assessment: ContentTrustAssessment,
  provider: PublicUploadStorageProvider,
): void {
  recordSecurityEvent({
    kind: "content-trust.public-upload-stored",
    severity: "info",
    tenantId: input.trust.tenantId,
    actor: input.trust.actor,
    detail: {
      digest: assessment.digest,
      // "key" is intentionally avoided in the event field name because the
      // generic secret redactor treats every *key* as credential-shaped. This
      // canonical bucket-relative path is required for object recall/erasure.
      objectPath: input.pathname,
      sizeBytes: assessment.sizeBytes,
      declaredType: assessment.declaredType,
      sniffedType: assessment.sniffedType,
      verdict: assessment.verdict,
      provider,
      clientId: input.trust.clientId,
      siteId: input.trust.siteId,
      purpose: input.trust.purpose,
    },
  });
}

/**
 * Decide whether an assessment is strong enough for public delivery.
 *
 * - A world-readable Supabase/CDN object requires a real malware-clear verdict.
 * - Local-only development may use a matching byte signature, but never an
 *   unverified, quarantined or blocked object.
 */
export function publicUploadTrustFailure(
  assessment: ContentTrustAssessment,
  requireMalwareClearance: boolean,
): PublicUploadTrustFailureReason | null {
  if (assessment.verdict === "blocked") return "blocked";
  if (assessment.verdict === "quarantined") return "quarantined";
  if (assessment.verdict === "malware-cleared") return null;
  if (requireMalwareClearance) return "malware-scan-required";
  if (assessment.verdict !== "type-verified") return "byte-verification-required";
  return null;
}

// `env` is injectable (defaults to `process.env`) purely so the smoke can
// drive each branch hermetically — the shared-process test runner runs files
// concurrently, so mutating global `process.env` would race into other tests.
// Real callers pass nothing and read the live environment.
export async function storePublicUpload(
  input: StorePublicUploadInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredPublicUpload> {
  assertLiveProviderAccess("Public media storage");
  // Phase 2 write boundary: an incident write-freeze must stop public-media
  // ingestion too (a write path mutate() never sees).
  await assertPublicUploadWritesAllowed(input);
  // Allow-list BEFORE any branch, so Supabase and local-dev share one gate.
  if (!publicUploadContentTypeAllowed(input.contentType)) {
    throw new PublicUploadContentTypeError(input.contentType);
  }
  const contentType = normalizePublicUploadContentType(input.contentType);
  if (input.file.size <= 0 || input.file.size > MAX_PUBLIC_UPLOAD_BYTES) {
    throw new PublicUploadSizeError(input.file.size);
  }
  assertTenantScopedPublicPath(input.pathname, input.trust.tenantId);
  const supabaseConfigured = supabasePublicUploadsConfigured(env);

  // Preserve the durable-storage failure as the first production error. There
  // is no reason to scan bytes that cannot be stored safely, and this keeps the
  // provider-configuration fault distinct from a content rejection.
  if (!supabaseConfigured && durablePublicUploadsRequired(env)) {
    throw new PublicUploadStorageError();
  }

  // RELEASE BLOCKER: do not let a configured remote bucket turn the existing
  // upload-before-page-commit flow into a world-readable orphan. This is not an
  // environment-toggle gate: no deployment setting can assert the missing
  // durable intent/ownership/refcount/recall protocol into existence. Local
  // development remains available below so the editor can still be exercised.
  if (supabaseConfigured) {
    recordSecurityEvent({
      kind: "public-media.lifecycle-blocked",
      severity: "critical",
      tenantId: input.trust.tenantId,
      actor: input.trust.actor,
      detail: {
        objectPath: input.pathname,
        sizeBytes: input.file.size,
        declaredType: contentType,
        clientId: input.trust.clientId,
        siteId: input.trust.siteId,
        purpose: input.trust.purpose,
        reason: "atomic-lifecycle-required",
      },
    });
    throw new PublicUploadAtomicLifecycleError();
  }

  // CONTENT TRUST GATEWAY: a Blob is immutable, so the exact bytes assessed
  // here are the bytes passed to the provider below. No public storage I/O may
  // occur before this verdict. A real CDN destination always requires the
  // configured AV/CDR adapter to clear the full object; a signature match alone
  // is permitted only for the local-development filesystem.
  const assessment = await assessUploadContent({
    file: input.file,
    declaredType: contentType,
    purpose: input.trust.purpose,
    tenantId: input.trust.tenantId,
    actor: input.trust.actor,
  });
  const trustFailure = publicUploadTrustFailure(assessment, supabaseConfigured);
  if (trustFailure) {
    recordSecurityEvent({
      kind: "content-trust.public-upload-refused",
      severity: supabaseConfigured ? "critical" : "warning",
      tenantId: input.trust.tenantId,
      actor: input.trust.actor,
      detail: {
        reason: trustFailure,
        verdict: assessment.verdict,
        scannerStatus: assessment.scannerStatus,
        digest: assessment.digest,
        sizeBytes: assessment.sizeBytes,
        declaredType: assessment.declaredType,
        purpose: input.trust.purpose,
      },
    });
    throw new PublicUploadContentTrustError(assessment, trustFailure);
  }
  const contentTrust = {
    verdict: assessment.verdict,
    digest: assessment.digest,
    sniffedType: assessment.sniffedType,
  };

  // Local-dev fallback: write under `public/` so Next serves it directly at
  // the returned URL — no proxy route required.
  //
  // `pathname` has already passed the canonical segment + tenant check above.
  // It is the sole storage coordinate: accepting a second caller-controlled
  // local path would let the URL/tenant proof describe one object while disk
  // materialised another.
  const publicRoot = resolve(process.cwd(), "public", LOCAL_PUBLIC_DIR);
  const absolutePath = resolve(publicRoot, input.pathname);
  if (!absolutePath.startsWith(publicRoot + sep)) {
    throw new PublicUploadPathError(absolutePath);
  }
  // Same scan-time lockdown re-check for the local development provider. Keep
  // it outside the provider catch for the same fail-closed classification.
  await assertPublicUploadWritesAllowed(input);
  try {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));
  } catch {
    throw new PublicUploadProviderError("local");
  }
  // URL, storage identity, and the disk destination all derive from the same
  // already-validated canonical pathname.
  recordPublicUploadStored(input, assessment, "local");
  return {
    storageProvider: "local",
    storageKey: input.pathname,
    publicUrl: `/${LOCAL_PUBLIC_DIR}/${input.pathname}`,
    contentTrust,
  };
}

// Compatibility boundary for older call sites. It intentionally has no
// provider implementation: content-addressed legacy keys can be shared across
// pages, and neither the key nor caller input proves exclusive ownership. Keep
// the containment and namespace checks ahead of the explicit refusal so an
// incident freeze remains the first authority and cross-tenant attempts remain
// distinguishable in tests and telemetry.
export async function deleteSupabasePublicUpload(input: {
  storageKey: string;
  tenantId: string;
  actor?: string;
}): Promise<boolean> {
  assertLiveProviderAccess("Public media deletion");
  // Global and tenant-scoped containment both bind deletion. Require lineage
  // even though this currently has no production caller, so the future caller
  // cannot silently reopen a service-role cross-tenant path.
  await assertFreshWritesAllowed("storage.public-delete", {
    tenantId: input.tenantId,
    actor: input.actor,
  });
  if (!input.storageKey.trim()) return false;
  assertTenantScopedPublicPath(input.storageKey, input.tenantId);
  recordSecurityEvent({
    kind: "public-media.delete-blocked",
    severity: "critical",
    tenantId: input.tenantId,
    actor: input.actor,
    detail: {
      objectPath: input.storageKey,
      reason: "ownership-proof-required",
    },
  });
  throw new PublicUploadOwnershipProofError();
}
