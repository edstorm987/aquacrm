import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertLiveProviderAccess } from "@/lib/server/sandbox/providerPolicy";

// Public media storage — the mirror of `privateUploadStorage.ts` for the
// `aquacrm-public` bucket. The critical difference: private uploads store a
// key and the app proxies the bytes back through itself (never a public URL);
// public uploads return a durable, CDN-served `publicUrl` (`getPublicUrl`) so
// approved website media renders straight off Supabase's CDN with no proxy.
//
// Provider precedence is deliberately simpler than the private helper's
// (Supabase → throw-in-prod → local-dev). There is no `vercel-blob` middle
// tier: `NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET` is prod-required in `env.ts`, so
// in production Supabase is always the target. See
// docs/development/plans/public-bucket.md (Phase 1).

export type PublicUploadStorageProvider = "supabase" | "local";

const DEFAULT_SUPABASE_PUBLIC_BUCKET = "aquacrm-public";

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

// Defence in depth at the storage boundary (audit: docs/development/audits.md
// § public upload storage). Public media is served straight off a CDN origin
// with no proxy, so whatever lands here is fetchable as-is at a top-level URL
// — it must be *inert*. The allow-list is raster image + video only:
//   · `image/svg+xml` is rejected — an SVG can carry `<script>` and executes
//     when navigated to directly (same reason `avatarDataUrl.ts` rejects it).
//   · `text/html` and everything else is rejected by omission.
// The uploader is a trusted agency user, but the boundary must not depend on
// that: "approved website media" should never be able to be executable.
export const ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
] as const;

export type AllowedPublicUploadContentType = (typeof ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES)[number];

export class PublicUploadContentTypeError extends Error {
  readonly code = "public_upload_content_type_not_allowed";

  constructor(readonly contentType: string) {
    super(`Content type "${contentType}" is not allowed for public website media. Allowed: ${ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES.join(", ")}.`);
    this.name = "PublicUploadContentTypeError";
  }
}

export class PublicUploadPathError extends Error {
  readonly code = "public_upload_path_escape";

  constructor(readonly attemptedPath: string) {
    super("Refusing to write public media outside public/uploads-public/.");
    this.name = "PublicUploadPathError";
  }
}

// Strip any parameters (`image/png; charset=utf-8`) and case before matching,
// so a decorated header can't smuggle a type past the list. The normalised
// value is what gets stored — never the caller's verbatim string.
export function normalizePublicUploadContentType(contentType: string): string {
  return contentType.split(";")[0]!.trim().toLowerCase();
}

export function publicUploadContentTypeAllowed(contentType: string): contentType is AllowedPublicUploadContentType {
  return (ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES as readonly string[])
    .includes(normalizePublicUploadContentType(contentType));
}

export interface StorePublicUploadInput {
  pathname: string;
  file: Blob;
  contentType: string;
  localDirectory: string;
  localKey: string;
}

export interface StoredPublicUpload {
  storageProvider: PublicUploadStorageProvider;
  storageKey: string;
  /** The durable, CDN-served public URL — the whole point of the public bucket. */
  publicUrl: string;
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

function resolvePublicBucket(env: NodeJS.ProcessEnv = process.env): string {
  return env.NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET?.trim() || DEFAULT_SUPABASE_PUBLIC_BUCKET;
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
  // Allow-list BEFORE any branch, so Supabase and local-dev share one gate.
  if (!publicUploadContentTypeAllowed(input.contentType)) {
    throw new PublicUploadContentTypeError(input.contentType);
  }
  const contentType = normalizePublicUploadContentType(input.contentType);

  if (supabasePublicUploadsConfigured(env)) {
    const bucket = resolvePublicBucket(env);
    const admin = createSupabaseAdminClient();
    // `upsert: true` (private uses `false`): re-publishing an updated asset to
    // the same namespaced path must keep the same public URL, so the CDN link
    // on a live site stays stable across re-publishes.
    const { error } = await admin.storage.from(bucket).upload(input.pathname, input.file, {
      cacheControl: "3600",
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`Could not store public upload: ${error.message}`);
    const { data } = admin.storage.from(bucket).getPublicUrl(input.pathname);
    return { storageProvider: "supabase", storageKey: input.pathname, publicUrl: data.publicUrl };
  }

  if (durablePublicUploadsRequired(env)) throw new PublicUploadStorageError();

  // Local-dev fallback: write under `public/` so Next serves it directly at
  // the returned URL — no proxy route required.
  //
  // The caller's `localDirectory`/`localKey` are resolved and then checked to
  // still sit inside `public/uploads-public/`, so a traversal (`../`, or an
  // absolute key) can never escape the media root. The one real caller passes
  // safe values today; this makes the boundary self-defending for the next one.
  const publicRoot = resolve(process.cwd(), "public", LOCAL_PUBLIC_DIR);
  const absolutePath = resolve(publicRoot, input.localDirectory, input.localKey);
  if (!absolutePath.startsWith(publicRoot + sep)) {
    throw new PublicUploadPathError(absolutePath);
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(await input.file.arrayBuffer()));
  // Derive the URL from the path actually written, so URL and disk can't drift.
  const relativeUrlPath = `${LOCAL_PUBLIC_DIR}/${relative(publicRoot, absolutePath).split(sep).join("/")}`;
  return { storageProvider: "local", storageKey: input.localKey, publicUrl: `/${relativeUrlPath}` };
}

// Remove a published asset from the public bucket (for unpublish / erasure of
// public media). Mirrors `deleteSupabasePrivateUpload`. There is deliberately
// no public *read* helper: public media is fetched via its `publicUrl`, never
// proxied back through the app.
export async function deleteSupabasePublicUpload(storageKey: string): Promise<boolean> {
  assertLiveProviderAccess("Public media deletion");
  if (!supabasePublicUploadsConfigured() || !storageKey.trim()) return false;
  const bucket = resolvePublicBucket();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(bucket).remove([storageKey]);
  return !error;
}
