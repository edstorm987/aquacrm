const DEFAULT_MAX_WEBHOOK_BYTES = 256 * 1_024;

export type PublicWebhookBody =
  | { ok: true; rawBody: string; byteLength: number }
  | { ok: false; response: Response };

function refusal(status: 400 | 413, error: string): PublicWebhookBody {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }),
  };
}

/** Read the exact provider-signed payload with both declared and chunked caps. */
export async function readBoundedPublicWebhookBody(
  req: Request,
  maxBytes = DEFAULT_MAX_WEBHOOK_BYTES,
): Promise<PublicWebhookBody> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return refusal(400, "invalid_webhook_limit");
  const rawLength = req.headers.get("content-length");
  if (rawLength) {
    if (!/^\d+$/.test(rawLength)) return refusal(400, "invalid_content_length");
    const declared = Number(rawLength);
    if (!Number.isSafeInteger(declared)) return refusal(400, "invalid_content_length");
    if (declared > maxBytes) return refusal(413, "webhook_body_too_large");
  }
  if (!req.body) return refusal(400, "webhook_body_required");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel("webhook body too large").catch(() => undefined);
        return refusal(413, "webhook_body_too_large");
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
    return refusal(400, "invalid_webhook_body");
  } finally {
    reader.releaseLock();
  }
}
