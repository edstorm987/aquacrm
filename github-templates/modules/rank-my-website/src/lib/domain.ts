// rank-my-website domain.

// A-F bands. NO numeric percentage out of 100 (chapter #68 — false
// precision). The bands are derived from the pure check functions
// below; the UI surfaces the band + the actual finding.

export type Band = "A" | "B" | "C" | "D" | "F";
export const BANDS: readonly Band[] = ["A", "B", "C", "D", "F"] as const;

export type CheckId =
  | "title"
  | "meta-description"
  | "h1"
  | "image-alts"
  | "og-tags"
  | "canonical"
  | "robots-txt"
  | "sitemap-xml"
  | "https"
  | "hsts";

export const CHECK_IDS: readonly CheckId[] = [
  "title", "meta-description", "h1", "image-alts",
  "og-tags", "canonical", "robots-txt", "sitemap-xml",
  "https", "hsts",
] as const;

export interface CheckResult {
  id: CheckId;
  label: string;
  band: Band;
  // Concrete finding the customer can act on. Avoid abstract jargon;
  // use small numbers and named tags ("3 of 12 images missing alt").
  finding: string;
  // Optional structured payload (counts, samples) for downstream
  // tooling. Not surfaced in the UI's primary text.
  data?: Record<string, unknown>;
}

export interface DiagnosticReport {
  url: string;
  fetchedAt: number;
  // The overall band is the WORST band across checks, not an
  // average — chapter #68 honesty: an A site with one F is not a B
  // site. Tied bands take the worst-case still.
  overallBand: Band;
  checks: CheckResult[];
  // Set when the analyzer couldn't fetch the page (network / 4xx /
  // 5xx). The report still ships with `checks` empty + `overallBand:
  // "F"` so the UI can show "we couldn't reach your site" honestly
  // rather than fabricating a score.
  fetchError?: { kind: "timeout" | "network" | "http" | "too-large" | "blocked-private"; message: string; status?: number };
}

export interface RunDiagnosticInput {
  url: string;
  // Wall-clock budget; analyzer aborts at this point and returns a
  // `timeout` fetch error.
  timeoutMs?: number;
  // Body cap; analyzer aborts at this point and returns a `too-large`
  // fetch error. Default 3MB.
  maxBodyBytes?: number;
}

// ── URL safety ─────────────────────────────────────────────────

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
  hostname?: string;
  isHttps?: boolean;
}

// Reject private IPs / loopback / link-local / malformed / non-http.
// The analyzer is a public-facing tool — running fetches against
// 127.0.0.1 / 169.254.x.x / 10.x.x.x / 192.168.x.x would be a SSRF
// vector. This is a best-effort string check; foundation should
// also DNS-resolve and re-check at fetch time.
export function checkUrlSafety(raw: string): UrlSafetyResult {
  let u: URL;
  try { u = new URL(raw); }
  catch { return { ok: false, reason: "malformed_url" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "non_http_protocol", hostname: u.hostname };
  }
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) {
    return { ok: false, reason: "localhost", hostname: h };
  }
  // IPv4 private / loopback / link-local / reserved.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return { ok: false, reason: "private_ipv4", hostname: h };
    if (a === 127) return { ok: false, reason: "loopback_ipv4", hostname: h };
    if (a === 169 && b === 254) return { ok: false, reason: "link_local_ipv4", hostname: h };
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return { ok: false, reason: "private_ipv4", hostname: h };
    if (a === 192 && b === 168) return { ok: false, reason: "private_ipv4", hostname: h };
    if (a === 0) return { ok: false, reason: "reserved_ipv4", hostname: h };
  }
  // IPv6 loopback / link-local — bracketed form `[::1]` or `[fe80::…]`.
  if (h === "::1" || h === "[::1]") return { ok: false, reason: "loopback_ipv6", hostname: h };
  if (h.startsWith("fe80:") || h.startsWith("[fe80:")) return { ok: false, reason: "link_local_ipv6", hostname: h };

  return { ok: true, hostname: h, isHttps: u.protocol === "https:" };
}

// Score-bucket helper for downstream analytics. Maps band → 0-4.
export function bandToOrdinal(b: Band): number {
  return { A: 4, B: 3, C: 2, D: 1, F: 0 }[b];
}
export function ordinalToBand(n: number): Band {
  if (n >= 4) return "A";
  if (n === 3) return "B";
  if (n === 2) return "C";
  if (n === 1) return "D";
  return "F";
}
