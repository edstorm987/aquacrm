import "server-only";

import { open } from "node:fs/promises";
import { Readable } from "node:stream";

import { get } from "@vercel/blob";

/**
 * The one byte-range contract for private media delivery.
 *
 * Every private audio/video/document route answers through
 * `privateMediaResponse()`, so a mounted `<audio preload="metadata">` gets a
 * real `206 Partial Content` with exact `Content-Range`/`Content-Length`
 * headers instead of the whole object, and an out-of-bounds seek gets a `416`
 * rather than a silently truncated body. Providers that cannot range are never
 * papered over: their stream is sliced on the way through, so the response is
 * still exact even when the upstream ignored the request.
 */

/** Inclusive byte offsets, exactly as an HTTP `Content-Range` reports them. */
export interface ByteRange {
  start: number;
  end: number;
}

export type ByteRangeRequest =
  | { kind: "full" }
  | { kind: "partial"; range: ByteRange }
  | { kind: "unsatisfiable" };

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Parses a single `bytes=` range against a known size.
 *
 * A header this function cannot honour exactly is ignored (`full`) rather than
 * guessed at — RFC 9110 permits ignoring a Range, and answering `200` with the
 * whole object is always truthful. Only a well-formed range that lands outside
 * the object is `unsatisfiable`, which the caller must answer with `416`.
 */
export function parseByteRange(header: string | null | undefined, size: number | null): ByteRangeRequest {
  const raw = (header ?? "").trim();
  if (!raw) return { kind: "full" };
  // An unknown size cannot be validated, so no range claim can be made.
  if (size === null || !Number.isInteger(size) || size < 0) return { kind: "full" };
  // Multi-range is legal to decline; a `multipart/byteranges` body is never faked.
  if (raw.includes(",")) return { kind: "full" };
  const match = SINGLE_RANGE.exec(raw.replace(/\s+/g, ""));
  if (!match) return { kind: "full" };
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { kind: "full" };

  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }

  const start = Number(rawStart);
  if (!Number.isInteger(start) || start >= size) return { kind: "unsatisfiable" };
  if (!rawEnd) return { kind: "partial", range: { start, end: size - 1 } };
  const end = Number(rawEnd);
  if (!Number.isInteger(end) || end < start) return { kind: "full" };
  return { kind: "partial", range: { start, end: Math.min(end, size - 1) } };
}

export function formatRangeHeader(range: ByteRange): string {
  return `bytes=${range.start}-${range.end}`;
}

/**
 * Reads the window an upstream actually served from its `Content-Range`.
 *
 * This header — not a status code — is the only reliable partial-response
 * signal from a provider SDK: `@vercel/blob`'s `get()` special-cases 304 and
 * 404 only, so a genuine `206` from the store surfaces as `statusCode: 200`
 * with a body that is already just the range.
 */
export function parseContentRange(header: string | null | undefined): ByteRange | null {
  const match = /^bytes\s+(\d+)-(\d+)\/(?:\d+|\*)$/.exec((header ?? "").trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return Number.isInteger(start) && Number.isInteger(end) && end >= start ? { start, end } : null;
}

/**
 * Emits only `[range.start, range.end]` of an upstream stream, discarding the
 * rest as it passes. Used when a provider ignored the `Range` request: the
 * response stays byte-exact without the whole object ever being buffered.
 */
export function sliceStream(stream: ReadableStream<Uint8Array>, range: ByteRange): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  const wanted = range.end - range.start + 1;
  let offset = 0;
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (sent < wanted) {
        const { done, value } = await reader.read();
        if (done) {
          // The caller has already promised `wanted` bytes in Content-Length, so
          // an upstream that ran out early must fail the transfer rather than
          // close short and let a truncated body pass for a complete one.
          controller.error(new Error(
            `Private media range ${range.start}-${range.end} ended after ${sent} of ${wanted} bytes.`,
          ));
          return;
        }
        const chunkStart = offset;
        offset += value.byteLength;
        if (offset <= range.start) continue;
        const from = Math.max(0, range.start - chunkStart);
        const slice = value.subarray(from, Math.min(value.byteLength, from + (wanted - sent)));
        if (slice.byteLength === 0) continue;
        sent += slice.byteLength;
        controller.enqueue(slice);
        return;
      }
      controller.close();
      await reader.cancel().catch(() => {});
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
    },
  });
}

