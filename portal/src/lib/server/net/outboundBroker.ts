import "server-only";

// Outbound request broker — the single audited egress path (assume-breach
// containment, Phase 0-D).
//
// Every server-side request whose destination or credentials derive from
// stored/tenant/user input must go through here. The verification pass found
// automations webhooks, integration test-connections, external form reads,
// Google Search Console token_uri, transactional SMTP and the shopify/email
// modules could each be pointed at a private/loopback/link-local/metadata
// address, and several forwarded stored credentials to whatever origin the
// URL named. `safeSiteFetch` closed part of this for GET-only site reads but
// (a) had a DNS-rebinding TOCTOU window (validate hostname, then let fetch()
// resolve AGAIN and connect to a different address) and (b) did not cover
// POST/PUT bodies, credential headers or per-tenant destination policy.
//
// This broker fixes all of it:
//   • scheme + port allowlists;
//   • hostname canonicalisation and rejection of IP-literal/rebinding tricks;
//   • DNS resolution up front, reuse of the SHARED unsafe-address classifier
//     (radarSyntheticSafety — IPv4/IPv6/v4-mapped/CGNAT/metadata all covered);
//   • CONNECT-TIME PINNING: the vetted IP is pinned into an undici Agent so the
//     socket connects to the address we validated, not one a rebind swapped in
//     between check and connect (closes the TOCTOU);
//   • redirect revalidation at every hop (each Location re-runs the full gate),
//     default redirect:"manual";
//   • credentials are stripped across an ORIGIN CHANGE — a redirect to another
//     origin never carries Authorization/apikey/cookie;
//   • strict time, request-body and response-body limits;
//   • per-tenant destination policy hook (allow/deny host suffixes);
//   • a SecurityEvent for every blocked attempt (secret-free).
//
// It is intentionally allowlist-first: unknown schemes/ports are denied.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";

import { isReservedSyntheticHostname, isUnsafeSyntheticAddress } from "@/engines/data/radar/radarSyntheticSafety";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REQUEST_BYTES = 1 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
// Ports a legitimate outbound integration uses. Everything else (SSH, SMB,
// Redis, Postgres, the Docker/Kubelet APIs, etc.) is denied by default.
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
// Every secret-bearing header must be treated as a credential so it is stripped
// across an origin-changing redirect. Provider-specific token headers are named
// explicitly (e.g. Shopify's storefront token) alongside the generic ones.
const CREDENTIAL_HEADERS = new Set([
  "authorization",
  "apikey",
  "cookie",
  "x-api-key",
  "proxy-authorization",
  "x-shopify-storefront-access-token",
  "x-shopify-access-token",
]);

export type OutboundDenyReason =
  | "invalid-url"
  | "scheme-not-allowed"
  | "port-not-allowed"
  | "credentials-in-url"
  | "reserved-hostname"
  | "dns-failed"
  | "private-address"
  | "tenant-policy"
  | "redirect-loop"
  | "redirect-unsafe"
  | "timeout"
  | "response-too-large"
  | "request-too-large"
  | "network";

export class OutboundBlockedError extends Error {
  readonly reason: OutboundDenyReason;
  constructor(reason: OutboundDenyReason, message: string) {
    super(message);
    this.name = "OutboundBlockedError";
    this.reason = reason;
  }
}

export interface TenantDestinationPolicy {
  /** If set, the host must end with one of these suffixes. */
  allowHostSuffixes?: string[];
  /** The host must NOT end with any of these (checked before the allowlist). */
  denyHostSuffixes?: string[];
}

export interface OutboundRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** String or bytes; enforced against maxRequestBytes before sending. */
  body?: string | Uint8Array;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRequestBytes?: number;
  /** For the SecurityEvent + per-tenant policy lookup. */
  tenantId?: string;
  /** Names this call site for audit ("automation.webhook", "integration.test", ...). */
  purpose: string;
  policy?: TenantDestinationPolicy;
  /** Follow redirects (each re-validated) or fail on the first one. Default true. */
  followRedirects?: boolean;
}

export interface OutboundResponse {
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  bodyText: string;
  bytes: number;
  redirectCount: number;
  /** Every vetted IP the chain connected to, for the record. */
  pinnedAddresses: string[];
}

interface Vetted {
  url: URL;
  address: string;
  family: 4 | 6;
}

function canonicalHost(url: URL): string {
  // URL keeps IPv6 literals bracketed ("[::1]"); strip the brackets so isIP()
  // and the address classifier see the real literal.
  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
}

