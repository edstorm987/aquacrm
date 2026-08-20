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

export interface DecodedDataUrl {
  contentType: string;
  bytes: Buffer;
}

// Parse `data:<mime>[;base64],<payload>`. Returns null for non-data inputs.
export function parseDataUrl(dataUrl: string): DecodedDataUrl | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { contentType, bytes };
}

// Content-addressed object key: identical bytes → identical key → a stable
// public URL across re-publishes (paired with the helper's `upsert:true`).
export function publicMediaKey(input: {
  agencyId: string;
  clientId?: string;
  siteId?: string;
  contentType: string;
  bytes: Buffer;
}): string {
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
    if (!decoded) throw new Error("publicMedia.store expects a data: URL");
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
    });
    return { publicUrl: stored.publicUrl, storageKey: stored.storageKey };
  },
};
