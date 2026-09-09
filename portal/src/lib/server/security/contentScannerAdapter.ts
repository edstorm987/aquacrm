import "server-only";

// Real AV/CDR scanner adapter (Item 7). If PORTAL_AV_SCANNER_URL is configured,
// this registers a content scanner that POSTs the full uploaded bytes to that
// endpoint through the AUDITED egress broker — so the scanner destination is
// itself SSRF-safe (no private/metadata address, DNS-rebind pinned, credentials
// stripped across an origin change). The endpoint must answer JSON
// `{ "malicious": boolean, "detail"?: string }`.
//
// Until a real endpoint is configured NOTHING is registered — hasContentScanner()
// stays false, the readiness gate stays red, and production high-risk uploads
// fail closed (quarantined). This never fabricates a "clean" verdict.

import { brokeredFetch, OutboundBlockedError } from "@/lib/server/net/outboundBroker";
import { setContentScanner, type ContentScanner } from "@/lib/server/security/contentTrust";

const SCAN_TIMEOUT_MS = 30_000;

export function buildEnvContentScanner(env: NodeJS.ProcessEnv = process.env): ContentScanner | null {
  const url = env.PORTAL_AV_SCANNER_URL?.trim();
  if (!url) return null;
  const token = env.PORTAL_AV_SCANNER_TOKEN?.trim();
  return async ({ bytes, digest, declaredType, sizeBytes }) => {
    let response;
    try {
      response = await brokeredFetch({
        url,
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-content-digest": digest,
          "x-declared-type": declaredType,
          "x-content-length": String(sizeBytes),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: bytes,
        timeoutMs: SCAN_TIMEOUT_MS,
        purpose: "content-trust.scan",
        // A scanner outage must surface as an ERROR (→ fail closed / quarantine
        // in production), never as a "clean" default — so throw on any non-2xx.
      });
    } catch (error) {
      if (error instanceof OutboundBlockedError) {
        throw new Error(`scanner destination refused by egress policy: ${error.reason}`);
      }
      throw error instanceof Error ? error : new Error("scanner request failed");
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`scanner returned HTTP ${response.status}`);
    }
    const parsed = JSON.parse(response.bodyText || "null") as { malicious?: unknown; detail?: unknown } | null;
    if (!parsed || typeof parsed.malicious !== "boolean") {
      throw new Error("scanner returned an unparseable verdict");
    }
    return { malicious: parsed.malicious, detail: typeof parsed.detail === "string" ? parsed.detail : undefined };
  };
}

/** Wire the configured scanner at boot. No-op when PORTAL_AV_SCANNER_URL is unset. */
export function wireContentScannerFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const scanner = buildEnvContentScanner(env);
  if (!scanner) return false;
  setContentScanner(scanner);
  return true;
}
