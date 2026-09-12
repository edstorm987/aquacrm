export type BoundedRequestBody =
  | { ok: true; rawBody: string; byteLength: number }
  | {
      ok: false;
      status: 400 | 413;
      reason:
        | "invalid_body_limit"
        | "invalid_content_length"
        | "request_body_required"
        | "request_body_too_large"
        | "invalid_request_body";
    };

export function parseJsonObject(rawBody: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read a request body without trusting Content-Length to be present or honest.
 *
 * The stream is cancelled as soon as its aggregate byte count crosses the
 * configured ceiling. Callers still own content parsing and response headers.
 */
export async function readBoundedRequestBody(
  req: Request,
  maxBytes: number,
): Promise<BoundedRequestBody> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    return { ok: false, status: 400, reason: "invalid_body_limit" };
  }

  const rawLength = req.headers.get("content-length");
  if (rawLength) {
    if (!/^\d+$/.test(rawLength)) {
      return { ok: false, status: 400, reason: "invalid_content_length" };
    }
    const declared = Number(rawLength);
    if (!Number.isSafeInteger(declared)) {
      return { ok: false, status: 400, reason: "invalid_content_length" };
    }
    if (declared > maxBytes) {
      return { ok: false, status: 413, reason: "request_body_too_large" };
    }
  }

  if (!req.body) {
    return { ok: false, status: 400, reason: "request_body_required" };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        return { ok: false, status: 413, reason: "request_body_too_large" };
      }
      chunks.push(chunk.value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      rawBody: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      byteLength,
    };
  } catch {
    return { ok: false, status: 400, reason: "invalid_request_body" };
  } finally {
    reader.releaseLock();
  }
}
