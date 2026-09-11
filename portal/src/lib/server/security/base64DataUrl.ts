/**
 * One bounded, canonical parser for server-side base64 data URLs.
 *
 * Keep this module free of `server-only`: the website-editor smoke tests load
 * the same function directly. Callers still use it only at trusted server
 * boundaries before persistence or publication.
 */

import { MAX_PUBLIC_MEDIA_BYTES } from "@/lib/shared/publicMediaLimits";

// The configured AV adapter travels through the audited outbound broker whose
// existing request-body ceiling is 1 MiB. Public/editor media must not advertise
// a larger supported payload until an owner-reviewed streaming scanner exists.
export { MAX_PUBLIC_MEDIA_BYTES };

export class PublicMediaDataUrlError extends Error {
  readonly code = "public_media_data_url_invalid";

  constructor(readonly reason: "invalid" | "empty" | "too-large") {
    super(
      reason === "too-large"
        ? "Public website media must be 1 MiB or smaller."
        : "Public website media must be a non-empty canonical base64 data URL.",
    );
    this.name = "PublicMediaDataUrlError";
  }
}

export interface DecodedDataUrl {
  contentType: string;
  bytes: Buffer;
  /** Canonical representation of the exact decoded bytes. */
  dataUrl: string;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString("latin1");
}

/** Byte identity for the deliberately small inert public-media allow-list. */
export function sniffPublicMediaContentType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (bytes.byteLength >= 16 && ascii(bytes, 4, 4) === "ftyp") {
    const brands: string[] = [ascii(bytes, 8, 4)];
    const declaredBoxSize = (
      ((bytes[0] ?? 0) << 24)
      | ((bytes[1] ?? 0) << 16)
      | ((bytes[2] ?? 0) << 8)
      | (bytes[3] ?? 0)
    ) >>> 0;
    const end = declaredBoxSize >= 16
      ? Math.min(bytes.byteLength, declaredBoxSize, 512)
      : Math.min(bytes.byteLength, 512);
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(bytes, offset, 4));
    return brands.some(brand => brand === "avif" || brand === "avis")
      ? "image/avif"
      : "video/mp4";
  }
  return null;
}

const MIME_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/i;

/**
 * Parse `data:<mime>;base64,<payload>` without accepting alternate spellings
 * that different decoders interpret differently. The encoded representation
 * is bounded before any payload copy or byte allocation.
 */
export function parseDataUrl(
  dataUrl: string,
  maxBytes = MAX_PUBLIC_MEDIA_BYTES,
): DecodedDataUrl | null {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new PublicMediaDataUrlError("too-large");
  }

  // Four encoded characters represent at most three bytes. The MIME/header
  // allowance is fixed and tiny, so hostile JSON cannot make this parser copy
  // an unbounded payload merely to discover that it is over quota.
  const maxEncodedChars = Math.ceil(maxBytes / 3) * 4;
  const maxRepresentationChars = maxEncodedChars + 160;
  if (typeof dataUrl !== "string" || dataUrl.length > maxRepresentationChars) {
    throw new PublicMediaDataUrlError("too-large");
  }

  const comma = dataUrl.indexOf(",");
  if (comma < 0 || dataUrl.indexOf(",", comma + 1) >= 0) return null;
  const header = dataUrl.slice(0, comma);
  const headerMatch = /^data:([^;,]+);base64$/i.exec(header);
  if (!headerMatch) return null;
  const contentType = headerMatch[1]!.toLowerCase();
  if (!MIME_TOKEN.test(contentType)) return null;

  const payload = dataUrl.slice(comma + 1);
  if (!payload) throw new PublicMediaDataUrlError("empty");
  if (payload.length > maxEncodedChars) throw new PublicMediaDataUrlError("too-large");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return null;

  const firstPadding = payload.indexOf("=");
  const padding = firstPadding < 0 ? 0 : payload.length - firstPadding;
  const remainder = payload.length % 4;
  // Padding is legal only on a complete quartet. Unpadded RFC 4648 input may
  // end in two or three characters, but a one-character tail is impossible.
  if ((padding > 0 && remainder !== 0) || (padding === 0 && remainder === 1)) return null;
  if ((padding === 1 && payload.length < 4) || (padding === 2 && payload.length < 4)) return null;

  const expectedBytes = Math.floor(payload.length * 3 / 4) - padding;
  if (expectedBytes <= 0) throw new PublicMediaDataUrlError("empty");
  if (expectedBytes > maxBytes) throw new PublicMediaDataUrlError("too-large");

  const bytes = Buffer.from(payload, "base64");
  if (bytes.byteLength !== expectedBytes) return null;

  // Node's decoder is intentionally forgiving. Round-trip comparison rejects
  // non-zero unused bits and every malformed-but-decodable spelling.
  const canonicalPayload = bytes.toString("base64");
  const canonicalUnpadded = canonicalPayload.replace(/=+$/, "");
  const suppliedUnpadded = payload.replace(/=+$/, "");
  if (canonicalUnpadded !== suppliedUnpadded) return null;
  if (padding > 0 && canonicalPayload !== payload) return null;

  return {
    contentType,
    bytes,
    dataUrl: `data:${contentType};base64,${canonicalPayload}`,
  };
}