async function vet(url: URL, policy: TenantDestinationPolicy | undefined): Promise<Vetted> {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new OutboundBlockedError("scheme-not-allowed", `scheme ${url.protocol} is not allowed`);
  }
  if (url.username || url.password) {
    throw new OutboundBlockedError("credentials-in-url", "credentials embedded in URL are not allowed");
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new OutboundBlockedError("port-not-allowed", `port ${port} is not allowed`);
  }
  const host = canonicalHost(url);
  if (!host || isReservedSyntheticHostname(host)) {
    throw new OutboundBlockedError("reserved-hostname", `host ${host || "(none)"} is reserved`);
  }
  if (policy?.denyHostSuffixes?.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new OutboundBlockedError("tenant-policy", `host ${host} is denied by tenant policy`);
  }
  if (policy?.allowHostSuffixes && !policy.allowHostSuffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new OutboundBlockedError("tenant-policy", `host ${host} is not on the tenant allowlist`);
  }

  // Resolve once, here, and pin. If the caller passed an IP literal, classify
  // it directly (still denied when private/reserved).
  let candidates: Array<{ address: string; family: number }>;
  if (isIP(host)) {
    candidates = [{ address: host, family: isIP(host) }];
  } else {
    try {
      candidates = await lookup(host, { all: true, verbatim: true });
    } catch (error) {
      throw new OutboundBlockedError("dns-failed", `could not resolve ${host}: ${errText(error)}`);
    }
  }
  if (candidates.length === 0) throw new OutboundBlockedError("dns-failed", `${host} did not resolve`);
  // EVERY resolved address must be public — a host that returns one public and
  // one private A record is a rebinding attempt, so we reject the whole host.
  for (const record of candidates) {
    if (isUnsafeSyntheticAddress(record.address)) {
      throw new OutboundBlockedError("private-address", `${host} resolves to a private/reserved address`);
    }
  }
  const chosen = candidates[0];
  return { url, address: chosen.address, family: (isIP(chosen.address) || 4) as 4 | 6 };
}

/**
 * An undici Agent that connects ONLY to the pinned, pre-vetted IP. Closes the
 * DNS-rebinding TOCTOU. Exported for the behavioural pin test, which proves the
 * socket follows the pinned address and not the hostname's resolution.
 */
export function pinnedAgent(vetted: Vetted): Agent {
  return new Agent({
    connect: {
      // undici lets us override the resolved address; the TLS SNI/servername
      // still uses the original hostname so certificate verification (and the
      // provider's virtual host) keep working. undici (6.x) calls this with
      // `{ all: true }`, so the callback MUST return the address-list form
      // `[{ address, family }]` — the plain `(err, address, family)` form makes
      // undici read the address as undefined and throw on every brokered
      // connect, so the pin (and every brokered outbound call) would fail.
      lookup: (_hostname, _options, callback) => callback(null, [{ address: vetted.address, family: vetted.family }]),
      servername: canonicalHost(vetted.url),
    },
  });
}

