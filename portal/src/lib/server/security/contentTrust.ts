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
// What this is NOT: a malware scanner. A real AV/CDR engine is an external
// service the owner must connect (OWNER ACTION, tracked); the `setContentScanner`
// hook below is the seam it plugs into, so connecting one is a config change,
// not a redesign. Until then the honest verdict vocabulary is clean /
// unverified / blocked — never "scanned".

import crypto from "node:crypto";
import { recordSecurityEvent } from "./securityEvents";

export type ContentTrustReason =
  | "executable-content"
  | "active-content-polyglot"
  | "declared-type-mismatch"
  | "binary-masquerading-as-text"
  | "svg-active-content"
  | "scanner-verdict-malicious";

export interface ContentTrustAssessment {
  verdict: "clean" | "unverified" | "blocked";
  /** sha256 of the full byte stream — the artifact's identity. */
  digest: string;
  sizeBytes: number;
  declaredType: string;
  /** What the magic bytes say, when a signature matched. */
  sniffedType: string | null;
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
  head: Uint8Array;
  digest: string;
  declaredType: string;
  sizeBytes: number;
}) => Promise<{ malicious: boolean; detail?: string }>;

let scanner: ContentScanner | null = null;

/** Connect a real AV/CDR engine. Until one is connected, verdicts stay honest: clean-by-signature or unverified, never "scanned". */
export function setContentScanner(fn: ContentScanner | null): void {
  scanner = fn;
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

  const block = (reason: ContentTrustReason, sniffedType: string | null): ContentTrustAssessment => {
    const assessment: ContentTrustAssessment = {
      verdict: "blocked", digest, sizeBytes, declaredType: input.declaredType, sniffedType, reason,
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

  // 6. Optional external scanner (AV/CDR) — only a MALICIOUS verdict blocks;
  //    an unreachable scanner must not take uploads down with it, it just
  //    leaves the verdict at its signature-based level.
  if (scanner) {
    try {
      const result = await scanner({ head, digest, declaredType: input.declaredType, sizeBytes });
      if (result.malicious) return block("scanner-verdict-malicious", sniffed);
    } catch {
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
  };
}