export interface PrivateMediaRequest {
  /** The request's raw `Range` header, if any. */
  rangeHeader: string | null | undefined;
  /** Total object size, or `null` when this surface does not know it. */
  size: number | null;
  /** Content type/disposition/cache headers for the object. */
  headers: Headers;
  /** Reads exactly the requested slice, or the whole object for `null`. */
  read: (range: ByteRange | null) => Promise<BodyInit | null>;
}

/**
 * Builds the `200`/`206`/`416` response. Returns `null` when the reader could
 * not produce the object, so each route keeps its own 404 shape.
 */
export async function privateMediaResponse(input: PrivateMediaRequest): Promise<Response | null> {
  const size = typeof input.size === "number" && Number.isInteger(input.size) && input.size >= 0 ? input.size : null;
  const headers = new Headers(input.headers);
  // Advertised only when the size is known, because a range cannot be validated
  // without it — claiming `bytes` there would be a promise this route breaks.
  headers.set("accept-ranges", size === null ? "none" : "bytes");
  const parsed = parseByteRange(input.rangeHeader, size);

  if (parsed.kind === "unsatisfiable") {
    headers.set("content-range", `bytes */${size ?? 0}`);
    headers.set("content-length", "0");
    return new Response(null, { status: 416, headers });
  }

  if (parsed.kind === "partial") {
    const body = await input.read(parsed.range);
    if (body === null) return null;
    headers.set("content-range", `bytes ${parsed.range.start}-${parsed.range.end}/${size}`);
    headers.set("content-length", String(parsed.range.end - parsed.range.start + 1));
    return new Response(body, { status: 206, headers });
  }

  const body = await input.read(null);
  if (body === null) return null;
  if (size === null) headers.delete("content-length");
  else headers.set("content-length", String(size));
  return new Response(body, { status: 200, headers });
}

/**
 * Local adapter: opens the file once and streams only the requested slice, so a
 * seek into a large recording never reads the bytes before it.
 */
export async function readLocalFileRange(path: string, range: ByteRange | null): Promise<BodyInit | null> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch {
    return null;
  }
  try {
    const stream = handle.createReadStream(range ? { start: range.start, end: range.end } : {});
    return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
  } catch {
    await handle.close().catch(() => {});
    return null;
  }
}

/** Injectable so the ranged path is exercised for real without a live store. */
export type VercelBlobReader = (
  url: string,
  options: { access: "private"; headers?: HeadersInit },
) => Promise<unknown>;

/**
 * Vercel Blob adapter: forwards the `Range` header to the store and passes the
 * partial stream through. When the store answers `200` anyway the stream is
 * sliced instead of buffered, so the response is still exactly the range.
 */
export async function readVercelBlobRange(
  url: string,
  range: ByteRange | null,
  reader: VercelBlobReader = get as unknown as VercelBlobReader,
): Promise<BodyInit | null> {
  const result = (await reader(url, {
    access: "private",
    ...(range ? { headers: { range: formatRangeHeader(range) } } : {}),
  })) as { statusCode?: number; stream?: ReadableStream<Uint8Array> | null; headers?: Headers } | null;
  const status = result?.statusCode ?? 0;
  const stream = result?.stream ?? null;
  if (!stream || (status !== 200 && status !== 206)) return null;
  if (!range) return stream;
  // `get()` reports a real `206` as `statusCode: 200`, so the status cannot tell
  // a partial body from a whole object; `Content-Range` can, and it is only ever
  // present on a partial one. Re-slicing an already-partial stream would skip
  // past every byte it holds and emit an empty `206`.
  const served = parseContentRange(result?.headers?.get?.("content-range"));
  if (!served) return status === 206 ? stream : sliceStream(stream, range);
  if (served.start !== range.start || served.end !== range.end) {
    // A window we did not ask for cannot be dressed up as the one the response
    // already promised in its own Content-Range/Content-Length.
    await stream.cancel().catch(() => {});
    return null;
  }
  return stream;
}