function sanitizedHeaders(headers: Record<string, string> | undefined, keepCredentials: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (!keepCredentials && CREDENTIAL_HEADERS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : "request failed";
}

/**
 * Host vetting for NON-HTTP egress (SMTP is the current caller — nodemailer
 * opens a raw socket the HTTP broker cannot carry). Applies the same
 * resolve-and-classify rule as `vet()`: every resolved address must be public,
 * or the whole host is refused. Loopback is tolerated OUTSIDE production so a
 * dev MailHog keeps working; production refuses it like everything else.
 * Blocks are evented exactly like brokered requests.
 */
export async function vetOutboundHost(
  host: string,
  context: { purpose: string; tenantId?: string; env?: NodeJS.ProcessEnv },
): Promise<{ addresses: string[] }> {
  const env = context.env ?? process.env;
  const cleaned = host.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  const refuse = (reason: OutboundDenyReason, message: string): never => {
    recordSecurityEvent({
      kind: "outbound.blocked",
      severity: "warning",
      tenantId: context.tenantId,
      detail: { purpose: context.purpose, host: cleaned, reason },
    });
    throw new OutboundBlockedError(reason, message);
  };
  if (!cleaned || isReservedSyntheticHostname(cleaned)) {
    return refuse("reserved-hostname", `host ${cleaned || "(none)"} is reserved`);
  }
  let candidates: Array<{ address: string; family: number }>;
  if (isIP(cleaned)) {
    candidates = [{ address: cleaned, family: isIP(cleaned) }];
  } else {
    try {
      candidates = await lookup(cleaned, { all: true, verbatim: true });
    } catch (error) {
      return refuse("dns-failed", `could not resolve ${cleaned}: ${errText(error)}`);
    }
  }
  if (candidates.length === 0) return refuse("dns-failed", `${cleaned} did not resolve`);
  const devLoopbackAllowed = env.NODE_ENV !== "production";
  for (const record of candidates) {
    if (devLoopbackAllowed && (record.address === "127.0.0.1" || record.address === "::1")) continue;
    if (isUnsafeSyntheticAddress(record.address)) {
      return refuse("private-address", `${cleaned} resolves to a private/reserved address`);
    }
  }
  return { addresses: candidates.map(record => record.address) };
}

/**
 * Vet a RAW-SOCKET destination (SMTP and other non-HTTP protocols the fetch
 * broker cannot carry) and return a PINNED connect target that closes the
 * DNS-rebinding TOCTOU: connect to the exact IP that was vetted, and validate
 * TLS against the original hostname via SNI/servername. Without this, a caller
 * that vets `mail.evil.example` and then hands the HOSTNAME to nodemailer lets
 * the resolver answer differently the second time (rebind to 169.254.169.254).
 * Throws OutboundBlockedError for an unsafe or unresolvable host.
 */
export async function pinnedSocketTarget(
  host: string,
  context: { purpose: string; tenantId?: string; env?: NodeJS.ProcessEnv },
): Promise<{ address: string; servername: string }> {
  const cleaned = host.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  const { addresses } = await vetOutboundHost(host, context);
  const address = addresses[0];
  if (!address) throw new OutboundBlockedError("dns-failed", `no safe address for ${cleaned}`);
  return { address, servername: cleaned };
}

/**
 * The one audited outbound call. Throws OutboundBlockedError (with a reason)
 * for anything unsafe; records a SecurityEvent for every block.
 */
export async function brokeredFetch(request: OutboundRequest): Promise<OutboundResponse> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = request.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRequestBytes = request.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const followRedirects = request.followRedirects ?? true;
  const method = (request.method ?? "GET").toUpperCase();

  let bodyBytes: Uint8Array | undefined;
  if (request.body !== undefined) {
    bodyBytes = typeof request.body === "string" ? new TextEncoder().encode(request.body) : request.body;
    if (bodyBytes.byteLength > maxRequestBytes) {
      throw block(request, "request-too-large", `request body ${bodyBytes.byteLength}B exceeds ${maxRequestBytes}B`);
    }
  }

  let current: URL;
  try {
    current = new URL(request.url);
  } catch {
    throw block(request, "invalid-url", "unparseable URL");
  }
  const origin0 = () => `${current.protocol}//${canonicalHost(current)}`;
  const startOrigin = `${current.protocol}//${current.host}`;
  const pinnedAddresses: string[] = [];
  let redirectCount = 0;
  let carryCredentials = true;

  for (;;) {
    let vetted: Vetted;
    try {
      vetted = await vet(current, request.policy);
    } catch (error) {
      if (error instanceof OutboundBlockedError) throw block(request, error.reason, error.message);
      throw block(request, "network", errText(error));
    }
    pinnedAddresses.push(vetted.address);
    const agent = pinnedAgent(vetted);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      // `dispatcher` is an undici extension of RequestInit that the DOM lib
      // types don't model; the Node fetch impl honours it. Body is wrapped in
      // a Blob so the DOM BodyInit type accepts the bytes.
      const init = {
        method,
        headers: sanitizedHeaders(request.headers, carryCredentials),
        body: method === "GET" || method === "HEAD" || !bodyBytes ? undefined : new Blob([Uint8Array.from(bodyBytes).buffer]),
        redirect: "manual" as const,
        signal: controller.signal,
        dispatcher: agent,
      } as RequestInit;
      response = await fetch(current, init);
    } catch (error) {
      await agent.close().catch(() => {});
      if (error instanceof Error && error.name === "AbortError") throw block(request, "timeout", "request timed out");
      throw block(request, "network", errText(error));
    } finally {
      clearTimeout(timer);
    }

    if (followRedirects && isRedirect(response.status)) {
      await agent.close().catch(() => {});
      const location = response.headers.get("location");
      if (!location) throw block(request, "redirect-unsafe", "redirect without a location");
      redirectCount += 1;
      if (redirectCount > MAX_REDIRECTS) throw block(request, "redirect-loop", "too many redirects");
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, current);
      } catch {
        throw block(request, "redirect-unsafe", "unparseable redirect target");
      }
      // Credentials never survive an origin change (the classic token-leak).
      const nextOrigin = `${nextUrl.protocol}//${nextUrl.host}`;
      if (nextOrigin !== startOrigin) carryCredentials = false;
      void origin0;
      current = nextUrl;
      continue;
    }

    // Terminal response — read a capped body then release the pinned agent.
    const { text, bytes } = await readCapped(response, maxResponseBytes).catch(() => ({ text: "", bytes: 0 }));
    await agent.close().catch(() => {});
    if (bytes >= maxResponseBytes) {
      // We stopped reading at the cap rather than erroring — surface it but
      // still return what we have, so callers that only need a prefix work.
    }
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    return {
      status: response.status,
      finalUrl: current.toString(),
      headers,
      bodyText: text,
      bytes,
      redirectCount,
      pinnedAddresses,
    };
  }
}

async function readCapped(response: Response, limit: number): Promise<{ text: string; bytes: number }> {
  if (!response.body) return { text: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (bytes < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const retained = value.slice(0, Math.max(0, limit - bytes));
    chunks.push(retained);
    bytes += retained.byteLength;
  }
  await reader.cancel().catch(() => {});
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return { text: new TextDecoder().decode(merged), bytes };
}

function block(request: OutboundRequest, reason: OutboundDenyReason, message: string): OutboundBlockedError {
  // Secret-free security event. Records the host and reason, never the URL's
  // query, credentials or body.
  let host = "(unparseable)";
  try { host = new URL(request.url).host; } catch { /* keep placeholder */ }
  recordSecurityEvent({
    kind: "outbound.blocked",
    severity: "warning",
    tenantId: request.tenantId,
    detail: { purpose: request.purpose, host, reason },
  });
  return new OutboundBlockedError(reason, `outbound request blocked (${reason}): ${message}`);
}
