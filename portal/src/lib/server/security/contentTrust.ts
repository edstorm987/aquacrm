import "server-only";

// Content trust gateway — assume-breach containment, Phase 2 (seed).
//
// The verification pass confirmed every upload route validates the DECLARED
// filename/MIME only: a file whose bytes are an HTML document, a script or a
// native executable is stored verbatim as long as its *declared* type is on an
// allowlist ("storage validates declared MIME, not content" — proven against
// the live storage API with a PNG-declared non-PNG). This module is the single
// content-level judgement every stored upload passes through:
//
//   - the full byte stream is hashed (sha256) so every stored artifact has a
//     stable identity for lineage, dedup and recall;
//   - the HEAD bytes are sniffed against magic-number signatures and the
//     verdict compares CONTENT against the declared type;
//   - native executables are refused everywhere, polyglots (media-declared
//     bytes that are actually HTML/SVG/script) are refused, declared types
//     with a known signature must match it, and "text" may not smuggle NULs;
//   - every refusal lands in the security-event spine (digest + types only —
//     never file contents, never a caller-supplied filename).
//
// What this does NOT do is provision a malware-scanner provider. The external
// AV/CDR gateway remains an owner action. When configured, its exact origin,
// DNS answers and connect-time IP are constrained below; until then a file may
// be signature-clean but is never scanner-cleared for operator download.

import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import { recordSecurityEvent } from "./securityEvents";
import { isReservedSyntheticHostname, isUnsafeSyntheticAddress } from "@/engines/data/radar/radarSyntheticSafety";

export type ContentTrustReason =
  | "executable-content"
  | "active-content-polyglot"
  | "declared-type-mismatch"
  | "binary-masquerading-as-text"
  | "svg-active-content"
  | "scanner-verdict-malicious";

export type ContentScannerVerdict =
  | "clean"
  | "malicious"
  | "unavailable"
  | "not-configured"
  | "not-run";

export interface ContentTrustAssessment {
  verdict: "clean" | "unverified" | "blocked";
  /** sha256 of the full byte stream — the artifact's identity. */
  digest: string;
  sizeBytes: number;
  declaredType: string;
  /** What the magic bytes say, when a signature matched. */
  sniffedType: string | null;
  /** Malware/CDR result. Signature matching never upgrades this field. */
  scannerVerdict: ContentScannerVerdict;
  reason?: ContentTrustReason;
}

export class ContentTrustError extends Error {
  readonly code = "content_trust_blocked";
  readonly assessment: ContentTrustAssessment;

  constructor(assessment: ContentTrustAssessment) {
    super(
      `Upload refused: content does not match its declared type (${assessment.declaredType}; ` +
        `${assessment.reason ?? "blocked"}). The file was not stored.`,
    );
    this.name = "ContentTrustError";
    this.assessment = assessment;
  }
}

// ─── Optional external scanner seam ─────────────────────────────────────────

export type ContentScanner = (input: {
  /** Complete artifact. A malware verdict based only on the first bytes is not acceptable. */
  file: Blob;
  head: Uint8Array;
  digest: string;
  declaredType: string;
  sizeBytes: number;
}) => Promise<{ malicious: boolean; detail?: string }>;

let scanner: ContentScanner | null = null;

const SCANNER_RESPONSE_MAX_BYTES = 16 * 1024;
const SCANNER_TIMEOUT_MS = 20_000;

function scannerTimeoutError(): Error {
  return new Error("scanner-timeout");
}

/**
 * Bound every asynchronous scanner phase, including DNS and injectable test
 * transports that do not themselves honour AbortSignal. Attaching both
 * resolution handlers also prevents a late DNS/transport rejection from
 * becoming unhandled after the deadline has already won the race.
 */
function scannerWorkBeforeDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(scannerTimeoutError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(scannerTimeoutError()));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      value => finish(() => signal.aborted ? reject(scannerTimeoutError()) : resolve(value)),
      cause => finish(() => reject(cause)),
    );
  });
}

export interface ContentScannerNetwork {
  /** Resolve once; every answer is classified and the selected answer is pinned. */
  resolve(hostname: string): Promise<Array<{ address: string; family: number }>>;
  /** Injectable hermetic seam. Production uses the pinned transport below. */
  transport(input: {
    url: URL;
    address: string;
    family: 4 | 6;
    servername: string;
    headers: Record<string, string>;
    body: Blob;
    signal: AbortSignal;
  }): Promise<{ status: number; bodyText: string; redirected: boolean }>;
}

export async function boundedScannerResponse(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > SCANNER_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("scanner-response-too-large");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString("utf8");
}

function canonicalScannerHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
}

function ipv4Number(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function ipv4InCidr(address: string, base: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const start = ipv4Number(base);
  if (value === null || start === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (start & mask);
}

function ipv6Number(address: string): bigint | null {
  let value = address.toLowerCase().split("%")[0] ?? "";
  if (isIP(value) !== 6) return null;
  const mappedV4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mappedV4) {
    const numeric = ipv4Number(mappedV4[2]!);
    if (numeric === null) return null;
    value = `${mappedV4[1]}${((numeric >>> 16) & 0xffff).toString(16)}:${(numeric & 0xffff).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0]!.split(":") : [];
  const right = halves[1] ? halves[1]!.split(":") : [];
  const omitted = 8 - left.length - right.length;
  const groups = halves.length === 2
    ? [...left, ...Array.from({ length: omitted }, () => "0"), ...right]
    : left;
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function ipv6InCidr(address: string, base: string, prefix: number): boolean {
  const value = ipv6Number(address);
  const start = ipv6Number(base);
  if (value === null || start === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (start >> shift);
}

/** Scanner egress is allow-public-only, including documentation and benchmark ranges. */
export function isUnsafeScannerAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? address.toLowerCase();
  if (isUnsafeSyntheticAddress(normalized)) return true;
  if (isIP(normalized) === 4) {
    return [
      ["192.0.2.0", 24],       // TEST-NET-1
      ["192.31.196.0", 24],    // AS112 special-purpose
      ["192.52.193.0", 24],    // AMT special-purpose
      ["192.88.99.0", 24],     // deprecated relay anycast
      ["192.175.48.0", 24],    // AS112 special-purpose
      ["198.51.100.0", 24],    // TEST-NET-2
      ["203.0.113.0", 24],     // TEST-NET-3
    ].some(([base, prefix]) => ipv4InCidr(normalized, base as string, prefix as number));
  }
  if (isIP(normalized) === 6) {
    return [
      ["::", 128],             // unspecified
      ["::1", 128],            // loopback
      ["::ffff:0:0", 96],      // IPv4-mapped ambiguity
      ["64:ff9b::", 96],       // translation prefixes
      ["64:ff9b:1::", 48],
      ["100::", 64],           // discard-only
      ["2001::", 23],          // IETF special-purpose/benchmark/ORCHID
      ["2001:db8::", 32],      // documentation
      ["2002::", 16],          // 6to4 transition
      ["3fff::", 20],          // documentation
      ["5f00::", 16],          // segment-routing SIDs
      ["fc00::", 7],           // unique-local
      ["fe80::", 10],          // link-local
      ["ff00::", 8],           // multicast
    ].some(([base, prefix]) => ipv6InCidr(normalized, base as string, prefix as number));
  }
  return true;
}

function scannerAllowedOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const origins = new Set<string>();
  for (const raw of (env.CONTENT_SCANNER_ALLOWED_ORIGINS ?? "").split(",")) {
    const value = raw.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") continue;
      if (!["https:", "http:"].includes(parsed.protocol)) continue;
      if (env.NODE_ENV === "production" && parsed.protocol !== "https:") continue;
      origins.add(parsed.origin);
    } catch {
      // Invalid entries grant nothing.
    }
  }
  return origins;
}

async function defaultScannerTransport(
  input: Parameters<ContentScannerNetwork["transport"]>[0],
): Promise<{ status: number; bodyText: string; redirected: boolean }> {
  const agent = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => callback(null, input.address, input.family),
      // Preserve TLS SNI/certificate verification and the provider's virtual host
      // while the socket itself connects only to the already-vetted address.
      servername: input.servername,
    },
  });
  try {
    const response = await fetch(input.url, {
      method: "POST",
      redirect: "manual",
      signal: input.signal,
      headers: input.headers,
      body: input.body,
      dispatcher: agent,
    } as RequestInit);
    const redirected = [301, 302, 303, 307, 308].includes(response.status);
    return {
      status: response.status,
      bodyText: redirected ? "" : await boundedScannerResponse(response),
      redirected,
    };
  } finally {
    await agent.close().catch(() => undefined);
  }
}

const DEFAULT_SCANNER_NETWORK: ContentScannerNetwork = {
  resolve: async hostname => lookup(hostname, { all: true, verbatim: true }),
  transport: defaultScannerTransport,
};

async function vettedScannerAddress(
  url: URL,
  network: ContentScannerNetwork,
  signal: AbortSignal,
): Promise<{ address: string; family: 4 | 6; servername: string }> {
  const hostname = canonicalScannerHostname(url);
  if (!hostname || isReservedSyntheticHostname(hostname)) throw new Error("scanner-reserved-hostname");
  const literalFamily = isIP(hostname);
  const candidates = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await scannerWorkBeforeDeadline(network.resolve(hostname), signal);
  if (signal.aborted) throw scannerTimeoutError();
  if (candidates.length === 0) throw new Error("scanner-dns-empty");
  for (const candidate of candidates) {
    const family = isIP(candidate.address);
    if ((family !== 4 && family !== 6) || isUnsafeScannerAddress(candidate.address)) {
      throw new Error("scanner-private-or-reserved-address");
    }
  }
  const selected = candidates[0]!;
  return {
    address: selected.address,
    family: isIP(selected.address) as 4 | 6,
    servername: hostname,
  };
}

/**
 * Generic HTTPS AV/CDR gateway contract. The gateway receives the complete
 * artifact as the raw body plus digest/type metadata and must return exactly
 * `{ "verdict": "clean" | "malicious" }`. Redirects are forbidden so the
 * bearer credential and document cannot be forwarded to another origin.
 */
export function configuredHttpContentScanner(
  env: NodeJS.ProcessEnv = process.env,
  network: ContentScannerNetwork = DEFAULT_SCANNER_NETWORK,
  timeoutMs: number = SCANNER_TIMEOUT_MS,
): ContentScanner | null {
  const endpoint = env.CONTENT_SCANNER_URL?.trim();
  const token = env.CONTENT_SCANNER_BEARER_TOKEN?.trim();
  if (!endpoint || !token) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) return null;
  if (env.NODE_ENV === "production" && url.protocol !== "https:") return null;
  // Exact-origin admission is configuration, not a suffix match. A compromised
  // endpoint variable cannot move the credential/document to another origin.
  if (!scannerAllowedOrigins(env).has(url.origin)) return null;
  const literal = canonicalScannerHostname(url);
  if (isIP(literal) && isUnsafeScannerAddress(literal)) return null;
  if (isReservedSyntheticHostname(literal)) return null;

  return async input => {
    const controller = new AbortController();
    // The optional seam can shorten hermetic tests, never extend production's
    // fixed maximum deadline.
    const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(Math.floor(timeoutMs), SCANNER_TIMEOUT_MS)
      : SCANNER_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      const pinned = await vettedScannerAddress(url, network, controller.signal);
      if (controller.signal.aborted) throw scannerTimeoutError();
      const response = await scannerWorkBeforeDeadline(network.transport({
        url,
        address: pinned.address,
        family: pinned.family,
        servername: pinned.servername,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": input.declaredType || "application/octet-stream",
          "x-aqua-content-digest": input.digest,
          "x-aqua-content-size": String(input.sizeBytes),
        },
        body: input.file,
      }), controller.signal);
      if (controller.signal.aborted) throw scannerTimeoutError();
      if (response.redirected) throw new Error("scanner-redirect-refused");
      if (response.status < 200 || response.status >= 300) throw new Error(`scanner-http-${response.status}`);
      const payload = JSON.parse(response.bodyText) as { verdict?: unknown };
      if (payload.verdict !== "clean" && payload.verdict !== "malicious") {
        throw new Error("scanner-invalid-verdict");
      }
      return { malicious: payload.verdict === "malicious" };
    } finally {
      clearTimeout(timeout);
    }
  };
}

/** Connect a real AV/CDR engine. Until one is connected, verdicts stay honest: clean-by-signature or unverified, never "scanned". */
export function setContentScanner(fn: ContentScanner | null): void {
  scanner = fn;
}

/** Honest posture: is a real scanner connected? (Signature-only when not.) */
export function hasContentScanner(): boolean {
  return scanner !== null || configuredHttpContentScanner() !== null;
}

/** Exact identity of the provider object whose bytes received the verdict. */
export function contentTrustObjectVersion(storageProvider: string, storageKey: string, digest: string): string {
  return crypto.createHash("sha256")
    .update(storageProvider)
    .update("\0")
    .update(storageKey)
    .update("\0")
    .update(digest)
    .digest("hex");
}

/**
 * Final read gate for high-risk private documents. Missing legacy metadata,
 * signature-only checks, scanner outages and pending scans all remain closed.
 */
export function operatorDocumentDownloadAllowed(contentTrust: {
  digest?: string;
  objectVersion?: string;
  scannerVerdict?: ContentScannerVerdict;
  quarantineStatus?: "released" | "quarantined";
} | null | undefined, object: {
  storageProvider: string;
  storageKey: string;
}): boolean {
  const digest = contentTrust?.digest ?? "";
  return Boolean(contentTrust?.digest?.match(/^[0-9a-f]{64}$/))
    && contentTrust?.objectVersion === contentTrustObjectVersion(object.storageProvider, object.storageKey, digest)
    && contentTrust?.scannerVerdict === "clean"
    && contentTrust.quarantineStatus === "released";
}

// ─── Signatures ─────────────────────────────────────────────────────────────

const HEAD_BYTES = 512;

function startsWith(head: Uint8Array, bytes: number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => head[offset + index] === byte);
}

function ascii(head: Uint8Array, length: number): string {
  return Buffer.from(head.subarray(0, length)).toString("latin1");
}

function isNativeExecutable(head: Uint8Array): boolean {
  return (
    startsWith(head, [0x4d, 0x5a]) || // PE/DOS "MZ"
    startsWith(head, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(head, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O 64
    startsWith(head, [0xce, 0xfa, 0xed, 0xfe]) || // Mach-O 32
    startsWith(head, [0xca, 0xfe, 0xba, 0xbe]) // Mach-O fat / Java class
  );
}

/** Leading-whitespace-tolerant "this is really an HTML/SVG/script document" check. */
function sniffsAsActiveContent(head: Uint8Array): "html" | "svg" | null {
  const text = ascii(head, Math.min(head.length, HEAD_BYTES)).replace(/^[\s﻿ ]+/, "").toLowerCase();
  if (text.startsWith("<!doctype html") || text.startsWith("<html") || text.startsWith("<script") || text.startsWith("<iframe")) {
    return "html";
  }
  if (text.startsWith("<?xml") && text.includes("<svg")) return "svg";
  if (text.startsWith("<svg")) return "svg";
  return null;
}

/** Magic-number sniff for the types the portal's allowlists actually accept. */
function sniffKnownType(head: Uint8Array): string | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(head, 6) === "GIF87a" || ascii(head, 6) === "GIF89a") return "image/gif";
  if (ascii(head, 4) === "RIFF" && ascii(head.subarray(8), 4) === "WEBP") return "image/webp";
  if (ascii(head, 4) === "RIFF" && ascii(head.subarray(8), 4) === "WAVE") return "audio/wav";
  if (ascii(head, 5) === "%PDF-") return "application/pdf";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return "application/zip";
  if (ascii(head, 3) === "ID3" || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(head.subarray(4), 4) === "ftyp") return "iso-bmff"; // mp4 / quicktime / m4a / heic family
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  return null;
}

/** Which sniffed identity satisfies each declared type family. */
function declaredTypeSatisfiedBy(declaredType: string): string[] | null {
  const declared = declaredType.toLowerCase().split(";")[0]!.trim();
  const table: Record<string, string[]> = {
    "image/png": ["image/png"],
    "image/jpeg": ["image/jpeg"],
    "image/jpg": ["image/jpeg"],
    "image/gif": ["image/gif"],
    "image/webp": ["image/webp"],
    "image/heic": ["iso-bmff"],
    "image/heif": ["iso-bmff"],
    "application/pdf": ["application/pdf"],
    "application/zip": ["application/zip"],
    "application/x-zip-compressed": ["application/zip"],
    // OOXML documents ARE zip containers.
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["application/zip"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["application/zip"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["application/zip"],
    "audio/mpeg": ["audio/mpeg"],
    "audio/mp3": ["audio/mpeg"],
    "audio/wav": ["audio/wav"],
    "audio/x-wav": ["audio/wav"],
    "audio/mp4": ["iso-bmff"],
    "audio/x-m4a": ["iso-bmff"],
    "video/mp4": ["iso-bmff"],
    "video/quicktime": ["iso-bmff"],
    "video/webm": ["video/webm"],
  };
  return table[declared] ?? null;
}

function isDeclaredText(declaredType: string): boolean {
  const declared = declaredType.toLowerCase().split(";")[0]!.trim();
  return declared.startsWith("text/") || declared === "application/json" || declared === "application/xml";
}

function isDeclaredBinaryMedia(declaredType: string): boolean {
  const declared = declaredType.toLowerCase().split(";")[0]!.trim();
  return (
    declared.startsWith("image/") ||
    declared.startsWith("audio/") ||
    declared.startsWith("video/") ||
    declared === "application/pdf" ||
    declared === "application/zip" ||
    declared === "application/x-zip-compressed" ||
    declared.startsWith("application/vnd.")
  );
}

// ─── The gateway ────────────────────────────────────────────────────────────

export interface AssessUploadInput {
  file: Blob;
  declaredType: string;
  /** Route-stable label ("client-files.upload", "careers.cv") — for the event spine. */
  purpose: string;
  tenantId?: string;
  actor?: string;
}

/**
 * Hash the full stream, sniff the head, and judge content against declaration.
 * Refusals record a security event (digest and types only — never contents,
 * never a caller-supplied filename).
 */
export async function assessUploadContent(input: AssessUploadInput): Promise<ContentTrustAssessment> {
  const hash = crypto.createHash("sha256");
  let head = new Uint8Array(0);
  let sizeBytes = 0;
  const reader = input.file.stream().getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hash.update(chunk.value);
    sizeBytes += chunk.value.byteLength;
    if (head.length < HEAD_BYTES) {
      const merged = new Uint8Array(Math.min(HEAD_BYTES, head.length + chunk.value.byteLength));
      merged.set(head, 0);
      merged.set(chunk.value.subarray(0, merged.length - head.length), head.length);
      head = merged;
    }
  }
  const digest = hash.digest("hex");
  const activeScanner = scanner ?? configuredHttpContentScanner();
  let scannerVerdict: ContentScannerVerdict = activeScanner ? "not-run" : "not-configured";

  const block = (reason: ContentTrustReason, sniffedType: string | null): ContentTrustAssessment => {
    const assessment: ContentTrustAssessment = {
      verdict: "blocked", digest, sizeBytes, declaredType: input.declaredType, sniffedType, scannerVerdict, reason,
    };
    recordSecurityEvent({
      kind: "content-trust.blocked",
      severity: "warning",
      tenantId: input.tenantId,
      actor: input.actor,
      detail: { reason, declaredType: input.declaredType, sniffedType, digest, sizeBytes, purpose: input.purpose },
    });
    return assessment;
  };

  // 1. Native executables are refused EVERYWHERE — no portal upload route
  //    legitimately accepts one, whatever the declared type claims.
  if (isNativeExecutable(head)) return block("executable-content", "native-executable");

  const declared = input.declaredType.toLowerCase().split(";")[0]!.trim();
  const active = sniffsAsActiveContent(head);

  // 2. SVG is script-capable XML. No allowlist currently accepts it; refuse it
  //    by content wherever it appears so an allowlist regression cannot
  //    quietly turn uploads into stored-XSS carriers.
  if (active === "svg" || declared === "image/svg+xml") return block("svg-active-content", active ?? declared);

  // 3. A media/binary-declared upload whose bytes are an HTML document is a
  //    polyglot aimed at a rendering sink — refuse.
  if (active === "html" && isDeclaredBinaryMedia(input.declaredType)) {
    return block("active-content-polyglot", "text/html");
  }

  // 4. Declared types with a known signature must MATCH it.
  const accepted = declaredTypeSatisfiedBy(input.declaredType);
  const sniffed = sniffKnownType(head);
  if (accepted) {
    if (sizeBytes > 0 && (!sniffed || !accepted.includes(sniffed))) {
      return block("declared-type-mismatch", sniffed);
    }
  }

  // 5. "Text" may not smuggle NUL bytes (a binary masquerading as .txt/.csv).
  if (isDeclaredText(input.declaredType) && head.includes(0)) {
    return block("binary-masquerading-as-text", sniffed);
  }

  // 6. Optional external scanner (AV/CDR). The complete artifact is supplied;
  //    a HEAD-only integration could not honestly clear document malware.
  //    Scanner absence/outage is recorded distinctly from signature trust so
  //    high-risk surfaces can quarantine instead of treating magic bytes as a
  //    malware verdict.
  if (activeScanner) {
    try {
      const result = await activeScanner({ file: input.file, head, digest, declaredType: input.declaredType, sizeBytes });
      scannerVerdict = result.malicious ? "malicious" : "clean";
      if (result.malicious) return block("scanner-verdict-malicious", sniffed);
    } catch {
      scannerVerdict = "unavailable";
      recordSecurityEvent({
        kind: "content-trust.scanner-unavailable",
        severity: "warning",
        tenantId: input.tenantId,
        detail: { digest, purpose: input.purpose },
      });
    }
  }

  const matchedSignature = accepted && sniffed && accepted.includes(sniffed);
  return {
    verdict: matchedSignature ? "clean" : "unverified",
    digest,
    sizeBytes,
    declaredType: input.declaredType,
    sniffedType: sniffed,
    scannerVerdict,
  };
}
