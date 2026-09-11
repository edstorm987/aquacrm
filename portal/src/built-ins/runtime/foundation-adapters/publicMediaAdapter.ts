import "server-only";

// Public media adapter — the concrete `PublicMediaPort` (see `_types.ts`).
// Decodes a data: URI, gives it a content-addressed key so identical bytes
// re-publish to a stable public URL, and hands it to the public-bucket
// storage boundary (`lib/server/publicUploadStorage`). This is the app-side
// bridge that lets the sandboxed website-editor plugin publish approved media
// to `aquacrm-public`. See docs/development/plans/public-bucket.md (Phase 2).

import { createHash } from "node:crypto";

import { storePublicUpload } from "@/lib/server/publicUploadStorage";
import {
  MAX_PUBLIC_MEDIA_BYTES,
  PublicMediaDataUrlError,
  parseDataUrl,
  type DecodedDataUrl,
} from "@/lib/server/security/base64DataUrl";
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
export { MAX_PUBLIC_MEDIA_BYTES, PublicMediaDataUrlError, parseDataUrl };
export type { DecodedDataUrl };

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
    const stored = await storePublicUpload({
      pathname,
      file: new Blob([Uint8Array.from(decoded.bytes)], { type: decoded.contentType }),
      contentType: decoded.contentType,
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
