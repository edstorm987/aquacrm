import "server-only";

// Public media adapter — the concrete `PublicMediaPort` (see `_types.ts`).
// Decodes a data: URI, gives it a content-addressed key so identical bytes
// re-publish to a stable public URL, and hands it to the public-bucket
// storage boundary (`lib/server/publicUploadStorage`). This is the app-side
// bridge that lets the sandboxed website-editor plugin publish approved media
// to `aquacrm-public`. See docs/development/plans/public-bucket.md (Phase 2).

import { createHash } from "node:crypto";

import { storePublicUpload } from "@/lib/server/publicUploadStorage";
import type {
  PublicMediaPort,
  PublicMediaStoreInput,
  StoredPublicMedia,
} from "@/built-ins/runtime/_types";

// Extension per mime, for the content-addressed key. Deliberately mirrors
// `ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES` in `publicUploadStorage.ts` — anything
// off that list is rejected at the storage boundary, so mapping it here would
// only name a file that can never be written. `image/svg+xml` is absent for
// that reason (an SVG can carry script; public media must be inert).
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const MEDIA_DIR = "website-media";
export const MAX_PUBLIC_MEDIA_BYTES = 8 * 1024 * 1024;

export class PublicMediaDataUrlError extends Error {
  readonly code = "public_media_data_url_invalid";

  constructor(readonly reason: "invalid" | "empty" | "too-large") {
    super(
      reason === "too-large"
        ? "Public website media must be 8 MiB or smaller."
        : "Public website media must be a non-empty base64 data URL.",
    );
    this.name = "PublicMediaDataUrlError";
  }
}

export class PublicMediaIdentityError extends Error {
  readonly code = "public_media_identity_invalid";

  constructor(readonly field: "agencyId" | "clientId" | "siteId") {
    super(`Public media ${field} is not a safe storage-path identifier.`);
    this.name = "PublicMediaIdentityError";
  }
}

const SAFE_PUBLIC_MEDIA_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertSafePublicMediaIdentifier(
  field: "agencyId" | "clientId" | "siteId",
  value: string | undefined,
  required: boolean,
): void {
  if (value === undefined && !required) return;
  if (!value || !SAFE_PUBLIC_MEDIA_IDENTIFIER.test(value)) {
    throw new PublicMediaIdentityError(field);
  }
}

export interface DecodedDataUrl {
  contentType: string;
  bytes: Buffer;
}

// Parse `data:<mime>;base64,<payload>` with a hard decoded-size bound BEFORE
// allocating the byte buffer. The editor's asset contract is 8 MiB; enforcing
// the same invariant here covers legacy/direct page PATCHes that bypass the
// asset handler. Returns null for malformed/non-data inputs.
export function parseDataUrl(
  dataUrl: string,
  maxBytes = MAX_PUBLIC_MEDIA_BYTES,
): DecodedDataUrl | null {
  const maxEncodedChars = Math.ceil(maxBytes * 4 / 3) + 1_024;
  if (dataUrl.length > maxEncodedChars) {
    throw new PublicMediaDataUrlError("too-large");
  }
  const canonical = dataUrl
    .replace(/^[\u0000-\u0020]+/, "")
    .replace(/[\u0009\u000a\u000d]/g, "");
  // Bound the encoded representation too. This avoids copying an arbitrarily
  // large attacker-controlled string merely to discover it decodes over cap.
  if (canonical.length > maxEncodedChars) {
    throw new PublicMediaDataUrlError("too-large");
  }
  const match = /^data:([^;,]{1,128});base64,([\s\S]*)$/i.exec(canonical);
  if (!match) return null;
  const contentType = match[1]!.trim().toLowerCase();
  const payload = (match[2] ?? "").replace(/[\u0009-\u000d\u0020]/g, "");
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) {
    return null;
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if (padding > 0 && payload.length % 4 !== 0) return null;
  const expectedBytes = Math.floor(payload.length * 3 / 4) - padding;
  if (expectedBytes <= 0) throw new PublicMediaDataUrlError("empty");
  if (expectedBytes > maxBytes) throw new PublicMediaDataUrlError("too-large");
  const bytes = Buffer.from(payload, "base64");
  if (bytes.byteLength !== expectedBytes) return null;
  return { contentType, bytes };
}

// Legacy-compatible content-addressed key used by local development. Remote
// publication is hard-disabled: shared keys plus upsert cannot prove which
// operation owns a public object or recall it safely. The durable lifecycle must
// replace this with operation-owned immutable identity before remote enablement.
export function publicMediaKey(input: {
  agencyId: string;
  clientId?: string;
  siteId?: string;
  contentType: string;
  bytes: Buffer;
}): string {
  // These values become URL path segments on a service-role Supabase write.
  // Permit only the identifier alphabet used by AquaCRM's generated IDs. Raw
  // concatenation of slash, backslash, percent, dot-segment, query or fragment
  // characters would otherwise be normalized by a downstream URL layer after
  // the tenant-prefix check and could escape the authenticated namespace.
  assertSafePublicMediaIdentifier("agencyId", input.agencyId, true);
  assertSafePublicMediaIdentifier("clientId", input.clientId, false);
  assertSafePublicMediaIdentifier("siteId", input.siteId, false);
  const hash = createHash("sha256").update(input.bytes).digest("hex").slice(0, 32);
  const ext = EXT_BY_MIME[input.contentType.toLowerCase()] ?? "bin";
  return [
    MEDIA_DIR,
    input.agencyId,
    input.clientId ?? "_",
    input.siteId ?? "_",
    `${hash}.${ext}`,
  ].join("/");
}

export const publicMediaAdapter: PublicMediaPort = {
  async store(input: PublicMediaStoreInput): Promise<StoredPublicMedia> {
    const decoded = parseDataUrl(input.dataUrl);
    if (!decoded) throw new PublicMediaDataUrlError("invalid");
    const pathname = publicMediaKey({
      agencyId: input.agencyId,
      clientId: input.clientId,
      siteId: input.siteId,
      contentType: decoded.contentType,
      bytes: decoded.bytes,
    });
    // localKey drops the leading MEDIA_DIR segment so the local-dev tree is
    // `public/uploads-public/website-media/…` (matches the Supabase key).
    const localKey = pathname.slice(MEDIA_DIR.length + 1);
    const stored = await storePublicUpload({
      pathname,
      file: new Blob([Uint8Array.from(decoded.bytes)], { type: decoded.contentType }),
      contentType: decoded.contentType,
      localDirectory: MEDIA_DIR,
      localKey,
      trust: {
        tenantId: input.agencyId,
        clientId: input.clientId,
        siteId: input.siteId,
        actor: input.actor,
        purpose: "website-editor.public-media.publish",
      },
    });
    return { publicUrl: stored.publicUrl, storageKey: stored.storageKey };
  },
};
